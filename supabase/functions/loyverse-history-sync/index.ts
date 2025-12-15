import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STORE_ID = '77f9b0db-9be9-4907-b4ec-9d68653f7a21';

// Business day starts at 5 AM Manila time
function getBusinessDayDates(dateStr: string): { start: Date; end: Date } {
  const date = new Date(dateStr + 'T05:00:00+08:00');
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);
  return { start: date, end: nextDay };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const loyverseToken = Deno.env.get('LOYVERSE_ACCESS_TOKEN');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    if (!loyverseToken) {
      throw new Error('LOYVERSE_ACCESS_TOKEN not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { days = 30 } = await req.json().catch(() => ({ days: 30 }));

    console.log(`📊 Starting historical sync for ${days} days...`);

    // Fetch payment types
    const paymentTypesResponse = await fetch('https://api.loyverse.com/v1.0/payment_types', {
      headers: { 'Authorization': `Bearer ${loyverseToken}` },
    });
    
    let paymentTypesMap: Record<string, string> = {};
    if (paymentTypesResponse.ok) {
      const paymentTypesData = await paymentTypesResponse.json();
      paymentTypesMap = (paymentTypesData.payment_types || []).reduce((acc: Record<string, string>, pt: { id: string; name: string }) => {
        acc[pt.id] = pt.name;
        return acc;
      }, {});
    }

    const results: { date: string; cashSales: number; totalSales: number; cost: number; status: string }[] = [];
    
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const { start, end } = getBusinessDayDates(dateStr);
      
      console.log(`📅 Processing ${dateStr}...`);
      
      try {
        // Fetch receipts for this day
        let dayReceipts: any[] = [];
        let cursor: string | null = null;

        while (true) {
          let url = `https://api.loyverse.com/v1.0/receipts?store_id=${STORE_ID}&created_at_min=${encodeURIComponent(start.toISOString())}&created_at_max=${encodeURIComponent(end.toISOString())}&limit=250`;
          if (cursor) url += `&cursor=${cursor}`;

          const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${loyverseToken}` },
          });

          if (!response.ok) {
            console.error(`❌ Error fetching ${dateStr}: ${response.status}`);
            break;
          }

          const data = await response.json();
          dayReceipts = dayReceipts.concat(data.receipts || []);
          cursor = data.cursor || null;
          if (!cursor) break;
        }

        // Calculate cash sales, total sales, and cost
        let cashSales = 0;
        let totalSales = 0;
        let totalCost = 0;
        
        dayReceipts.forEach((receipt: any) => {
          const isRefund = receipt.receipt_type === 'REFUND';
          
          // Calculate cost from line items
          let receiptCost = 0;
          (receipt.line_items || []).forEach((item: any) => {
            receiptCost += (item.cost || 0) * item.quantity;
          });
          
          // Add to totals
          if (isRefund) {
            totalSales -= Math.abs(receipt.total_money || 0);
            totalCost -= receiptCost;
          } else {
            totalSales += receipt.total_money || 0;
            totalCost += receiptCost;
          }
          
          // Calculate cash payments
          (receipt.payments || []).forEach((payment: any) => {
            const paymentName = paymentTypesMap[payment.payment_type_id] || '';
            if (paymentName.toLowerCase() === 'cash') {
              if (isRefund) {
                cashSales -= Math.abs(payment.money_amount || 0);
              } else {
                cashSales += payment.money_amount || 0;
              }
            }
          });
        });

        console.log(`💵 ${dateStr}: ${dayReceipts.length} receipts, Sales: ₱${Math.round(totalSales)}, Cost: ₱${Math.round(totalCost)}, Cash: ₱${Math.round(cashSales)}`);

        // Check if record exists to preserve expenses
        const { data: existingRecord } = await supabase
          .from('cash_register')
          .select('id, purchases, salaries, other_expenses')
          .eq('date', dateStr)
          .maybeSingle();

        // Upsert - preserve existing expenses
        const upsertData: Record<string, any> = {
          date: dateStr,
          expected_sales: Math.round(cashSales),
          cost: Math.round(totalCost),
        };
        
        if (!existingRecord) {
          upsertData.opening_balance = 0;
          upsertData.purchases = 0;
          upsertData.salaries = 0;
          upsertData.other_expenses = 0;
        }

        const { error: upsertError } = await supabase
          .from('cash_register')
          .upsert(upsertData, { 
            onConflict: 'date',
            ignoreDuplicates: false 
          });

        if (upsertError) {
          console.error(`❌ Error upserting ${dateStr}:`, upsertError.message);
          results.push({ date: dateStr, cashSales, totalSales, cost: totalCost, status: 'error: ' + upsertError.message });
        } else {
          results.push({ date: dateStr, cashSales, totalSales, cost: totalCost, status: 'synced' });
        }

        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (dayError) {
        const errMsg = dayError instanceof Error ? dayError.message : 'Unknown error';
        console.error(`❌ Error processing ${dateStr}:`, errMsg);
        results.push({ date: dateStr, cashSales: 0, totalSales: 0, cost: 0, status: 'error: ' + errMsg });
      }
    }

    // Sync to Google Sheets
    const GOOGLE_SHEETS_URL = Deno.env.get('GOOGLE_SHEETS_WEBHOOK_URL');
    let sheetsSynced = false;
    
    if (GOOGLE_SHEETS_URL) {
      try {
        console.log('📤 Syncing to Google Sheets...');
        
        const { data: allRecords } = await supabase
          .from('cash_register')
          .select('*')
          .order('date', { ascending: true });

        const { data: expenses } = await supabase
          .from('cash_expenses')
          .select('*')
          .order('created_at', { ascending: true });
        
        if (allRecords && allRecords.length > 0) {
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
          
          allRecords.forEach(r => {
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
          const totals = allRecords.reduce((acc, r) => ({
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

          // Expenses detail
          if (expenses && expenses.length > 0) {
            rows.push(['', '', '', '', '', '', '', '', '', '', '', '', '']);
            rows.push(['РАСХОДЫ (детализация)', '', '', '', '', '', '', '', '', '', '', '', '']);
            rows.push(['Дата', 'Категория', 'Сумма', 'Описание', '', '', '', '', '', '', '', '', '']);
            
            expenses.forEach(exp => {
              const record = allRecords.find(r => r.id === exp.cash_register_id);
              const date = record?.date || '';
              const categoryLabel = exp.category === 'purchases' ? 'Закупки' : 
                                   exp.category === 'salaries' ? 'Зарплаты' : 'Прочее';
              rows.push([date, categoryLabel, exp.amount, exp.description || '', '', '', '', '', '', '', '', '', '']);
            });
          }
          
          await fetch(GOOGLE_SHEETS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows, action: 'replace' }),
          });
          
          sheetsSynced = true;
          console.log(`✅ Synced ${allRecords.length} records to Google Sheets`);
        }
      } catch (sheetsError) {
        console.error('❌ Error syncing to Google Sheets:', sheetsError);
      }
    }

    const successCount = results.filter(r => r.status === 'synced').length;
    console.log(`✅ Historical sync complete: ${successCount}/${days} days synced`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Synced ${successCount} of ${days} days`,
        sheetsSynced,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error in historical sync:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
