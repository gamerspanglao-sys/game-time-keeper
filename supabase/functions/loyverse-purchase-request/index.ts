import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Case sizes for different product types
const CASE_SIZES: Record<string, number> = {
  'beer_liter': 6,      // Литровое пиво - 6 шт в ящике
  'beer_small': 24,     // Остальное пиво - 24 шт
  'water': 12,          // Вода - 12 шт
  'soft_drink': 24,     // Софт дринки - 24 шт
  'default': 12,        // По умолчанию
};

// Keywords to detect product type
function detectProductType(itemName: string): string {
  const name = itemName.toLowerCase();
  
  // Check for liter beer (1L, 1 liter, литр)
  if ((name.includes('beer') || name.includes('пиво') || name.includes('red horse') || name.includes('san miguel')) && 
      (name.includes('1l') || name.includes('1 l') || name.includes('литр') || name.includes('liter') || name.includes('1000'))) {
    return 'beer_liter';
  }
  
  // Check for other beer
  if (name.includes('beer') || name.includes('пиво') || name.includes('red horse') || name.includes('san miguel') || 
      name.includes('pilsen') || name.includes('pale') || name.includes('tower') || name.includes('basket')) {
    return 'beer_small';
  }
  
  // Check for water
  if (name.includes('water') || name.includes('вода') || name.includes('mineral')) {
    return 'water';
  }
  
  // Check for soft drinks
  if (name.includes('coke') || name.includes('cola') || name.includes('sprite') || name.includes('fanta') ||
      name.includes('soda') || name.includes('juice') || name.includes('mule') || name.includes('smirnoff')) {
    return 'soft_drink';
  }
  
  return 'default';
}

function getCaseSize(itemName: string): number {
  const productType = detectProductType(itemName);
  return CASE_SIZES[productType] || CASE_SIZES['default'];
}

interface SalesItem {
  name: string;
  totalQuantity: number;
  totalAmount: number;
  avgPerDay: number;
  recommendedQty: number;  // With 20% buffer
  caseSize: number;
  casesToOrder: number;
  productType: string;
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
        
        if (!itemSales[itemName]) {
          itemSales[itemName] = { quantity: 0, amount: 0 };
        }
        
        itemSales[itemName].quantity += lineItem.quantity || 0;
        itemSales[itemName].amount += lineItem.total_money || 0;
      }
    }

    // Calculate recommendations
    const recommendations: SalesItem[] = [];
    
    for (const [name, data] of Object.entries(itemSales)) {
      const avgPerDay = data.quantity / daysDiff;
      const recommendedQty = avgPerDay * 1.2; // +20% buffer
      const caseSize = getCaseSize(name);
      const casesToOrder = Math.ceil(recommendedQty / caseSize);
      const productType = detectProductType(name);
      
      recommendations.push({
        name,
        totalQuantity: data.quantity,
        totalAmount: data.amount,
        avgPerDay: Math.round(avgPerDay * 100) / 100,
        recommendedQty: Math.round(recommendedQty * 100) / 100,
        caseSize,
        casesToOrder: Math.max(0, casesToOrder),
        productType,
      });
    }

    // Sort by cases to order (descending)
    recommendations.sort((a, b) => b.casesToOrder - a.casesToOrder);

    console.log(`✅ Analyzed ${Object.keys(itemSales).length} items`);

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
