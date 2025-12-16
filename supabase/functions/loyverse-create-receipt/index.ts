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
}> = {
  // PlayStation
  'ps-1': { sku: '10079', price: 100 },
  'ps-2': { sku: '10079', price: 100 },
  // Billiard tables
  'table-1': { sku: '10001', price: 100 },
  'table-2': { sku: '10082', price: 100 },
  'table-3': { sku: '10083', price: 100 },
  // VIP rooms
  'vip-super': { sku: '10007', price: 400 },
  'vip-medium': { sku: '10080', price: 300 },
  'vip-comfort': { sku: '10081', price: 250 },
};

// Promo products configuration
const PROMO_CONFIG: Record<string, {
  sku: string;
  name: string;
  price: number;
}> = {
  'basket-redhorse': { sku: '136', name: 'Basket Red Horse', price: 1000 },
};

const STORE_ID = '77f9b0db-9be9-4907-b4ec-9d68653f7a21';

const PAYMENT_TYPES: Record<string, string> = {
  'cash': '857329b2-12ee-474d-adc5-2b6755406989',
  'gcash': 'a119edcb-3495-4bd1-a8a1-66508749fcbe',
  'prepaid': '857329b2-12ee-474d-adc5-2b6755406989',
  'postpaid': '857329b2-12ee-474d-adc5-2b6755406989',
};

// Cache for variant data to avoid repeated API calls
const variantCache: Record<string, { variant_id: string; item_name: string }> = {};

// Fetch ALL items from Loyverse and find by exact SKU match
async function findItemBySku(sku: string, token: string): Promise<{ variant_id: string; item_name: string } | null> {
  // Check cache first
  if (variantCache[sku]) {
    console.log(`📦 Using cached data for SKU ${sku}: ${variantCache[sku].item_name}`);
    return variantCache[sku];
  }

  console.log(`🔍 Fetching all items to find SKU: ${sku}`);
  
  try {
    // Fetch all items (Loyverse returns up to 250 per page)
    let allItems: any[] = [];
    let cursor: string | null = null;
    
    while (true) {
      const fetchUrl: string = cursor 
        ? `https://api.loyverse.com/v1.0/items?cursor=${cursor}&limit=250`
        : `https://api.loyverse.com/v1.0/items?limit=250`;
      
      const fetchResponse: Response = await fetch(fetchUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!fetchResponse.ok) {
        console.error(`❌ Failed to fetch items: ${fetchResponse.status}`);
        return null;
      }

      const fetchData: { items?: any[]; cursor?: string } = await fetchResponse.json();
      allItems = allItems.concat(fetchData.items || []);
      cursor = fetchData.cursor || null;
      
      console.log(`📦 Fetched ${fetchData.items?.length || 0} items, total: ${allItems.length}`);
      
      if (!cursor) break;
    }

    console.log(`📋 Total items in Loyverse: ${allItems.length}`);

    // Find item with exact SKU match
    for (const item of allItems) {
      if (item.variants && item.variants.length > 0) {
        for (const variant of item.variants) {
          if (variant.sku === sku) {
            const result = {
              variant_id: variant.variant_id,
              item_name: item.item_name
            };
            variantCache[sku] = result;
            console.log(`✅ Found item: "${item.item_name}" (variant_id: ${variant.variant_id}) for SKU: ${sku}`);
            return result;
          }
        }
      }
    }

    // Log all available SKUs for debugging
    const availableSkus = allItems.flatMap(item => 
      (item.variants || []).map((v: any) => `${v.sku} (${item.item_name})`)
    ).filter(Boolean);
    console.log(`📝 Available SKUs: ${availableSkus.slice(0, 20).join(', ')}...`);

    console.error(`❌ No item found with exact SKU: ${sku}`);
    return null;
  } catch (error) {
    console.error(`❌ Error fetching items:`, error);
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

    const { timerId, paymentType = 'cash', amount, promoId } = await req.json();

    console.log(`📝 Creating receipt for timer: ${timerId}, payment: ${paymentType}, promo: ${promoId || 'none'}`);

    // Handle promo receipt
    if (promoId) {
      const promoConfig = PROMO_CONFIG[promoId];
      if (!promoConfig) {
        console.log(`⚠️ Promo ${promoId} not configured`);
        return new Response(
          JSON.stringify({ success: true, skipped: true, message: `Promo ${promoId} not configured` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Find promo item by SKU
      const promoItemData = await findItemBySku(promoConfig.sku, loyverseToken);
      if (!promoItemData) {
        console.log(`⚠️ Skipping promo receipt - item with SKU ${promoConfig.sku} not found`);
        return new Response(
          JSON.stringify({ success: true, skipped: true, message: `Promo item not found` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const promoPrice = amount || promoConfig.price;
      const promoPaymentTypeId = PAYMENT_TYPES[paymentType] || PAYMENT_TYPES['cash'];

      const promoReceiptData = {
        store_id: STORE_ID,
        source: 'Gaming Timer App - Promo',
        receipt_type: 'SALE',
        line_items: [
          {
            variant_id: promoItemData.variant_id,
            quantity: 1,
            price: promoPrice,
          }
        ],
        payments: [
          {
            payment_type_id: promoPaymentTypeId,
            amount: promoPrice,
          }
        ],
        note: `PROMO: ${promoConfig.name} - Timer: ${timerId}`,
      };

      console.log('📤 Sending promo receipt to Loyverse:', JSON.stringify(promoReceiptData, null, 2));

      const promoResponse = await fetch('https://api.loyverse.com/v1.0/receipts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${loyverseToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(promoReceiptData),
      });

      const promoResponseText = await promoResponse.text();
      console.log(`📥 Loyverse promo response (${promoResponse.status}):`, promoResponseText);

      if (!promoResponse.ok) {
        throw new Error(`Loyverse API error: ${promoResponse.status} - ${promoResponseText}`);
      }

      const promoReceipt = JSON.parse(promoResponseText);
      console.log(`✅ Promo receipt created: ${promoReceipt.receipt_number}`);

      return new Response(
        JSON.stringify({
          success: true,
          receipt_number: promoReceipt.receipt_number,
          receipt_id: promoReceipt.id,
          total: promoReceipt.total_money,
          item_name: promoConfig.name,
          isPromo: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const timerConfig = TIMER_CONFIG[timerId];
    if (!timerConfig) {
      console.log(`⚠️ Timer ${timerId} not configured for Loyverse integration`);
      return new Response(
        JSON.stringify({ success: true, skipped: true, message: `Timer ${timerId} not configured` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find item by SKU (fetches all items and finds exact match)
    const itemData = await findItemBySku(timerConfig.sku, loyverseToken);
    if (!itemData) {
      console.log(`⚠️ Skipping receipt - item with SKU ${timerConfig.sku} not found in Loyverse`);
      return new Response(
        JSON.stringify({ success: true, skipped: true, message: `Item with SKU ${timerConfig.sku} not found in Loyverse` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const price = amount || timerConfig.price;
    const paymentTypeId = PAYMENT_TYPES[paymentType] || PAYMENT_TYPES['cash'];

    const receiptData = {
      store_id: STORE_ID,
      source: 'Gaming Timer App',
      receipt_type: 'SALE',
      line_items: [
        {
          variant_id: itemData.variant_id,
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
      note: `${itemData.item_name} - Timer: ${timerId}, Payment: ${paymentType}`,
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

    console.log(`✅ Receipt created: ${receipt.receipt_number} for "${itemData.item_name}"`);

    return new Response(
      JSON.stringify({
        success: true,
        receipt_number: receipt.receipt_number,
        receipt_id: receipt.id,
        total: receipt.total_money,
        item_name: itemData.item_name,
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
