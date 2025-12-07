import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuration for PlayStation 1 timer (ps-1)
// TODO: Extend this mapping for other timers
const TIMER_CONFIG: Record<string, {
  variant_id: string;
  price: number;
  item_name: string;
}> = {
  // PlayStation - using same Loyverse item
  'ps-1': {
    variant_id: '5d5b60bf-4562-42ed-a2c6-95dd5788034c',
    price: 100,
    item_name: 'PlayStation 1 - 1 hour',
  },
  'ps-2': {
    variant_id: '5d5b60bf-4562-42ed-a2c6-95dd5788034c',
    price: 100,
    item_name: 'PlayStation 2 - 1 hour',
  },
  // Billiard - using same Loyverse item for all tables
  'table-1': {
    variant_id: '5d5b60bf-4562-42ed-a2c6-95dd5788034c', // TODO: Update when Billiard item created
    price: 100,
    item_name: 'Table 1 - 1 hour',
  },
  'table-2': {
    variant_id: '5d5b60bf-4562-42ed-a2c6-95dd5788034c',
    price: 100,
    item_name: 'Table 2 - 1 hour',
  },
  'table-3': {
    variant_id: '5d5b60bf-4562-42ed-a2c6-95dd5788034c',
    price: 100,
    item_name: 'Table 3 - 1 hour',
  },
};

const STORE_ID = '77f9b0db-9be9-4907-b4ec-9d68653f7a21';

const PAYMENT_TYPES: Record<string, string> = {
  'cash': '857329b2-12ee-474d-adc5-2b6755406989',
  'gcash': 'a119edcb-3495-4bd1-a8a1-66508749fcbe',
  'prepaid': '857329b2-12ee-474d-adc5-2b6755406989', // Default to cash for prepaid
  'postpaid': '857329b2-12ee-474d-adc5-2b6755406989', // Default to cash for postpaid
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const loyverseToken = Deno.env.get('LOYVERSE_ACCESS_TOKEN');
    
    if (!loyverseToken) {
      throw new Error('LOYVERSE_ACCESS_TOKEN not configured');
    }

    const { timerId, paymentType = 'cash', amount } = await req.json();

    console.log(`📝 Creating receipt for timer: ${timerId}, payment: ${paymentType}`);

    // Get timer configuration
    const timerConfig = TIMER_CONFIG[timerId];
    if (!timerConfig) {
      console.log(`⚠️ Timer ${timerId} not configured for Loyverse integration`);
      return new Response(
        JSON.stringify({ success: false, message: `Timer ${timerId} not configured` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const price = amount || timerConfig.price;
    const paymentTypeId = PAYMENT_TYPES[paymentType] || PAYMENT_TYPES['cash'];

    // Create receipt
    const receiptData = {
      store_id: STORE_ID,
      source: 'Gaming Timer App',
      receipt_type: 'SALE',
      line_items: [
        {
          variant_id: timerConfig.variant_id,
          quantity: 1,
          price: price,
        }
      ],
      payments: [
        {
          payment_type_id: paymentTypeId,
          amount: price,
        }
      ],
      note: `Timer: ${timerId}, Payment: ${paymentType}`,
    };

    console.log('📤 Sending receipt to Loyverse:', JSON.stringify(receiptData, null, 2));

    const response = await fetch('https://api.loyverse.com/v1.0/receipts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${loyverseToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(receiptData),
    });

    const responseText = await response.text();
    console.log(`📥 Loyverse response (${response.status}):`, responseText);

    if (!response.ok) {
      throw new Error(`Loyverse API error: ${response.status} - ${responseText}`);
    }

    const receipt = JSON.parse(responseText);

    console.log('✅ Receipt created:', receipt.receipt_number);

    return new Response(
      JSON.stringify({
        success: true,
        receipt_number: receipt.receipt_number,
        receipt_id: receipt.id,
        total: receipt.total_money,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error creating receipt:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
