import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STORE_ID = '77f9b0db-9be9-4907-b4ec-9d68653f7a21';

// Get shift boundaries for a specific date and shift
// Day shift: 5AM - 5PM Manila time
// Night shift: 5PM - 5AM next day Manila time
function getShiftDates(dateStr: string, shift: 'day' | 'night'): { start: Date; end: Date } {
  if (shift === 'day') {
    // Day shift: 5AM to 5PM on same date
    const start = new Date(dateStr + 'T05:00:00+08:00');
    const end = new Date(dateStr + 'T17:00:00+08:00');
    return { start, end };
  } else {
    // Night shift: 5PM previous day to 5AM current day
    // For date 2025-12-16 night shift - it's from 2025-12-15 5PM to 2025-12-16 5AM
    const prevDay = new Date(dateStr);
    prevDay.setDate(prevDay.getDate() - 1);
    const prevDateStr = prevDay.toISOString().split('T')[0];
    
    const start = new Date(prevDateStr + 'T17:00:00+08:00');
    const end = new Date(dateStr + 'T05:00:00+08:00');
    return { start, end };
  }
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
    const { days = 7 } = await req.json().catch(() => ({ days: 7 }));

    console.log(`📊 Starting shift-based sync for ${days} days...`);

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
      console.log(`💳 Payment types: ${JSON.stringify(paymentTypesMap)}`);
    }

    const results: { date: string; shift: string; cashSales: number; gcashSales: number; totalSales: number; status: string }[] = [];
    
    // Process each day and each shift
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      // Process both shifts for each date
      for (const shift of ['day', 'night'] as const) {
        const { start, end } = getShiftDates(dateStr, shift);
        
        console.log(`📅 Processing ${dateStr} ${shift} shift (${start.toISOString()} - ${end.toISOString()})...`);
        
        try {
          // Fetch receipts for this shift
          let shiftReceipts: any[] = [];
          let cursor: string | null = null;

          while (true) {
            let url = `https://api.loyverse.com/v1.0/receipts?store_id=${STORE_ID}&created_at_min=${encodeURIComponent(start.toISOString())}&created_at_max=${encodeURIComponent(end.toISOString())}&limit=250`;
            if (cursor) url += `&cursor=${cursor}`;

            const response = await fetch(url, {
              headers: { 'Authorization': `Bearer ${loyverseToken}` },
            });

            if (!response.ok) {
              console.error(`❌ Error fetching ${dateStr} ${shift}: ${response.status}`);
              break;
            }

            const data = await response.json();
            shiftReceipts = shiftReceipts.concat(data.receipts || []);
            cursor = data.cursor || null;
            if (!cursor) break;
          }

          // Calculate sales by payment type
          let cashSales = 0;
          let gcashSales = 0;
          let totalSales = 0;
          let totalCost = 0;
          
          shiftReceipts.forEach((receipt: any) => {
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
            
            // Calculate payments by type
            (receipt.payments || []).forEach((payment: any) => {
              const paymentName = (paymentTypesMap[payment.payment_type_id] || '').toLowerCase();
              const amount = payment.money_amount || 0;
              
              if (paymentName === 'cash') {
                if (isRefund) {
                  cashSales -= Math.abs(amount);
                } else {
                  cashSales += amount;
                }
              } else if (paymentName === 'gcash' || paymentName === 'g-cash' || paymentName.includes('gcash')) {
                if (isRefund) {
                  gcashSales -= Math.abs(amount);
                } else {
                  gcashSales += amount;
                }
              }
            });
          });

          console.log(`💵 ${dateStr} ${shift}: ${shiftReceipts.length} receipts, Total: ₱${Math.round(totalSales)}, Cash: ₱${Math.round(cashSales)}, GCash: ₱${Math.round(gcashSales)}`);

          // Check if record exists for this date AND shift
          const { data: existingRecord } = await supabase
            .from('cash_register')
            .select('id, purchases, salaries, other_expenses, actual_cash, cash_actual, gcash_actual')
            .eq('date', dateStr)
            .eq('shift', shift)
            .maybeSingle();

          // Upsert - preserve existing expenses and actual cash entries
          const upsertData: Record<string, any> = {
            date: dateStr,
            shift: shift,
            expected_sales: Math.round(cashSales + gcashSales),
            cash_expected: Math.round(cashSales),
            gcash_expected: Math.round(gcashSales),
            cost: Math.round(totalCost),
          };
          
          if (!existingRecord) {
            upsertData.opening_balance = 0;
            upsertData.purchases = 0;
            upsertData.salaries = 0;
            upsertData.other_expenses = 0;
          }

          if (existingRecord) {
            // Update existing record
            const { error: updateError } = await supabase
              .from('cash_register')
              .update({
                expected_sales: upsertData.expected_sales,
                cash_expected: upsertData.cash_expected,
                gcash_expected: upsertData.gcash_expected,
                cost: upsertData.cost,
              })
              .eq('id', existingRecord.id);

            if (updateError) {
              console.error(`❌ Error updating ${dateStr} ${shift}:`, updateError.message);
              results.push({ date: dateStr, shift, cashSales, gcashSales, totalSales, status: 'error: ' + updateError.message });
            } else {
              results.push({ date: dateStr, shift, cashSales, gcashSales, totalSales, status: 'updated' });
            }
          } else {
            // Insert new record
            const { error: insertError } = await supabase
              .from('cash_register')
              .insert(upsertData);

            if (insertError) {
              console.error(`❌ Error inserting ${dateStr} ${shift}:`, insertError.message);
              results.push({ date: dateStr, shift, cashSales, gcashSales, totalSales, status: 'error: ' + insertError.message });
            } else {
              results.push({ date: dateStr, shift, cashSales, gcashSales, totalSales, status: 'created' });
            }
          }

          // Small delay between API calls
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (shiftError) {
          const errMsg = shiftError instanceof Error ? shiftError.message : 'Unknown error';
          console.error(`❌ Error processing ${dateStr} ${shift}:`, errMsg);
          results.push({ date: dateStr, shift, cashSales: 0, gcashSales: 0, totalSales: 0, status: 'error: ' + errMsg });
        }
      }
    }

    const successCount = results.filter(r => r.status === 'updated' || r.status === 'created').length;
    console.log(`✅ Shift sync complete: ${successCount}/${results.length} shifts synced`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Synced ${successCount} of ${results.length} shifts`,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error in shift sync:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
