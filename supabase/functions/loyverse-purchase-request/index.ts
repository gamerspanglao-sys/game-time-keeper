import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Product categories and case sizes
const PRODUCT_CONFIG: Record<string, { caseSize: number; category: string }> = {
  // Red Horse products
  'red horse 0,5': { caseSize: 12, category: 'beer' },
  'red horse 500': { caseSize: 12, category: 'beer' },
  'red horse 1': { caseSize: 6, category: 'beer' },
  'red horse 1l': { caseSize: 6, category: 'beer' },
  'beer tower red horse': { caseSize: 1, category: 'beer' },  // Tower is 1 unit
  'basket red horse': { caseSize: 1, category: 'beer' },      // Basket is 1 unit
  
  // San Miguel products
  'san miguel light': { caseSize: 24, category: 'beer' },
  'san miguel pale': { caseSize: 24, category: 'beer' },
  'san miguel pilsen': { caseSize: 24, category: 'beer' },
  
  // Soft drinks / cocktails
  'smirnoff mule': { caseSize: 24, category: 'drinks' },
  'smirnoff': { caseSize: 24, category: 'drinks' },
  
  // Water
  'water': { caseSize: 12, category: 'drinks' },
  
  // Ice - per bag/pack
  'ice': { caseSize: 1, category: 'supplies' },
  
  // Chips/Snacks
  'chips': { caseSize: 12, category: 'snacks' },
};

// Items to EXCLUDE from purchase orders (services, not products)
const EXCLUDED_ITEMS = [
  'billiard',
  'playstation',
  'vip super',
  'vip medium', 
  'vip comfort',
  'ps-1',
  'ps-2',
  'table-1',
  'table-2',
  'table-3',
  'timer',
  '1 hour',
  'hour',
];

function getProductConfig(itemName: string): { caseSize: number; category: string } | null {
  const name = itemName.toLowerCase();
  
  // Check if excluded
  for (const excluded of EXCLUDED_ITEMS) {
    if (name.includes(excluded)) {
      return null;
    }
  }
  
  // Try exact match first
  for (const [key, config] of Object.entries(PRODUCT_CONFIG)) {
    if (name.includes(key)) {
      return config;
    }
  }
  
  // Generic detection
  if (name.includes('red horse') && (name.includes('0,5') || name.includes('500') || name.includes('0.5'))) {
    return { caseSize: 12, category: 'beer' };
  }
  if (name.includes('red horse') && (name.includes('1l') || name.includes('1 l') || name.includes('liter'))) {
    return { caseSize: 6, category: 'beer' };
  }
  if (name.includes('red horse') || name.includes('san miguel') || name.includes('beer') || name.includes('pilsen') || name.includes('pale')) {
    return { caseSize: 24, category: 'beer' };
  }
  if (name.includes('water')) {
    return { caseSize: 12, category: 'drinks' };
  }
  if (name.includes('mule') || name.includes('smirnoff') || name.includes('cocktail')) {
    return { caseSize: 24, category: 'drinks' };
  }
  if (name.includes('chips') || name.includes('snack')) {
    return { caseSize: 12, category: 'snacks' };
  }
  if (name.includes('ice')) {
    return { caseSize: 1, category: 'supplies' };
  }
  if (name.includes('sandwich') || name.includes('food')) {
    return { caseSize: 1, category: 'food' };
  }
  
  // Default - include but with case size 1
  return { caseSize: 1, category: 'other' };
}

interface SalesItem {
  name: string;
  totalQuantity: number;
  totalAmount: number;
  avgPerDay: number;
  recommendedQty: number;
  caseSize: number;
  casesToOrder: number;
  unitsToOrder: number;
  category: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { startDate, endDate } = await req.json();
    const accessToken = Deno.env.get('LOYVERSE_ACCESS_TOKEN');
    
    if (!accessToken) {
      throw new Error('LOYVERSE_ACCESS_TOKEN not configured');
    }

    console.log(`📊 Analyzing sales from ${startDate} to ${endDate}`);

    // Calculate number of days in the period
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    console.log(`📅 Period: ${daysDiff} days`);

    // Fetch all receipts for the period
    const allReceipts: any[] = [];
    let cursor: string | null = null;
    
    do {
      const params = new URLSearchParams({
        created_at_min: startDate,
        created_at_max: endDate,
        limit: '250',
      });
      
      if (cursor) {
        params.append('cursor', cursor);
      }

      const response = await fetch(`https://api.loyverse.com/v1.0/receipts?${params}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Loyverse API error: ${response.status}`);
      }

      const data = await response.json();
      const receipts = data.receipts || [];
      allReceipts.push(...receipts);
      cursor = data.cursor || null;
      
      console.log(`📦 Fetched ${receipts.length} receipts, total: ${allReceipts.length}`);
    } while (cursor);

    // Aggregate sales by item
    const itemSales: Record<string, { quantity: number; amount: number }> = {};
    
    for (const receipt of allReceipts) {
      // Skip refunds
      if (receipt.receipt_type === 'REFUND') continue;
      
      for (const lineItem of receipt.line_items || []) {
        const itemName = lineItem.item_name || 'Unknown';
        
        // Skip excluded items
        const config = getProductConfig(itemName);
        if (!config) continue;
        
        if (!itemSales[itemName]) {
          itemSales[itemName] = { quantity: 0, amount: 0 };
        }
        
        itemSales[itemName].quantity += lineItem.quantity || 0;
        itemSales[itemName].amount += lineItem.total_money || 0;
      }
    }

    // Calculate recommendations for NEXT DAY
    const recommendations: SalesItem[] = [];
    
    for (const [name, data] of Object.entries(itemSales)) {
      const config = getProductConfig(name);
      if (!config) continue;
      
      const avgPerDay = data.quantity / daysDiff;
      const recommendedQty = Math.ceil(avgPerDay * 1.2); // +20% buffer, rounded up
      const unitsToOrder = Math.max(1, recommendedQty); // At least 1 unit
      const casesToOrder = Math.ceil(unitsToOrder / config.caseSize);
      
      // Only include items with actual sales
      if (data.quantity > 0) {
        recommendations.push({
          name,
          totalQuantity: data.quantity,
          totalAmount: data.amount,
          avgPerDay: Math.round(avgPerDay * 10) / 10,
          recommendedQty,
          caseSize: config.caseSize,
          casesToOrder,
          unitsToOrder,
          category: config.category,
        });
      }
    }

    // Sort by category then by units to order (descending)
    recommendations.sort((a, b) => {
      if (a.category !== b.category) {
        const categoryOrder = ['beer', 'drinks', 'snacks', 'supplies', 'food', 'other'];
        return categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
      }
      return b.unitsToOrder - a.unitsToOrder;
    });

    console.log(`✅ Analyzed ${recommendations.length} products (excluded services)`);

    return new Response(JSON.stringify({
      success: true,
      period: {
        startDate,
        endDate,
        days: daysDiff,
      },
      totalReceipts: allReceipts.length,
      recommendations,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('❌ Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
