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
  'red horse super': 6, // 1L bottles
  'san miguel 1l': 6,   // 1L bottles
  'san miguel light 1l': 6, // 1L bottles
  'san miguel light': 24, // small bottles
  'san miguel pale': 24,
  'san miguel pilsen': 24,
  'san miguel': 24,
  'tanduay': 12,
  'smirnoff mule': 24,
  'smirnoff': 24,
  'water': 12,
  'coke': 24,
  'sprite': 24,
  'royal': 24,
  '1l': 6,  // generic 1L = 6 per case
  'super': 6, // Red Horse Super = 1L = 6 per case
  'litr': 6,
};

// ============ INCLUSION LIST (explicit whitelist) ============
// Based on user answers: all beer, all Tanduay + other spirits, all soft drinks

function isIncluded(itemName: string): boolean {
  const name = itemName.toLowerCase();
  
  // EXCLUDE Heineken
  if (name.includes('heineken') || name.includes('henniken')) {
    return false;
  }
  
  // ==== BEER (all brands except Heineken) ====
  if (
    name.includes('red horse') ||
    name.includes('san miguel') ||
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
  
  // Exclude Heineken
  if (name.includes('heineken') || name.includes('henniken')) {
    return 'other';
  }
  
  // Beer
  if (
    name.includes('red horse') ||
    name.includes('san miguel') ||
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
  supplier: string;
  note?: string;
}

function getSupplier(category: string, itemName: string): string {
  const nameLower = itemName.toLowerCase();
  
  // Tanduay products go to Tanduay supplier
  if (nameLower.includes('tanduay')) {
    return 'Tanduay';
  }
  
  switch (category) {
    case 'beer':
      return 'San Miguel';
    case 'spirits':
      // Gin and other spirits go to Others
      return 'Others';
    case 'cocktails':
      // Rum Coke and other cocktails go to Others
      return 'Others';
    case 'soft':
      return 'Soft Drinks';
    default:
      return 'Others';
  }
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

    // Calculate 3 days period (user requested shorter average)
    const ANALYSIS_DAYS = 3;
    
    // Orders are placed on Monday, Wednesday, Friday
    // Delivery next day (except Sunday - no deliveries)
    // Calculate days until next delivery based on current day
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
    
    // Days until next delivery based on order schedule (Mon/Wed/Fri orders, next day delivery)
    // Mon order → Tue delivery, Wed order → Thu delivery, Fri order → Sat delivery
    // Need to stock until the NEXT delivery after that
    let DELIVERY_BUFFER_DAYS: number;
    let nextOrderDay: string;
    
    switch (dayOfWeek) {
      case 0: // Sunday - next order Monday, delivery Tuesday
        DELIVERY_BUFFER_DAYS = 2;
        nextOrderDay = 'Monday';
        break;
      case 1: // Monday - order today, delivery Tuesday, need stock until Thursday (Wed delivery)
        DELIVERY_BUFFER_DAYS = 2;
        nextOrderDay = 'Monday (today)';
        break;
      case 2: // Tuesday - next order Wednesday, delivery Thursday
        DELIVERY_BUFFER_DAYS = 2;
        nextOrderDay = 'Wednesday';
        break;
      case 3: // Wednesday - order today, delivery Thursday, need stock until Saturday (Fri delivery)
        DELIVERY_BUFFER_DAYS = 2;
        nextOrderDay = 'Wednesday (today)';
        break;
      case 4: // Thursday - next order Friday, delivery Saturday
        DELIVERY_BUFFER_DAYS = 2;
        nextOrderDay = 'Friday';
        break;
      case 5: // Friday - order today, delivery Saturday, need stock until Tuesday (Mon delivery) - 3 days!
        DELIVERY_BUFFER_DAYS = 3; // Sat, Sun, Mon → Tue
        nextOrderDay = 'Friday (today)';
        break;
      case 6: // Saturday - next order Monday, delivery Tuesday
        DELIVERY_BUFFER_DAYS = 3; // Sat, Sun, Mon → Tue
        nextOrderDay = 'Monday';
        break;
      default:
        DELIVERY_BUFFER_DAYS = 2;
        nextOrderDay = 'unknown';
    }
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - ANALYSIS_DAYS);
    startDate.setHours(5, 0, 0, 0);
    endDate.setHours(5, 0, 59, 999);

    console.log(`📊 Analyzing ${ANALYSIS_DAYS} days sales. Next order: ${nextOrderDay}, buffer: ${DELIVERY_BUFFER_DAYS} days`);

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
    let towerSales = 0; // Total tower sales
    let towerSalesRedHorse = 0; // Towers specifically Red Horse (regular 1L)
    let towerSalesRedHorseSuper = 0; // Towers specifically Red Horse Super 1L
    let towerSalesSanMiguel = 0; // Towers specifically San Miguel
    let towerSalesLight = 0; // Towers specifically San Miguel Light
    let basketSales = 0; // Total basket sales (all types)
    let basketSalesRedHorse = 0; // Baskets specifically with Red Horse
    let basketSalesSanMiguel = 0; // Baskets specifically with San Miguel
    let basketSalesLight = 0; // Baskets specifically with San Miguel Light
    
    // Tanduay consumption tracking
    let towerSalesTanduay = 0; // Towers with Tanduay (each = 400ml)
    let rumCokeSales = 0; // Rum Coke cocktails (each = 50ml)
    
    for (const receipt of allReceipts) {
      if (receipt.receipt_type === 'REFUND') continue;
      
      for (const lineItem of receipt.line_items || []) {
        const itemName = lineItem.item_name || 'Unknown';
        const qty = lineItem.quantity || 0;
        
        // Count towers separately and split by beer type (each tower = 2 x 1L bottles)
        // Tanduay tower = 400ml Tanduay
        if (isTower(itemName)) {
          const lower = itemName.toLowerCase();
          if (lower.includes('tanduay')) {
            towerSalesTanduay += qty;
          } else if (lower.includes('red horse') && lower.includes('super')) {
            towerSalesRedHorseSuper += qty;
          } else if (lower.includes('red horse')) {
            towerSalesRedHorse += qty;
          } else if (lower.includes('light')) {
            towerSalesLight += qty;
          } else if (lower.includes('san miguel')) {
            towerSalesSanMiguel += qty;
          }
          towerSales += qty;
          continue;
        }
        
        // Count Rum Coke sales (each = 50ml Tanduay)
        if (itemName.toLowerCase().includes('rum coke')) {
          rumCokeSales += qty;
          // Don't continue - also track as cocktail in itemSales
        }
        
        // Count baskets separately and split by beer type (each basket = 5 bottles of its beer)
        if (isBasket(itemName)) {
          const lower = itemName.toLowerCase();
          if (lower.includes('red horse')) {
            basketSalesRedHorse += qty;
          } else if (lower.includes('light')) {
            basketSalesLight += qty;
          } else if (lower.includes('san miguel')) {
            basketSalesSanMiguel += qty;
          }
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

    // Step 5: Create synthetic entries for 1L beers if towers were sold but no direct 1L sales exist
    // This ensures 1L positions appear in recommendations based on tower consumption
    
    // Find variant ID and stock by matching item name in Loyverse
    const findVariantByName = (patterns: string[], excludePatterns: string[] = []): { variantId: string; stock: number; realName: string } => {
      for (const [variantId, name] of Object.entries(variantToName)) {
        const nameLower = name.toLowerCase();
        const matchesAll = patterns.every(p => nameLower.includes(p.toLowerCase()));
        const matchesExclude = excludePatterns.some(p => nameLower.includes(p.toLowerCase()));
        if (matchesAll && !matchesExclude) {
          const stock = inventory[variantId] || 0;
          console.log(`🔍 Found match: "${name}" (variantId: ${variantId.slice(0,8)}..., stock: ${stock})`);
          return { variantId, stock, realName: name };
        }
      }
      return { variantId: '', stock: 0, realName: '' };
    };
    
    // Check if Red Horse 1L (regular) exists in sales
    const hasRedHorse1L = Object.keys(itemSales).some(k => {
      const n = k.toLowerCase();
      return n.includes('red horse') && !n.includes('super') && (n.includes('1l') || n.includes('1 l') || n.includes('1000') || n.includes('litr'));
    });
    if (!hasRedHorse1L && towerSalesRedHorse > 0) {
      const found = findVariantByName(['red horse', '1l'], ['super', '0,5', '500', '0.5']);
      itemSales['Red Horse 1L (from towers)'] = { 
        name: 'Red Horse 1L (from towers)', 
        variantId: found.variantId, 
        quantity: 0 
      };
      console.log(`✅ Created synthetic Red Horse 1L entry (${towerSalesRedHorse} towers sold, stock: ${found.stock})`);
    }
    
    // Check if Red Horse Super 1L exists in sales
    const hasRedHorseSuper1L = Object.keys(itemSales).some(k => {
      const n = k.toLowerCase();
      return n.includes('red horse') && n.includes('super') && !n.includes('tower');
    });
    if (!hasRedHorseSuper1L && towerSalesRedHorseSuper > 0) {
      const found = findVariantByName(['red horse', 'super', '1l'], ['tower', 'basket']);
      itemSales['Red Horse Super 1L (from towers)'] = { 
        name: 'Red Horse Super 1L (from towers)', 
        variantId: found.variantId, 
        quantity: 0 
      };
      console.log(`✅ Created synthetic Red Horse Super 1L entry (${towerSalesRedHorseSuper} towers sold, stock: ${found.stock})`);
    }
    
    // Check if 1L San Miguel exists in sales
    const hasSanMiguel1L = Object.keys(itemSales).some(k => {
      const n = k.toLowerCase();
      return n.includes('san miguel') && !n.includes('light') && (n.includes('1l') || n.includes('1 l') || n.includes('1000') || n.includes('litr'));
    });
    if (!hasSanMiguel1L && towerSalesSanMiguel > 0) {
      const found = findVariantByName(['san miguel', '1l'], ['light']);
      itemSales['San Miguel 1L (from towers)'] = { 
        name: 'San Miguel 1L (from towers)', 
        variantId: found.variantId, 
        quantity: 0 
      };
      console.log(`✅ Created synthetic San Miguel 1L entry (${towerSalesSanMiguel} towers sold, stock: ${found.stock})`);
    }
    
    // Check if 1L San Miguel Light exists in sales
    const hasLight1L = Object.keys(itemSales).some(k => {
      const n = k.toLowerCase();
      return n.includes('light') && (n.includes('1l') || n.includes('1 l') || n.includes('1000') || n.includes('litr'));
    });
    if (!hasLight1L && towerSalesLight > 0) {
      const found = findVariantByName(['light', '1l']);
      itemSales['San Miguel Light 1L (from towers)'] = { 
        name: 'San Miguel Light 1L (from towers)', 
        variantId: found.variantId, 
        quantity: 0 
      };
      console.log(`✅ Created synthetic SM Light 1L entry (${towerSalesLight} towers sold, stock: ${found.stock})`);
    }

    // Step 5b: Create synthetic Tanduay entry if towers/rum coke were sold
    // Tanduay bottle = 750ml, Tower = 400ml, Rum Coke = 50ml
    const tanduayMlFromTowers = towerSalesTanduay * 400;
    const tanduayMlFromRumCoke = rumCokeSales * 50;
    const totalTanduayMl = tanduayMlFromTowers + tanduayMlFromRumCoke;
    const tanduayBottlesNeeded = totalTanduayMl / 750; // Bottles consumed
    
    // Check if Tanduay Select already exists in sales
    const hasTanduaySelect = Object.keys(itemSales).some(k => {
      const n = k.toLowerCase();
      return n.includes('tanduay') && n.includes('select') && !n.includes('tower') && !n.includes('ice');
    });
    
    if (!hasTanduaySelect && totalTanduayMl > 0) {
      const found = findVariantByName(['tanduay', 'select'], ['tower', 'ice']);
      itemSales['Tanduay Select (from towers/cocktails)'] = { 
        name: 'Tanduay Select (from towers/cocktails)', 
        variantId: found.variantId, 
        quantity: 0 
      };
      console.log(`✅ Created synthetic Tanduay Select entry (${towerSalesTanduay} towers + ${rumCokeSales} rum cokes = ${Math.round(tanduayBottlesNeeded * 10) / 10} bottles, stock: ${found.stock})`);
    }
    
    console.log(`🥃 Tanduay: ${towerSalesTanduay} towers (${tanduayMlFromTowers}ml) + ${rumCokeSales} rum cokes (${tanduayMlFromRumCoke}ml) = ${totalTanduayMl}ml = ${Math.round(tanduayBottlesNeeded * 10) / 10} bottles`);

    // Step 6: Calculate recommendations
    const recommendations: SalesItem[] = [];
    
    // Calculate avg per day for proportional extra consumption
    const towersRedHorsePerDay = towerSalesRedHorse / ANALYSIS_DAYS;
    const towersRedHorseSuperPerDay = towerSalesRedHorseSuper / ANALYSIS_DAYS;
    const towersSanMiguelPerDay = towerSalesSanMiguel / ANALYSIS_DAYS;
    const towersLightPerDay = towerSalesLight / ANALYSIS_DAYS;
    const basketsRedHorsePerDay = basketSalesRedHorse / ANALYSIS_DAYS;
    const basketsSanMiguelPerDay = basketSalesSanMiguel / ANALYSIS_DAYS;
    const basketsLightPerDay = basketSalesLight / ANALYSIS_DAYS;
    
    // Tanduay consumption per day (in bottles - 750ml each)
    const tanduayBottlesPerDay = tanduayBottlesNeeded / ANALYSIS_DAYS;
    
    for (const [key, data] of Object.entries(itemSales)) {
      let extraPerDay = 0;
      let note = '';
      const nameLower = data.name.toLowerCase();
      
      // Check if this is a 1L beer position (including synthetic "from towers" entries)
      const is1LBeer = nameLower.includes('1l') || nameLower.includes('1 l') || 
                       nameLower.includes('1000') || nameLower.includes('litr') || 
                       nameLower.includes('from towers') || nameLower.includes('super');
      
      // Add tower consumption to Red Horse 1L (regular, not Super)
      if (nameLower.includes('red horse') && !nameLower.includes('super') && is1LBeer) {
        extraPerDay = towersRedHorsePerDay * 2; // Each Red Horse tower = 2 x 1L bottles per day
        if (towerSalesRedHorse > 0) {
          note = `+${Math.round(extraPerDay * 10) / 10}/day from RH towers (${towerSalesRedHorse} sold)`;
        }
      }
      
      // Add tower consumption to Red Horse Super 1L
      if (nameLower.includes('red horse') && nameLower.includes('super')) {
        extraPerDay = towersRedHorseSuperPerDay * 2; // Each RH Super tower = 2 x 1L bottles per day
        if (towerSalesRedHorseSuper > 0) {
          note = `+${Math.round(extraPerDay * 10) / 10}/day from RH Super towers (${towerSalesRedHorseSuper} sold)`;
        }
      }
      
      // Add tower consumption to 1L San Miguel (each tower = 2 x 1L bottles)
      if (nameLower.includes('san miguel') && !nameLower.includes('light') && is1LBeer) {
        extraPerDay = towersSanMiguelPerDay * 2; // Each SM tower = 2 x 1L bottles per day
        if (towerSalesSanMiguel > 0) {
          note = `+${Math.round(extraPerDay * 10) / 10}/day from SM towers (${towerSalesSanMiguel} sold)`;
          console.log(`🔍 SM 1L match: name="${data.name}", extraPerDay=${extraPerDay}`);
        }
      }
      
      // Add tower consumption to 1L San Miguel Light (each tower = 2 x 1L bottles)
      if (nameLower.includes('light') && is1LBeer) {
        extraPerDay = towersLightPerDay * 2; // Each Light tower = 2 x 1L bottles per day
        if (towerSalesLight > 0) {
          note = `+${Math.round(extraPerDay * 10) / 10}/day from Light towers (${towerSalesLight} sold)`;
        }
      }
      
      // Red Horse 0.5L from baskets (5 per basket, only baskets with Red Horse)
      if (nameLower.includes('red horse') && 
          (nameLower.includes('0,5') || nameLower.includes('500') || nameLower.includes('0.5'))) {
        extraPerDay = basketsRedHorsePerDay * 5;
        if (basketSalesRedHorse > 0) {
          note = `+${Math.round(extraPerDay * 10) / 10}/day from Red Horse baskets`;
        }
      }
      
      // San Miguel (regular small bottles) from baskets (5 per basket, only San Miguel baskets, NOT 1L)
      if (nameLower.includes('san miguel') && !nameLower.includes('light') && !is1LBeer) {
        extraPerDay = basketsSanMiguelPerDay * 5;
        if (basketSalesSanMiguel > 0) {
          note = `+${Math.round(extraPerDay * 10) / 10}/day from San Miguel baskets`;
        }
      }
      
      // San Miguel Light small bottles from baskets (5 per basket, only Light baskets, NOT 1L)
      if (nameLower.includes('san miguel') && nameLower.includes('light') && !is1LBeer) {
        extraPerDay = basketsLightPerDay * 5;
        if (basketSalesLight > 0) {
          note = `+${Math.round(extraPerDay * 10) / 10}/day from Light baskets`;
        }
      }
      
      // Tanduay Select from towers (400ml each) and Rum Coke (50ml each)
      // Tanduay bottle = 750ml
      if (nameLower.includes('tanduay') && nameLower.includes('select') && !nameLower.includes('ice')) {
        extraPerDay = tanduayBottlesPerDay; // Already calculated as bottles/day
        if (totalTanduayMl > 0) {
          const towersNote = towerSalesTanduay > 0 ? `${towerSalesTanduay} towers` : '';
          const rumCokeNote = rumCokeSales > 0 ? `${rumCokeSales} rum cokes` : '';
          const parts = [towersNote, rumCokeNote].filter(Boolean).join(' + ');
          note = `+${Math.round(extraPerDay * 10) / 10}/day from ${parts}`;
        }
      }
      
      // Calculate average per day (direct sales + extra from baskets/towers)
      const directAvgPerDay = data.quantity / ANALYSIS_DAYS;
      const totalAvgPerDay = directAvgPerDay + extraPerDay;
      
      // Recommended = avg per day * days to stock * 1.2 safety margin
      const daysToStock = 1 + DELIVERY_BUFFER_DAYS;
      const recommendedQty = Math.ceil(totalAvgPerDay * daysToStock * 1.2);
      const inStock = inventory[data.variantId] || 0;
      const toOrder = Math.max(0, recommendedQty - inStock);
      const caseSize = getCaseSize(data.name);
      const casesToOrder = caseSize > 1 ? Math.ceil(toOrder / caseSize) : toOrder;
      const category = getCategory(data.name) || 'other';
      const supplier = getSupplier(category, data.name);
      
      const totalSold = data.quantity + Math.round(extraPerDay * ANALYSIS_DAYS);
      
      if (data.quantity > 0 || extraPerDay > 0) {
        recommendations.push({
          name: data.name,
          totalQuantity: totalSold,
          avgPerDay: Math.round(totalAvgPerDay * 10) / 10,
          recommendedQty,
          inStock,
          toOrder,
          caseSize,
          casesToOrder,
          category,
          supplier,
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
    console.log(
      `🍺 Towers RH: ${towerSalesRedHorse}, SM: ${towerSalesSanMiguel}, Light: ${towerSalesLight}, Total: ${towerSales}`,
    );
    console.log(
      `🍺 Baskets RH: ${basketSalesRedHorse}, SM: ${basketSalesSanMiguel}, Light: ${basketSalesLight}, Total: ${basketSales}`,
    );

    return new Response(JSON.stringify({
      success: true,
      period: { days: ANALYSIS_DAYS, deliveryBuffer: DELIVERY_BUFFER_DAYS },
      totalReceipts: allReceipts.length,
      towerSales,
      towerSalesRedHorse,
      towerSalesSanMiguel,
      towerSalesLight,
      basketSales,
      basketSalesRedHorse,
      basketSalesSanMiguel,
      basketSalesLight,
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
