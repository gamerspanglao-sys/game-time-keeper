import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Маппинг товаров Loyverse → таймеры
const ITEM_MAPPING: Record<string, { timerId: string; duration: number }> = {
  "Table 1 - 1 hour": { timerId: "table-1", duration: 60 },
  "Table 2 - 1 hour": { timerId: "table-2", duration: 60 },
  "Table 3 - 1 hour": { timerId: "table-3", duration: 60 },
  "PlayStation 1 - 1 hour": { timerId: "ps-1", duration: 60 },
  "PlayStation 2 - 1 hour": { timerId: "ps-2", duration: 60 },
  "VIP Super - 1 hour": { timerId: "vip-super", duration: 60 },
  "VIP Medium - 1 hour": { timerId: "vip-medium", duration: 60 },
  "VIP Comfort - 1 hour": { timerId: "vip-comfort", duration: 60 },
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const loyverseToken = Deno.env.get('LOYVERSE_ACCESS_TOKEN');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!loyverseToken) {
      console.error('❌ LOYVERSE_ACCESS_TOKEN not set');
      return new Response(JSON.stringify({ error: 'Missing Loyverse token' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Получаем чеки за последние 2 минуты
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    
    console.log(`🔍 Fetching receipts since ${twoMinutesAgo}`);

    const receiptsResponse = await fetch(
      `https://api.loyverse.com/v1.0/receipts?created_at_min=${encodeURIComponent(twoMinutesAgo)}&limit=50`,
      {
        headers: {
          'Authorization': `Bearer ${loyverseToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!receiptsResponse.ok) {
      const errorText = await receiptsResponse.text();
      console.error('❌ Loyverse API error:', receiptsResponse.status, errorText);
      return new Response(JSON.stringify({ error: 'Loyverse API error', details: errorText }), {
        status: receiptsResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const receiptsData = await receiptsResponse.json();
    const receipts = receiptsData.receipts || [];
    
    console.log(`📦 Found ${receipts.length} receipts`);

    let timersStarted = 0;

    for (const receipt of receipts) {
      const lineItems = receipt.line_items || [];
      
      for (const item of lineItems) {
        const itemName = item.item_name;
        const mapping = ITEM_MAPPING[itemName];
        
        if (mapping) {
          console.log(`🎯 Found matching item: ${itemName} → ${mapping.timerId}`);
          
          // Проверяем, не запущен ли уже таймер
          const { data: existingTimer } = await supabase
            .from('timers')
            .select('status')
            .eq('id', mapping.timerId)
            .maybeSingle();
          
          if (existingTimer && existingTimer.status !== 'idle') {
            console.log(`⏭️ Timer ${mapping.timerId} already running, skipping`);
            continue;
          }
          
          // Определяем prepaid/postpaid
          const isPrepaid = item.total_money > 0;
          const durationMs = mapping.duration * 60 * 1000;
          const now = Date.now();
          
          // Запускаем таймер
          const { error: updateError } = await supabase
            .from('timers')
            .update({
              status: 'running',
              start_time: now,
              duration: durationMs,
              remaining_time: durationMs,
              remaining_at_start: durationMs,
              elapsed_time: 0,
              paid_amount: isPrepaid ? item.total_money : 0,
              unpaid_amount: isPrepaid ? 0 : item.total_money,
              updated_at: new Date().toISOString(),
            })
            .eq('id', mapping.timerId);
          
          if (updateError) {
            console.error(`❌ Failed to start timer ${mapping.timerId}:`, updateError);
            continue;
          }
          
          // Записываем в activity log
          const { data: timerData } = await supabase
            .from('timers')
            .select('name')
            .eq('id', mapping.timerId)
            .maybeSingle();
          
          await supabase.from('activity_log').insert({
            timer_id: mapping.timerId,
            timer_name: timerData?.name || mapping.timerId,
            action: 'started',
            timestamp: now,
          });
          
          console.log(`✅ Started timer ${mapping.timerId} via Loyverse POS`);
          timersStarted++;
        }
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      receiptsProcessed: receipts.length,
      timersStarted 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Error in loyverse-sync:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
