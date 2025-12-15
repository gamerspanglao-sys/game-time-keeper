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

// Get sheet names from the spreadsheet
async function getSheetNames(spreadsheetId: string, accessToken: string): Promise<string[]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  
  if (!response.ok) {
    console.log('Failed to get sheet info, using default names');
    return ['Касса', 'Зарплаты'];
  }
  
  const data = await response.json();
  const sheets = data.sheets?.map((s: any) => s.properties.title) || [];
  console.log(`📋 Found sheets: ${sheets.join(', ')}`);
  return sheets;
}

// Create a new sheet in the spreadsheet
async function createSheet(spreadsheetId: string, accessToken: string, sheetTitle: string): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [{
        addSheet: {
          properties: { title: sheetTitle }
        }
      }]
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error(`Failed to create sheet ${sheetTitle}:`, error);
  } else {
    console.log(`✅ Created sheet: ${sheetTitle}`);
  }
}

// Rename sheet
async function renameSheet(spreadsheetId: string, accessToken: string, oldName: string, newName: string): Promise<void> {
  // First get sheet ID
  const infoUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`;
  const infoResponse = await fetch(infoUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  
  if (!infoResponse.ok) return;
  
  const data = await infoResponse.json();
  const sheet = data.sheets?.find((s: any) => s.properties.title === oldName);
  if (!sheet) return;
  
  const sheetId = sheet.properties.sheetId;
  
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [{
        updateSheetProperties: {
          properties: { sheetId, title: newName },
          fields: 'title'
        }
      }]
    }),
  });
  console.log(`✅ Renamed sheet: ${oldName} -> ${newName}`);
}

// Clear and write data to a sheet
async function writeToSheet(spreadsheetId: string, accessToken: string, sheetName: string, rows: (string | number)[][]): Promise<void> {
  // Clear the sheet
  const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}:clear`;
  await fetch(clearUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  // Write new data
  const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A1?valueInputOption=RAW`;
  const updateResponse = await fetch(updateUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: rows }),
  });

  if (!updateResponse.ok) {
    const error = await updateResponse.text();
    throw new Error(`Failed to update sheet ${sheetName}: ${error}`);
  }
  
  const result = await updateResponse.json();
  console.log(`✅ Written ${result.updatedCells} cells to ${sheetName}`);
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

    // Get existing sheets
    const existingSheets = await getSheetNames(SPREADSHEET_ID, accessToken);
    
    // Ensure we have the right sheet names
    const CASH_SHEET = 'Касса';
    const PAYROLL_SHEET = 'Зарплаты';
    
    // Rename first sheet if needed
    if (existingSheets.length > 0 && existingSheets[0] !== CASH_SHEET && !existingSheets.includes(CASH_SHEET)) {
      await renameSheet(SPREADSHEET_ID, accessToken, existingSheets[0], CASH_SHEET);
    }
    
    // Create payroll sheet if doesn't exist
    const updatedSheets = await getSheetNames(SPREADSHEET_ID, accessToken);
    if (!updatedSheets.includes(PAYROLL_SHEET)) {
      await createSheet(SPREADSHEET_ID, accessToken, PAYROLL_SHEET);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ========== SHEET 1: КАССА (Cash Register) ==========
    console.log('📊 Fetching cash register data...');

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

    console.log(`📋 Found ${records?.length || 0} cash records, ${expenses?.length || 0} expenses`);

    // Build cash register rows
    // Expenses split: Returnable (purchases) vs Non-returnable (salaries, other)
    const cashHeaders = [
      'Дата',
      'Смена',
      'Продажи',
      'Себестоимость',
      'Валовая прибыль',
      '--- ОБОРОТНЫЕ ---',
      'Закупки',
      '--- НЕВОЗВРАТНЫЕ ---',
      'Зарплаты',
      'Прочие расходы',
      'Итого невозвратные',
      'Чистая прибыль',
      'Ожид. Cash',
      'Ожид. GCash',
      'Факт. Cash',
      'Факт. GCash',
      'Расхождение',
      'Статус'
    ];

    const cashRows: (string | number)[][] = [cashHeaders];
    
    if (records && records.length > 0) {
      records.forEach(r => {
        // Returnable expenses (working capital) - purchases that become inventory
        const returnableExp = r.purchases || 0;
        
        // Non-returnable expenses - salaries and other that don't come back
        const nonReturnableExp = (r.salaries || 0) + (r.other_expenses || 0);
        
        const grossProfit = (r.expected_sales || 0) - (r.cost || 0);
        // Net profit = Gross Profit - Non-returnable expenses (purchases excluded)
        const netProfit = grossProfit - nonReturnableExp;
        
        const shiftLabel = r.shift === 'day' ? '☀️ День' : '🌙 Ночь';
        
        // Calculate total discrepancy
        const cashDiff = (r.cash_actual ?? 0) - (r.cash_expected ?? 0);
        const gcashDiff = (r.gcash_actual ?? 0) - (r.gcash_expected ?? 0);
        const totalDisc = r.cash_actual !== null || r.gcash_actual !== null ? cashDiff + gcashDiff : null;
        
        let status = '';
        if (r.cash_actual === null && r.gcash_actual === null) {
          status = '⏳ Ожидает';
        } else if (totalDisc === 0) {
          status = '✅ OK';
        } else if (totalDisc !== null && totalDisc > 0) {
          status = '⬆️ Излишек';
        } else if (totalDisc !== null && totalDisc < 0) {
          status = '⬇️ Недостача';
        }
        
        cashRows.push([
          r.date,
          shiftLabel,
          r.expected_sales || 0,
          r.cost || 0,
          grossProfit,
          '',  // separator
          returnableExp,
          '',  // separator
          r.salaries || 0,
          r.other_expenses || 0,
          nonReturnableExp,
          netProfit,
          r.cash_expected || 0,
          r.gcash_expected || 0,
          r.cash_actual ?? '',
          r.gcash_actual ?? '',
          totalDisc ?? '',
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
        cashExp: acc.cashExp + (r.cash_expected || 0),
        gcashExp: acc.gcashExp + (r.gcash_expected || 0),
        cashAct: acc.cashAct + (r.cash_actual || 0),
        gcashAct: acc.gcashAct + (r.gcash_actual || 0),
      }), { sales: 0, cost: 0, purchases: 0, salaries: 0, other: 0, cashExp: 0, gcashExp: 0, cashAct: 0, gcashAct: 0 });

      const totalNonReturnable = totals.salaries + totals.other;
      const totalGrossProfit = totals.sales - totals.cost;
      const totalNetProfit = totalGrossProfit - totalNonReturnable;
      const totalDiscrepancy = (totals.cashAct - totals.cashExp) + (totals.gcashAct - totals.gcashExp);

      cashRows.push([
        'ИТОГО',
        '',
        totals.sales,
        totals.cost,
        totalGrossProfit,
        '',  // separator
        totals.purchases,
        '',  // separator
        totals.salaries,
        totals.other,
        totalNonReturnable,
        totalNetProfit,
        totals.cashExp,
        totals.gcashExp,
        totals.cashAct || '',
        totals.gcashAct || '',
        totalDiscrepancy || '',
        ''
      ]);

      // Expenses detail section with type grouping
      if (expenses && expenses.length > 0) {
        cashRows.push(Array(18).fill(''));
        cashRows.push(['РАСХОДЫ (детализация)', ...Array(17).fill('')]);
        
        // Returnable expenses section
        cashRows.push(['🔄 ОБОРОТНЫЕ (возвратные)', ...Array(17).fill('')]);
        cashRows.push(['Дата', 'Смена', 'Категория', 'Сумма', 'Описание', ...Array(13).fill('')]);
        const purchaseExp = expenses.filter(e => e.category === 'purchases');
        purchaseExp.forEach(exp => {
          const record = records.find(r => r.id === exp.cash_register_id);
          const date = record?.date || '';
          const shiftLabel = exp.shift === 'day' ? '☀️ День' : '🌙 Ночь';
          cashRows.push([date, shiftLabel, 'Закупки', exp.amount, exp.description || '', ...Array(13).fill('')]);
        });
        const totalPurchases = purchaseExp.reduce((sum, e) => sum + e.amount, 0);
        cashRows.push(['', '', 'Итого оборотные:', totalPurchases, '', ...Array(13).fill('')]);
        
        // Non-returnable expenses section
        cashRows.push(Array(18).fill(''));
        cashRows.push(['❌ НЕВОЗВРАТНЫЕ', ...Array(17).fill('')]);
        cashRows.push(['Дата', 'Смена', 'Категория', 'Сумма', 'Описание', ...Array(13).fill('')]);
        const nonReturnableExp = expenses.filter(e => e.category !== 'purchases');
        nonReturnableExp.forEach(exp => {
          const record = records.find(r => r.id === exp.cash_register_id);
          const date = record?.date || '';
          const shiftLabel = exp.shift === 'day' ? '☀️ День' : '🌙 Ночь';
          const categoryLabel = exp.category === 'salaries' ? 'Зарплаты' : 'Прочее';
          cashRows.push([date, shiftLabel, categoryLabel, exp.amount, exp.description || '', ...Array(13).fill('')]);
        });
        const totalNonRetExp = nonReturnableExp.reduce((sum, e) => sum + e.amount, 0);
        cashRows.push(['', '', 'Итого невозвратные:', totalNonRetExp, '', ...Array(13).fill('')]);
      }
    }

    await writeToSheet(SPREADSHEET_ID, accessToken, CASH_SHEET, cashRows);

    // ========== SHEET 2: ЗАРПЛАТЫ (Payroll) ==========
    console.log('📊 Fetching payroll data...');

    const { data: shifts } = await supabase
      .from('shifts')
      .select('*, employees(name)')
      .order('date', { ascending: false })
      .order('shift_start', { ascending: false });

    const { data: bonuses } = await supabase
      .from('bonuses')
      .select('*, employees(name)')
      .order('date', { ascending: false });

    console.log(`📋 Found ${shifts?.length || 0} shifts, ${bonuses?.length || 0} bonuses`);

    const payrollHeaders = [
      'Дата',
      'Сотрудник',
      'Смена',
      'Начало',
      'Конец',
      'Часы',
      'Переработка',
      'Опоздание',
      'База',
      'Бонусы',
      'Недостача',
      'Итого',
      'Статус'
    ];

    const payrollRows: (string | number)[][] = [payrollHeaders];

    if (shifts && shifts.length > 0) {
      shifts.forEach(s => {
        const employeeName = (s.employees as any)?.name || 'Unknown';
        
        // Convert to Manila time helper
        const toManilaTime = (ts: string | null): Date | null => {
          if (!ts) return null;
          const d = new Date(ts);
          const manilaOffset = 8 * 60; // 8 hours in minutes
          const utcTime = d.getTime() + (d.getTimezoneOffset() * 60000);
          return new Date(utcTime + (manilaOffset * 60000));
        };
        
        // Format times in Manila timezone
        const formatTimeManila = (ts: string | null) => {
          const manila = toManilaTime(ts);
          if (!manila) return '';
          return manila.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
        };
        
        const startTime = formatTimeManila(s.shift_start);
        const endTime = formatTimeManila(s.shift_end);
        
        // Determine shift type based on Manila start time
        let shiftLabel = '—';
        let isNightShift = false;
        let expectedHour = 5;
        
        if (s.shift_start) {
          const manilaStart = toManilaTime(s.shift_start);
          if (manilaStart) {
            const startHour = manilaStart.getHours();
            isNightShift = startHour >= 17 || startHour < 5;
            expectedHour = isNightShift ? 17 : 5;
            shiftLabel = isNightShift ? '🌙 Ночь (17-5)' : '☀️ День (5-17)';
          }
        }
        
        // Calculate hours worked
        const hoursWorked = s.total_hours || 0;
        
        // Calculate overtime (anything over 12 hours for standard shifts)
        const standardHours = 12;
        const overtime = hoursWorked > standardHours ? hoursWorked - standardHours : 0;
        
        // Calculate lateness (if started after expected time)
        let lateness = 0;
        if (s.shift_start) {
          const manilaStart = toManilaTime(s.shift_start);
          if (manilaStart) {
            const startHour = manilaStart.getHours();
            const startMinute = manilaStart.getMinutes();
            
            if (isNightShift) {
              // Night shift: expected at 17:00
              if (startHour >= 17 && (startHour > 17 || startMinute > 0)) {
                lateness = (startHour - 17) + (startMinute / 60);
              }
            } else {
              // Day shift: expected at 5:00
              if (startHour >= 5 && (startHour > 5 || startMinute > 0)) {
                lateness = (startHour - 5) + (startMinute / 60);
              }
            }
          }
        }
        
        // Get bonuses for this shift
        const shiftBonuses = bonuses?.filter(b => b.shift_id === s.id) || [];
        const totalBonuses = shiftBonuses.reduce((sum, b) => sum + (b.amount || 0), 0);
        
        // Cash discrepancy (negative means shortage)
        const cashShortage = s.cash_difference && s.cash_difference < 0 ? Math.abs(s.cash_difference) : 0;
        
        // Calculate total pay
        const baseSalary = s.base_salary || 500;
        const totalPay = baseSalary + totalBonuses - cashShortage;
        
        const status = s.status === 'closed' ? '✅ Закрыта' : '🔄 Активна';
        
        payrollRows.push([
          s.date,
          employeeName,
          shiftLabel,
          startTime,
          endTime,
          Number(hoursWorked).toFixed(1),
          overtime > 0 ? `+${overtime.toFixed(1)}h` : '',
          lateness > 0 ? `-${lateness.toFixed(1)}h` : '',
          baseSalary,
          totalBonuses || '',
          cashShortage || '',
          totalPay,
          status
        ]);
      });

      // Summary section
      const closedShifts = shifts.filter(s => s.status === 'closed');
      const totalHours = closedShifts.reduce((sum, s) => sum + (Number(s.total_hours) || 0), 0);
      const totalBase = closedShifts.reduce((sum, s) => sum + (s.base_salary || 500), 0);
      const allBonuses = bonuses?.reduce((sum, b) => sum + (b.amount || 0), 0) || 0;
      const totalShortage = closedShifts.reduce((sum, s) => sum + (s.cash_difference && s.cash_difference < 0 ? Math.abs(s.cash_difference) : 0), 0);
      
      payrollRows.push(Array(13).fill(''));
      payrollRows.push([
        'ИТОГО',
        `${closedShifts.length} смен`,
        '',
        '',
        '',
        totalHours.toFixed(1),
        '',
        '',
        totalBase,
        allBonuses,
        totalShortage,
        totalBase + allBonuses - totalShortage,
        ''
      ]);

      // Bonuses detail section
      if (bonuses && bonuses.length > 0) {
        payrollRows.push(Array(13).fill(''));
        payrollRows.push(['БОНУСЫ (детализация)', ...Array(12).fill('')]);
        payrollRows.push(['Дата', 'Сотрудник', 'Тип', 'Кол-во', 'Сумма', 'Комментарий', ...Array(7).fill('')]);
        
        bonuses.forEach(b => {
          const employeeName = (b.employees as any)?.name || 'Unknown';
          payrollRows.push([
            b.date,
            employeeName,
            b.bonus_type,
            b.quantity || 1,
            b.amount,
            b.comment || '',
            ...Array(7).fill('')
          ]);
        });
      }
    }

    await writeToSheet(SPREADSHEET_ID, accessToken, PAYROLL_SHEET, payrollRows);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Synced to Google Sheets: ${records?.length || 0} cash records, ${shifts?.length || 0} shifts`,
        cashRecords: records?.length || 0,
        shifts: shifts?.length || 0,
        bonuses: bonuses?.length || 0
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
