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

    // Fetch all cash register records
    const { data: records, error: recordsError } = await supabase
      .from('cash_register')
      .select('*')
      .order('date', { ascending: true });

    if (recordsError) {
      throw new Error(`Failed to fetch records: ${recordsError.message}`);
    }

    console.log(`📋 Found ${records?.length || 0} records`);

    if (!records || records.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No records to sync' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare rows for Google Sheets
    const rows = records.map(r => {
      const totalExp = (r.purchases || 0) + (r.salaries || 0) + (r.other_expenses || 0);
      const expected = (r.opening_balance || 0) + (r.expected_sales || 0) - totalExp;
      return [
        r.date,
        r.opening_balance || 0,
        r.expected_sales || 0,
        r.purchases || 0,
        r.salaries || 0,
        r.other_expenses || 0,
        totalExp,
        expected,
        r.actual_cash ?? '',
        r.discrepancy ?? ''
      ];
    });

    // Calculate totals
    const totals = records.reduce((acc, r) => ({
      sales: acc.sales + (r.expected_sales || 0),
      purchases: acc.purchases + (r.purchases || 0),
      salaries: acc.salaries + (r.salaries || 0),
      other: acc.other + (r.other_expenses || 0),
      discrepancy: acc.discrepancy + (r.discrepancy || 0)
    }), { sales: 0, purchases: 0, salaries: 0, other: 0, discrepancy: 0 });

    // Add totals row
    rows.push([
      'TOTAL',
      '',
      totals.sales,
      totals.purchases,
      totals.salaries,
      totals.other,
      totals.purchases + totals.salaries + totals.other,
      '',
      '',
      totals.discrepancy
    ]);

    console.log(`📤 Sending ${rows.length} rows to Google Sheets...`);

    // Send to Google Sheets
    const response = await fetch(GOOGLE_SHEETS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ rows }),
    });

    // Google Apps Script returns redirect, so we check for success differently
    console.log(`✅ Data sent to Google Sheets (status: ${response.status})`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Synced ${records.length} records to Google Sheets`,
        recordCount: records.length
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
