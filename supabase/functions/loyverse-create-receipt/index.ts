import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Timer configuration with Loyverse SKUs and prices
const TIMER_CONFIG: Record<string, {
  sku: string;
  price: number;
  item_name: string;
}> = {
  // PlayStation
  'ps-1': { sku: '10079', price: 100, item_name: 'PlayStation 1 - 1 hour' },
  'ps-2': { sku: '10079', price: 100, item_name: 'PlayStation 2 - 1 hour' },
  // Billiard tables
  'table-1': { sku: '10001', price: 100, item_name: 'Billiard Table 1 - 1 hour' },
  'table-2': { sku: '10082', price: 100, item_name: 'Billiard Table 2 - 1 hour' },
  'table-3': { sku: '10083', price: 100, item_name: 'Billiard Table 3 - 1 hour' },
  // VIP rooms
  'vip-super': { sku: '10007', price: 400, item_name: 'VIP Super - 1 hour' },
  'vip-medium': { sku: '10080', price: 300, item_name: 'VIP Medium - 1 hour' },
  'vip-comfort': { sku: '10081', price: 250, item_name: 'VIP Comfort - 1 hour' },
};

const STORE_ID = '77f9b0db-9be9-4907-b4ec-9d68653f7a21';

const PAYMENT_TYPES: Record<string, string> = {
  'cash': '857329b2-12ee-474d-adc5-2b6755406989',
  'gcash': 'a119edcb-3495-4bd1-a8a1-66508749fcbe',
  'prepaid': '857329b2-12ee-474d-adc5-2b6755406989',
  'postpaid': '857329b2-12ee-474d-adc5-2b6755406989',
};

// Cache for variant IDs to avoid repeated API calls
const variantCache: Record<string, string> = {};

async function getVariantIdBySku(sku: string, token: string): Promise<string | null> {
  // Check cache first
  if (variantCache[sku]) {
    console.log(`📦 Using cached variant_id for SKU ${sku}`);
    return variantCache[sku];
  }

  console.log(`🔍 Searching for item with SKU: ${sku}`);
  
  try {
    const response = await fetch(`https://api.loyverse.com/v1.0/items?sku=${sku}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      console.error(`❌ Failed to search items: ${response.status}`);
      return null;
    }

    const data = await response.json();
    console.log(`📋 Loyverse returned ${data.items?.length || 0} items for SKU ${sku}`);
    
    if (data.items && data.items.length > 0) {
      // Find item with EXACT SKU match
      for (const item of data.items) {
        if (item.variants && item.variants.length > 0) {
          for (const variant of item.variants) {
            if (variant.sku === sku) {
              variantCache[sku] = variant.variant_id;
              console.log(`✅ Found EXACT match: ${item.item_name} (variant_id: ${variant.variant_id}) for SKU: ${sku}`);
              return variant.variant_id;
            }
          }
        }
      }
      // Log what was found but didn't match
      const firstItem = data.items[0];
      const firstSku = firstItem.variants?.[0]?.sku;
      console.error(`❌ No exact SKU match. Searched: ${sku}, Found: ${firstItem.item_name} with SKU: ${firstSku}`);
    }

    console.error(`❌ No item found with SKU: ${sku}`);
    return null;
  } catch (error) {
    console.error(`❌ Error searching for SKU ${sku}:`, error);
    return null;
  }
}

serve(async (req) => {
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

    const timerConfig = TIMER_CONFIG[timerId];
    if (!timerConfig) {
      console.log(`⚠️ Timer ${timerId} not configured for Loyverse integration`);
      return new Response(
        JSON.stringify({ success: false, message: `Timer ${timerId} not configured` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get variant_id by SKU
    const variantId = await getVariantIdBySku(timerConfig.sku, loyverseToken);
    if (!variantId) {
      throw new Error(`Could not find Loyverse item with SKU: ${timerConfig.sku}`);
    }

    const price = amount || timerConfig.price;
    const paymentTypeId = PAYMENT_TYPES[paymentType] || PAYMENT_TYPES['cash'];

    const receiptData = {
      store_id: STORE_ID,
      source: 'Gaming Timer App',
      receipt_type: 'SALE',
      line_items: [
        {
          variant_id: variantId,
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
