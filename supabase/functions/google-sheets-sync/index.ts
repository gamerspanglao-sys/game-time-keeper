import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Get access token from Service Account
async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const serviceAccount = JSON.parse(serviceAccountJson);
  
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  // Base64url encode
  const base64UrlEncode = (obj: object) => {
    const json = JSON.stringify(obj);
    const base64 = btoa(json);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };

  const headerEncoded = base64UrlEncode(header);
  const claimEncoded = base64UrlEncode(claim);
  const signatureInput = `${headerEncoded}.${claimEncoded}`;

  // Import private key and sign
  const pemContents = serviceAccount.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '');
  
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signatureInput)
  );

  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  const jwt = `${signatureInput}.${signature}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenResponse.json();
  
  if (!tokenData.access_token) {
    throw new Error(`Failed to get access token: ${JSON.stringify(tokenData)}`);
  }
  
  return tokenData.access_token;
}

// Get the first sheet name from the spreadsheet
async function getFirstSheetName(spreadsheetId: string, accessToken: string): Promise<string> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  
  if (!response.ok) {
    console.log('Failed to get sheet info, using default name');
    return 'Лист1'; // Default Russian name
  }
  
  const data = await response.json();
  const sheetName = data.sheets?.[0]?.properties?.title || 'Лист1';
  console.log(`📋 Found sheet name: "${sheetName}"`);
  return sheetName;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SPREADSHEET_ID = Deno.env.get('GOOGLE_SHEETS_ID');
    const SERVICE_ACCOUNT_JSON = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
    
    if (!SPREADSHEET_ID) {
      throw new Error('GOOGLE_SHEETS_ID is not configured');
    }
    if (!SERVICE_ACCOUNT_JSON) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not configured');
    }

    console.log('🔑 Getting access token...');
    const accessToken = await getAccessToken(SERVICE_ACCOUNT_JSON);
    console.log('✅ Access token obtained');

    // Get the actual sheet name
    const sheetName = await getFirstSheetName(SPREADSHEET_ID, accessToken);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('📊 Fetching all cash register data...');

    const { data: records, error: recordsError } = await supabase
      .from('cash_register')
      .select('*')
      .order('date', { ascending: true })
      .order('shift', { ascending: true });

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

    // Headers - with shift column
    const headers = [
      'Дата',
      'Смена',
      'Доход (продажи)',
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
      
      const shiftLabel = r.shift === 'day' ? '☀️ День (5-17)' : '🌙 Ночь (17-5)';
      
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
        shiftLabel,
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
      '',
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
      rows.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '']);
      rows.push(['РАСХОДЫ (детализация)', '', '', '', '', '', '', '', '', '', '', '', '', '']);
      rows.push(['Дата', 'Смена', 'Категория', 'Сумма', 'Описание', '', '', '', '', '', '', '', '', '']);
      
      expenses.forEach(exp => {
        const record = records.find(r => r.id === exp.cash_register_id);
        const date = record?.date || '';
        const shiftLabel = exp.shift === 'day' ? '☀️ День' : '🌙 Ночь';
        const categoryLabel = exp.category === 'purchases' ? 'Закупки' : 
                             exp.category === 'salaries' ? 'Зарплаты' : 'Прочее';
        rows.push([date, shiftLabel, categoryLabel, exp.amount, exp.description || '', '', '', '', '', '', '', '', '', '']);
      });
    }

    console.log(`📤 Sending ${rows.length} rows to Google Sheets...`);

    // Step 1: Clear the sheet using correct range format
    const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}:clear`;
    const clearResponse = await fetch(clearUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!clearResponse.ok) {
      const clearError = await clearResponse.text();
      console.error('❌ Failed to clear sheet:', clearError);
      throw new Error(`Failed to clear sheet: ${clearError}`);
    }
    console.log('🧹 Sheet cleared');

    // Step 2: Write new data
    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}!A1?valueInputOption=RAW`;
    const updateResponse = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: rows,
      }),
    });

    if (!updateResponse.ok) {
      const updateError = await updateResponse.text();
      console.error('❌ Failed to update sheet:', updateError);
      throw new Error(`Failed to update sheet: ${updateError}`);
    }

    const result = await updateResponse.json();
    console.log(`✅ Data written to Google Sheets: ${result.updatedCells} cells updated`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Synced ${records.length} records to Google Sheets`,
        recordCount: records.length,
        expenseCount: expenses?.length || 0,
        cellsUpdated: result.updatedCells
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