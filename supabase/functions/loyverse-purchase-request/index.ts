import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Case sizes for products
const CASE_SIZES: Record<string, number> = {
  'red horse 0,5': 12,
  'red horse 500': 12,
  'red horse 0.5': 12,
  'red horse 1': 6,
  'red horse 1l': 6,
  'san miguel light': 24,
  'san miguel pale': 24,
  'san miguel pilsen': 24,
  'tanduay': 12,
  'smirnoff mule': 24,
  'smirnoff': 24,
  'water': 12,
  'coke': 24,
  'sprite': 24,
  'royal': 24,
};

// ============ INCLUSION LIST (explicit whitelist) ============
// Based on user answers: all beer, all Tanduay + other spirits, all soft drinks

function isIncluded(itemName: string): boolean {
  const name = itemName.toLowerCase();
  
  // ==== BEER (all brands) ====
  if (
    name.includes('red horse') ||
    name.includes('san miguel') ||
    name.includes('heineken') ||
    name.includes('henniken') ||
    name.includes('beer') ||
    name.includes('pilsen') ||
    name.includes('pale') ||
    name.includes('light') // San Miguel Light
  ) {
    return true;
  }
  
  // ==== SPIRITS (Tanduay + others like Absolut, Gin, Soju, Tequila) ====
  if (
    name.includes('tanduay') ||
    name.includes('absolut') ||
    name.includes('gin') ||
    name.includes('soju') ||
    name.includes('tequila') ||
    name.includes('vodka') ||
    name.includes('whiskey') ||
    name.includes('whisky') ||
    name.includes('brandy') ||
    name.includes('rum') // plain rum bottles, not Rum Coke
  ) {
    return true;
  }
  
  // ==== COCKTAILS (Smirnoff Mule, Rum Coke, etc.) ====
  if (
    name.includes('mule') ||
    name.includes('smirnoff') ||
    name.includes('rum coke')
  ) {
    return true;
  }
  
  // ==== SOFT DRINKS (all sizes - bottles, cans, big 1.75L, water, juices) ====
  if (
    name.includes('water') ||
    name.includes('coca cola') ||
    name.includes('coca-cola') ||
    name.includes('coke') ||
    name.includes('cola') ||
    name.includes('sprite') ||
    name.includes('royal') ||
    name.includes('tonic') ||
    name.includes('soda') ||
    name.includes('juice') ||
    name.includes('juce') ||
    name.includes('lemonade') ||
    name.includes('pepsi') ||
    name.includes('fanta') ||
    name.includes('zero') ||
    name.includes('iced tea') ||
    name.includes('ice tea') ||
    name.includes('nestea') ||
    name.includes('7up') ||
    name.includes('mountain dew') ||
    name.includes('schweppes')
  ) {
    return true;
  }
  
  return false;
}

function getCategory(itemName: string): string {
  const name = itemName.toLowerCase();
  
  // Beer
  if (
    name.includes('red horse') ||
    name.includes('san miguel') ||
    name.includes('heineken') ||
    name.includes('henniken') ||
    name.includes('beer') ||
    name.includes('pilsen') ||
    name.includes('pale') ||
    name.includes('light')
  ) {
    return 'beer';
  }
  
  // Spirits
  if (
    name.includes('tanduay') ||
    name.includes('absolut') ||
    name.includes('gin') ||
    name.includes('soju') ||
    name.includes('tequila') ||
    name.includes('vodka') ||
    name.includes('whiskey') ||
    name.includes('whisky') ||
    name.includes('brandy') ||
    name.includes('rum')
  ) {
    return 'spirits';
  }
  
  // Cocktails
  if (name.includes('mule') || name.includes('smirnoff') || name.includes('rum coke')) {
    return 'cocktails';
  }
  
  // Soft drinks
  return 'soft';
}

function isTower(itemName: string): boolean {
  return itemName.toLowerCase().includes('tower');
}

function isBasket(itemName: string): boolean {
  return itemName.toLowerCase().includes('basket');
}

function getCaseSize(itemName: string): number {
  const name = itemName.toLowerCase();
  
  for (const [key, size] of Object.entries(CASE_SIZES)) {
    if (name.includes(key)) return size;
  }
  
  // Red Horse sizes
  if (name.includes('red horse')) {
    if (name.includes('0,5') || name.includes('500') || name.includes('0.5')) return 12;
    if (name.includes('1l') || name.includes('1 l') || name.includes('1000')) return 6;
  }
  
  // Big bottles (1.5L, 1.75L, 2L) - typically 6-8 per case
  if (name.includes('1.5') || name.includes('1,5') || name.includes('1.75') || name.includes('1,75') || name.includes('2l') || name.includes('2 l')) {
    return 6;
  }
  
  if (name.includes('san miguel')) return 24;
  if (name.includes('tanduay')) return 12;
  if (name.includes('water')) return 12;
  if (name.includes('mule') || name.includes('smirnoff')) return 24;
  if (name.includes('coke') || name.includes('cola') || name.includes('sprite') || name.includes('royal')) return 24;
  
  return 12;
}

interface SalesItem {
  name: string;
  totalQuantity: number;
  avgPerDay: number;
  recommendedQty: number;
  inStock: number;
  toOrder: number;
  caseSize: number;
  casesToOrder: number;
  category: string;
  note?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const accessToken = Deno.env.get('LOYVERSE_ACCESS_TOKEN');
    
    if (!accessToken) {
      throw new Error('LOYVERSE_ACCESS_TOKEN not configured');
    }

    // Calculate 7 days period
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    startDate.setHours(5, 0, 0, 0);
    endDate.setHours(5, 0, 59, 999);

    console.log(`📊 Analyzing sales from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    // Step 1: Fetch current inventory
    console.log('📦 Fetching inventory...');
    const inventory: Record<string, number> = {};
    let inventoryCursor: string | null = null;
    
    do {
      const params = new URLSearchParams({ limit: '250' });
      if (inventoryCursor) params.append('cursor', inventoryCursor);

      try {
        const invResponse = await fetch(`https://api.loyverse.com/v1.0/inventory?${params}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        if (!invResponse.ok) break;

        const invText = await invResponse.text();
        if (!invText) break;
        
        const invData = JSON.parse(invText);
        for (const item of invData.inventory_levels || []) {
          if (item.in_stock > 0) {
            inventory[item.variant_id] = item.in_stock;
          }
        }
        inventoryCursor = invData.cursor || null;
      } catch (e) {
        console.log('⚠️ Inventory parse error');
        break;
      }
    } while (inventoryCursor);

    console.log(`📦 Found ${Object.keys(inventory).length} items in stock`);

    // Step 2: Fetch items to map variant_id to names
    console.log('📋 Fetching item names...');
    const variantToName: Record<string, string> = {};
    let itemsCursor: string | null = null;
    
    do {
      const params = new URLSearchParams({ limit: '250' });
      if (itemsCursor) params.append('cursor', itemsCursor);

      try {
        const itemsResponse = await fetch(`https://api.loyverse.com/v1.0/items?${params}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        if (!itemsResponse.ok) break;

        const itemsText = await itemsResponse.text();
        if (!itemsText) break;
        
        const itemsData = JSON.parse(itemsText);
        for (const item of itemsData.items || []) {
          for (const variant of item.variants || []) {
            variantToName[variant.variant_id] = item.item_name;
          }
        }
        itemsCursor = itemsData.cursor || null;
      } catch (e) {
        console.log('⚠️ Items parse error');
        break;
      }
    } while (itemsCursor);

    // Step 3: Fetch receipts
    console.log('🧾 Fetching receipts...');
    const allReceipts: any[] = [];
    let receiptsCursor: string | null = null;
    
    do {
      const params = new URLSearchParams({
        created_at_min: startDate.toISOString(),
        created_at_max: endDate.toISOString(),
        limit: '250',
      });
      if (receiptsCursor) params.append('cursor', receiptsCursor);

      const response = await fetch(`https://api.loyverse.com/v1.0/receipts?${params}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Loyverse API error: ${response.status} - ${errorText}`);
        throw new Error(`Loyverse API error: ${response.status}`);
      }

      const responseText = await response.text();
      if (!responseText) break;
      
      const data = JSON.parse(responseText);
      allReceipts.push(...(data.receipts || []));
      receiptsCursor = data.cursor || null;
      
      console.log(`📦 Fetched ${data.receipts?.length || 0} receipts, total: ${allReceipts.length}`);
    } while (receiptsCursor);

    // Step 4: Aggregate sales by item
    const itemSales: Record<string, { name: string; variantId: string; quantity: number }> = {};
    let towerSales = 0; // Count tower sales to add to 1L beer
    let basketSales = 0; // Count basket sales
    
    for (const receipt of allReceipts) {
      if (receipt.receipt_type === 'REFUND') continue;
      
      for (const lineItem of receipt.line_items || []) {
        const itemName = lineItem.item_name || 'Unknown';
        const qty = lineItem.quantity || 0;
        
        // Count towers separately (each tower = 2 x 1L bottles)
        if (isTower(itemName)) {
          towerSales += qty;
          continue;
        }
        
        // Count baskets separately (each basket = 5 x 0.5L bottles typically)
        if (isBasket(itemName)) {
          basketSales += qty;
          continue;
        }
        
        // Only include items from our whitelist (beer, spirits, cocktails, soft drinks)
        if (!isIncluded(itemName)) continue;
        
        const key = itemName; // Group by name
        if (!itemSales[key]) {
          itemSales[key] = { 
            name: itemName, 
            variantId: lineItem.variant_id || '',
            quantity: 0 
          };
        }
        itemSales[key].quantity += qty;
      }
    }

    // Step 5: Calculate recommendations
    const recommendations: SalesItem[] = [];
    const daysDiff = 7;
    
    for (const [key, data] of Object.entries(itemSales)) {
      let extraQty = 0;
      let note = '';
      
      // Add tower consumption to 1L Red Horse
      if (data.name.toLowerCase().includes('red horse') && 
          (data.name.toLowerCase().includes('1l') || data.name.toLowerCase().includes('1 l') || data.name.toLowerCase().includes('1000'))) {
        extraQty = towerSales * 2; // Each tower = 2 bottles
        if (towerSales > 0) {
          note = `+${towerSales} towers (${extraQty} bottles)`;
        }
      }
      
      // Add basket consumption to 0.5L Red Horse
      if (data.name.toLowerCase().includes('red horse') && 
          (data.name.toLowerCase().includes('0,5') || data.name.toLowerCase().includes('500') || data.name.toLowerCase().includes('0.5'))) {
        extraQty = basketSales * 5; // Each basket = 5 bottles (estimate)
        if (basketSales > 0) {
          note = `+${basketSales} baskets (${extraQty} bottles)`;
        }
      }
      
      const totalQty = data.quantity + extraQty;
      const avgPerDay = totalQty / daysDiff;
      const recommendedQty = Math.ceil(avgPerDay * 1.2); // +20% buffer
      const inStock = inventory[data.variantId] || 0;
      const toOrder = Math.max(0, recommendedQty - inStock);
      const caseSize = getCaseSize(data.name);
      const casesToOrder = caseSize > 1 ? Math.ceil(toOrder / caseSize) : toOrder;
      const category = getCategory(data.name) || 'other';
      
      if (totalQty > 0) {
        recommendations.push({
          name: data.name,
          totalQuantity: totalQty,
          avgPerDay: Math.round(avgPerDay * 10) / 10,
          recommendedQty,
          inStock,
          toOrder,
          caseSize,
          casesToOrder,
          category,
          note: note || undefined,
        });
      }
    }

    // Sort by category then by toOrder
    const categoryOrder = ['beer', 'spirits', 'cocktails', 'soft', 'other'];
    recommendations.sort((a, b) => {
      const catDiff = categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
      if (catDiff !== 0) return catDiff;
      return b.toOrder - a.toOrder;
    });

    console.log(`✅ Analyzed ${recommendations.length} products`);
    console.log(`🍺 Towers sold: ${towerSales}, Baskets sold: ${basketSales}`);

    return new Response(JSON.stringify({
      success: true,
      period: { days: daysDiff },
      totalReceipts: allReceipts.length,
      towerSales,
      basketSales,
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
