import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action } = await req.json();
    const accessToken = Deno.env.get('LOYVERSE_ACCESS_TOKEN');

    if (!accessToken) {
      throw new Error('LOYVERSE_ACCESS_TOKEN not configured');
    }

    // Fetch inventory from Loyverse
    if (action === 'inventory') {
      console.log('📦 Fetching inventory from Loyverse...');
      
      // Fetch items
      const itemsResponse = await fetch('https://api.loyverse.com/v1.0/items?limit=250', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!itemsResponse.ok) {
        throw new Error(`Loyverse items API error: ${itemsResponse.status}`);
      }

      const itemsData = await itemsResponse.json();
      const items = itemsData.items || [];

      // Fetch inventory levels
      const inventoryResponse = await fetch('https://api.loyverse.com/v1.0/inventory', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!inventoryResponse.ok) {
        throw new Error(`Loyverse inventory API error: ${inventoryResponse.status}`);
      }

      const inventoryData = await inventoryResponse.json();
      const inventoryLevels = inventoryData.inventory_levels || [];

      // Create a map of item_id to inventory
      const inventoryMap = new Map();
      for (const inv of inventoryLevels) {
        if (!inventoryMap.has(inv.variant_id)) {
          inventoryMap.set(inv.variant_id, 0);
        }
        inventoryMap.set(inv.variant_id, inventoryMap.get(inv.variant_id) + (inv.in_stock || 0));
      }

      // Fetch categories
      const categoriesResponse = await fetch('https://api.loyverse.com/v1.0/categories', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      const categoriesData = await categoriesResponse.json();
      const categories = categoriesData.categories || [];
      const categoryMap = new Map(categories.map((c: any) => [c.id, c.name]));

      // Combine items with inventory
      const inventory = items.flatMap((item: any) => {
        const variants = item.variants || [];
        return variants.map((variant: any) => ({
          item_id: variant.variant_id,
          item_name: variants.length > 1 ? `${item.item_name} (${variant.option1_value || ''})` : item.item_name,
          in_stock: inventoryMap.get(variant.variant_id) || 0,
          cost: variant.cost || 0,
          category_name: categoryMap.get(item.category_id) || null,
        }));
      });

      console.log(`✅ Found ${inventory.length} items`);

      return new Response(JSON.stringify({ 
        success: true, 
        inventory,
        count: inventory.length
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Default response for disabled sync
    console.log('ℹ️ loyverse-sync: no action specified');
    
    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Sync disabled - timers are started manually from the app',
      receiptsProcessed: 0,
      timersStarted: 0 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
