import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TelegramMessage {
  chat_id: string;
  text: string;
  parse_mode?: string;
}

async function sendTelegramMessage(text: string): Promise<boolean> {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID');
  
  if (!botToken || !chatId) {
    console.error('❌ TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured');
    return false;
  }
  
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
      } as TelegramMessage),
    });
    
    const result = await response.json();
    if (!result.ok) {
      console.error('❌ Telegram API error:', result);
      return false;
    }
    
    console.log('✅ Telegram message sent');
    return true;
  } catch (error) {
    console.error('❌ Failed to send Telegram message:', error);
    return false;
  }
}

async function fetchPurchaseData(): Promise<any> {
  const accessToken = Deno.env.get('LOYVERSE_ACCESS_TOKEN');
  if (!accessToken) throw new Error('LOYVERSE_ACCESS_TOKEN not configured');
  
  // Call loyverse-purchase-request directly via HTTP
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  
  const response = await fetch(`${supabaseUrl}/functions/v1/loyverse-purchase-request`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`,
      'apikey': supabaseKey,
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch purchase data: ${response.status}`);
  }
  
  return response.json();
}

async function fetchPaymentsData(startDate: string, endDate: string): Promise<any> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  
  const response = await fetch(`${supabaseUrl}/functions/v1/loyverse-payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`,
      'apikey': supabaseKey,
    },
    body: JSON.stringify({ startDate, endDate }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch payments data: ${response.status}`);
  }
  
  return response.json();
}

function formatPurchaseOrder(data: any): string {
  if (!data?.recommendations?.length) {
    return '📦 <b>Purchase Order</b>\n\nNo items need ordering!';
  }
  
  const itemsToOrder = data.recommendations.filter((item: any) => item.toOrder > 0);
  if (itemsToOrder.length === 0) {
    return '📦 <b>Purchase Order</b>\n\n✅ All items in stock!';
  }
  
  // Group by supplier
  const bySupplier: Record<string, any[]> = {};
  for (const item of itemsToOrder) {
    const supplier = item.supplier || 'Other';
    if (!bySupplier[supplier]) bySupplier[supplier] = [];
    bySupplier[supplier].push(item);
  }
  
  let message = `📦 <b>Purchase Order</b>\n`;
  message += `📊 Analysis: ${data.period?.days || 3} days\n`;
  message += `📅 Buffer: ${data.period?.deliveryBuffer || 2} days\n\n`;
  
  for (const [supplier, items] of Object.entries(bySupplier)) {
    const totalCases = items.reduce((sum: number, item: any) => sum + (item.casesToOrder || 0), 0);
    message += `<b>🏪 ${supplier}</b> (${totalCases} cases)\n`;
    
    for (const item of items) {
      const name = item.name.replace(/\s*\(from towers\)/gi, '').replace(/\s*\(from baskets\)/gi, '');
      message += `  • ${name}: <b>${item.casesToOrder}</b> cs (${item.caseSize})\n`;
    }
    message += '\n';
  }
  
  const totalUnits = itemsToOrder.reduce((sum: number, item: any) => sum + item.toOrder, 0);
  const totalCases = itemsToOrder.reduce((sum: number, item: any) => sum + item.casesToOrder, 0);
  message += `📊 <b>Total:</b> ${totalUnits} units / ${totalCases} cases`;
  
  return message;
}

function formatCashReport(data: any): string {
  if (!data?.summary) {
    return '💰 <b>Cash Report</b>\n\nNo data available';
  }
  
  const s = data.summary;
  let message = `💰 <b>Daily Cash Report</b>\n`;
  message += `📅 Period: 5:00 AM - 5:00 AM\n\n`;
  
  message += `💵 <b>Sales:</b> ₱${s.totalSales?.toLocaleString() || 0}\n`;
  message += `↩️ <b>Refunds:</b> ₱${s.totalRefunds?.toLocaleString() || 0}\n`;
  message += `📊 <b>Net:</b> ₱${s.netAmount?.toLocaleString() || 0}\n\n`;
  
  if (s.totalCost !== undefined) {
    message += `📦 <b>Cost:</b> ₱${s.totalCost?.toLocaleString() || 0}\n`;
    message += `📈 <b>Profit:</b> ₱${s.profit?.toLocaleString() || 0}\n\n`;
  }
  
  // Payment types breakdown
  if (data.payments?.length > 0) {
    message += `<b>By Payment Type:</b>\n`;
    for (const p of data.payments) {
      if (p.amount > 0) {
        message += `  • ${p.paymentType}: ₱${p.amount?.toLocaleString()}\n`;
      }
    }
  }
  
  return message;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action } = await req.json().catch(() => ({ action: 'test' }));
    
    console.log(`📱 Telegram notify action: ${action}`);
    
    let message = '';
    
    if (action === 'purchase' || action === 'all' || action === 'morning') {
      // Fetch purchase order data
      const purchaseData = await fetchPurchaseData();
      message += formatPurchaseOrder(purchaseData);
    }
    
    if (action === 'cash' || action === 'all' || action === 'morning') {
      // Calculate 5AM-5AM period for yesterday
      const now = new Date();
      const endDate = new Date(now);
      endDate.setHours(5, 0, 0, 0);
      if (now.getHours() < 5) {
        endDate.setDate(endDate.getDate()); // Today 5AM
      }
      
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 1); // Yesterday 5AM
      
      const cashData = await fetchPaymentsData(startDate.toISOString(), endDate.toISOString());
      
      if (message) message += '\n\n━━━━━━━━━━━━━━━━━━\n\n';
      message += formatCashReport(cashData);
    }
    
    if (action === 'test') {
      message = '🤖 <b>Test Message</b>\n\nTelegram notifications are working!\n\n';
      message += `📅 Time: ${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}`;
    }
    
    if (!message) {
      message = '❓ Unknown action. Use: test, purchase, cash, or morning';
    }
    
    const success = await sendTelegramMessage(message);
    
    return new Response(JSON.stringify({
      success,
      action,
      message: success ? 'Message sent' : 'Failed to send message',
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
