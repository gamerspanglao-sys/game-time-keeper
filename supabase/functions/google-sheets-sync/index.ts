import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GOOGLE_SHEETS_URL = Deno.env.get('GOOGLE_SHEETS_WEBHOOK_URL');
    if (!GOOGLE_SHEETS_URL) {
      throw new Error('GOOGLE_SHEETS_WEBHOOK_URL is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('📊 Fetching all cash register data...');

    const { data: records, error: recordsError } = await supabase
      .from('cash_register')
      .select('*')
      .order('date', { ascending: true });

    if (recordsError) {
      throw new Error(`Failed to fetch records: ${recordsError.message}`);
    }

    const { data: expenses } = await supabase
      .from('cash_expenses')
      .select('*')
      .order('created_at', { ascending: true });

    console.log(`📋 Found ${records?.length || 0} records, ${expenses?.length || 0} expenses`);

    if (!records || records.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No records to sync' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Headers
    const headers = [
      'Дата',
      'Продажи (касса)',
      'Себестоимость',
      'Валовая прибыль',
      'Закупки',
      'Зарплаты',
      'Прочие расходы',
      'Всего расходов',
      'Чистая прибыль',
      'Ожидаемая касса',
      'Фактическая касса',
      'Расхождение',
      'Статус'
    ];

    const rows: (string | number)[][] = [headers];
    
    records.forEach(r => {
      const totalExp = (r.purchases || 0) + (r.salaries || 0) + (r.other_expenses || 0);
      const grossProfit = (r.expected_sales || 0) - (r.cost || 0);
      const netProfit = grossProfit - totalExp;
      const expectedCash = (r.opening_balance || 0) + (r.expected_sales || 0) - totalExp;
      
      let status = '';
      if (r.actual_cash === null) {
        status = '⏳ Ожидает';
      } else if (r.discrepancy === 0) {
        status = '✅ OK';
      } else if (r.discrepancy !== null && r.discrepancy > 0) {
        status = '⬆️ Излишек';
      } else if (r.discrepancy !== null && r.discrepancy < 0) {
        status = '⬇️ Недостача';
      }
      
      rows.push([
        r.date,
        r.expected_sales || 0,
        r.cost || 0,
        grossProfit,
        r.purchases || 0,
        r.salaries || 0,
        r.other_expenses || 0,
        totalExp,
        netProfit,
        Math.round(expectedCash),
        r.actual_cash ?? '',
        r.discrepancy ?? '',
        status
      ]);
    });

    // Totals
    const totals = records.reduce((acc, r) => ({
      sales: acc.sales + (r.expected_sales || 0),
      cost: acc.cost + (r.cost || 0),
      purchases: acc.purchases + (r.purchases || 0),
      salaries: acc.salaries + (r.salaries || 0),
      other: acc.other + (r.other_expenses || 0),
      actual: acc.actual + (r.actual_cash || 0),
      discrepancy: acc.discrepancy + (r.discrepancy || 0)
    }), { sales: 0, cost: 0, purchases: 0, salaries: 0, other: 0, actual: 0, discrepancy: 0 });

    const totalExpenses = totals.purchases + totals.salaries + totals.other;
    const totalGrossProfit = totals.sales - totals.cost;
    const totalNetProfit = totalGrossProfit - totalExpenses;

    rows.push([
      'ИТОГО',
      totals.sales,
      totals.cost,
      totalGrossProfit,
      totals.purchases,
      totals.salaries,
      totals.other,
      totalExpenses,
      totalNetProfit,
      '',
      totals.actual || '',
      totals.discrepancy || '',
      ''
    ]);

    // Expenses detail section
    if (expenses && expenses.length > 0) {
      rows.push(['', '', '', '', '', '', '', '', '', '', '', '', '']);
      rows.push(['РАСХОДЫ (детализация)', '', '', '', '', '', '', '', '', '', '', '', '']);
      rows.push(['Дата', 'Категория', 'Сумма', 'Описание', '', '', '', '', '', '', '', '', '']);
      
      expenses.forEach(exp => {
        const record = records.find(r => r.id === exp.cash_register_id);
        const date = record?.date || '';
        const categoryLabel = exp.category === 'purchases' ? 'Закупки' : 
                             exp.category === 'salaries' ? 'Зарплаты' : 'Прочее';
        rows.push([date, categoryLabel, exp.amount, exp.description || '', '', '', '', '', '', '', '', '', '']);
      });
    }

    console.log(`📤 Sending ${rows.length} rows to Google Sheets...`);

    const response = await fetch(GOOGLE_SHEETS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    });

    console.log(`✅ Data sent to Google Sheets (status: ${response.status})`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Synced ${records.length} records to Google Sheets`,
        recordCount: records.length,
        expenseCount: expenses?.length || 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error syncing to Google Sheets:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
