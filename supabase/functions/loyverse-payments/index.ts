import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STORE_ID = '77f9b0db-9be9-4907-b4ec-9d68653f7a21';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const loyverseToken = Deno.env.get('LOYVERSE_ACCESS_TOKEN');
    
    if (!loyverseToken) {
      throw new Error('LOYVERSE_ACCESS_TOKEN not configured');
    }

    const { startDate, endDate } = await req.json();

    console.log(`📊 Fetching payments from ${startDate} to ${endDate}`);

    // Format dates for Loyverse API (ISO 8601)
    const createdAtMin = new Date(startDate).toISOString();
    const createdAtMax = new Date(endDate).toISOString();

    // Fetch receipts from Loyverse (both sales and refunds)
    let allReceipts: any[] = [];
    let cursor: string | null = null;

    while (true) {
      let url = `https://api.loyverse.com/v1.0/receipts?store_id=${STORE_ID}&created_at_min=${encodeURIComponent(createdAtMin)}&created_at_max=${encodeURIComponent(createdAtMax)}&limit=250`;
      
      if (cursor) {
        url += `&cursor=${cursor}`;
      }

      console.log(`📥 Fetching receipts batch...`);

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${loyverseToken}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Loyverse API error: ${response.status} - ${errorText}`);
        throw new Error(`Loyverse API error: ${response.status}`);
      }

      const data = await response.json();
      allReceipts = allReceipts.concat(data.receipts || []);
      cursor = data.cursor || null;

      console.log(`📦 Fetched ${data.receipts?.length || 0} receipts, total: ${allReceipts.length}`);

      if (!cursor) break;
    }

    // Fetch payment types to get names
    const paymentTypesResponse = await fetch('https://api.loyverse.com/v1.0/payment_types', {
      headers: {
        'Authorization': `Bearer ${loyverseToken}`,
      },
    });

    let paymentTypesMap: Record<string, string> = {};
    if (paymentTypesResponse.ok) {
      const paymentTypesData = await paymentTypesResponse.json();
      paymentTypesMap = (paymentTypesData.payment_types || []).reduce((acc: any, pt: any) => {
        acc[pt.id] = pt.name;
        return acc;
      }, {});
      console.log(`💳 Payment types loaded: ${Object.keys(paymentTypesMap).length}`);
    }

    // Categorize items
    function getItemCategory(itemName: string): string {
      const name = itemName.toLowerCase();
      if (name.includes('billiard') || name.includes('table') || name.includes('bilyar')) return 'billiards';
      if (name.includes('vip') || name.includes('room') || name.includes('playstation') || name.includes('ps')) return 'vip';
      return 'bar';
    }

    // Process receipts to extract payment information
    let totalCost = 0;
    let totalRevenue = 0;

    const payments = allReceipts.map((receipt: any) => {
      const paymentDetails = (receipt.payments || []).map((p: any) => ({
        type: paymentTypesMap[p.payment_type_id] || 'Unknown',
        typeId: p.payment_type_id,
        amount: p.money_amount || 0,
      }));

      let itemCost = 0;
      const items = (receipt.line_items || []).map((item: any) => {
        const cost = (item.cost || 0) * item.quantity;
        itemCost += cost;
        return {
          name: item.item_name,
          quantity: item.quantity,
          price: item.price,
          total: item.total_money,
          cost: item.cost || 0,
          totalCost: cost,
          category: getItemCategory(item.item_name),
        };
      });

      // Determine if it's a refund
      const isRefund = receipt.receipt_type === 'REFUND';
      
      if (!isRefund) {
        totalCost += itemCost;
        totalRevenue += receipt.total_money;
      } else {
        totalCost -= itemCost;
        totalRevenue -= Math.abs(receipt.total_money);
      }

      return {
        id: receipt.receipt_number,
        date: receipt.created_at,
        total: isRefund ? -Math.abs(receipt.total_money) : receipt.total_money,
        cost: isRefund ? -itemCost : itemCost,
        profit: isRefund ? -(receipt.total_money - itemCost) : (receipt.total_money - itemCost),
        payments: paymentDetails,
        items,
        note: receipt.note,
        source: receipt.source,
        isRefund,
        refundFor: receipt.refund_for,
      };
    });

    // Separate sales and refunds
    const sales = payments.filter((p: any) => !p.isRefund);
    const refunds = payments.filter((p: any) => p.isRefund);

    // Calculate by category
    const byCategory: Record<string, { sales: number; refunds: number; cost: number; count: number }> = {
      billiards: { sales: 0, refunds: 0, cost: 0, count: 0 },
      vip: { sales: 0, refunds: 0, cost: 0, count: 0 },
      bar: { sales: 0, refunds: 0, cost: 0, count: 0 },
    };

    payments.forEach((payment: any) => {
      payment.items.forEach((item: any) => {
        const cat = item.category;
        if (payment.isRefund) {
          byCategory[cat].refunds += Math.abs(item.total);
        } else {
          byCategory[cat].sales += item.total;
          byCategory[cat].cost += item.totalCost;
          byCategory[cat].count += item.quantity;
        }
      });
    });

    // Calculate summary with profit
    const summary = {
      totalReceipts: sales.length,
      totalRefunds: refunds.length,
      totalAmount: sales.reduce((sum: number, p: any) => sum + p.total, 0),
      totalRefundAmount: refunds.reduce((sum: number, p: any) => sum + Math.abs(p.total), 0),
      netAmount: payments.reduce((sum: number, p: any) => sum + p.total, 0),
      totalCost,
      totalProfit: totalRevenue - totalCost,
      byCategory,
      byPaymentType: {} as Record<string, { count: number; amount: number; refundCount: number; refundAmount: number }>,
    };

    // Group by payment type
    payments.forEach((payment: any) => {
      payment.payments.forEach((p: any) => {
        if (!summary.byPaymentType[p.type]) {
          summary.byPaymentType[p.type] = { count: 0, amount: 0, refundCount: 0, refundAmount: 0 };
        }
        if (payment.isRefund) {
          summary.byPaymentType[p.type].refundCount++;
          summary.byPaymentType[p.type].refundAmount += Math.abs(p.amount);
        } else {
          summary.byPaymentType[p.type].count++;
          summary.byPaymentType[p.type].amount += p.amount;
        }
      });
    });

    console.log(`✅ Processed ${sales.length} sales, ${refunds.length} refunds`);
    console.log(`💰 Summary:`, JSON.stringify(summary, null, 2));

    return new Response(
      JSON.stringify({
        success: true,
        payments,
        summary,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error fetching payments:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});