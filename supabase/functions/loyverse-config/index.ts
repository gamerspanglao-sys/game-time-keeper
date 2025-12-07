import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    console.log('📡 Fetching Loyverse configuration...');

    // 1. Get stores
    const storesResponse = await fetch('https://api.loyverse.com/v1.0/stores', {
      headers: {
        'Authorization': `Bearer ${loyverseToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!storesResponse.ok) {
      const errorText = await storesResponse.text();
      console.error('Stores API error:', errorText);
      throw new Error(`Failed to fetch stores: ${storesResponse.status}`);
    }

    const storesData = await storesResponse.json();
    console.log('✅ Stores:', JSON.stringify(storesData, null, 2));

    // 2. Get item 10079 (PlayStation 1 hour)
    const itemResponse = await fetch('https://api.loyverse.com/v1.0/items/10079', {
      headers: {
        'Authorization': `Bearer ${loyverseToken}`,
        'Content-Type': 'application/json',
      },
    });

    let itemData = null;
    if (itemResponse.ok) {
      itemData = await itemResponse.json();
      console.log('✅ Item 10079:', JSON.stringify(itemData, null, 2));
    } else {
      console.log('⚠️ Item 10079 not found by ID, trying to search...');
      
      // Try fetching all items to find PlayStation
      const allItemsResponse = await fetch('https://api.loyverse.com/v1.0/items?limit=250', {
        headers: {
          'Authorization': `Bearer ${loyverseToken}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (allItemsResponse.ok) {
        const allItems = await allItemsResponse.json();
        console.log(`📦 Found ${allItems.items?.length || 0} items`);
        
        // Find PlayStation items
        const psItems = allItems.items?.filter((item: any) => 
          item.item_name?.toLowerCase().includes('playstation') ||
          item.item_name?.toLowerCase().includes('ps') ||
          item.item_name?.toLowerCase().includes('плейстейшн')
        );
        
        console.log('🎮 PlayStation items:', JSON.stringify(psItems, null, 2));
        itemData = { searched_items: psItems, all_items_count: allItems.items?.length };
      }
    }

    // 3. Get payment types
    const paymentTypesResponse = await fetch('https://api.loyverse.com/v1.0/payment_types', {
      headers: {
        'Authorization': `Bearer ${loyverseToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!paymentTypesResponse.ok) {
      const errorText = await paymentTypesResponse.text();
      console.error('Payment types API error:', errorText);
      throw new Error(`Failed to fetch payment types: ${paymentTypesResponse.status}`);
    }

    const paymentTypesData = await paymentTypesResponse.json();
    console.log('✅ Payment types:', JSON.stringify(paymentTypesData, null, 2));

    const result = {
      stores: storesData.stores || [],
      store_id: storesData.stores?.[0]?.id || null,
      item: itemData,
      payment_types: paymentTypesData.payment_types || [],
    };

    console.log('📋 Final configuration:', JSON.stringify(result, null, 2));

    return new Response(JSON.stringify(result, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
