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

async function generateJokeForRobelyn(): Promise<string> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  
  // Fallback jokes if AI fails
  const fallbackJokes = [
    "🎯 Robelyn, лучше заказать лишнее, чем объясняться с боссом! 😅",
    "⏰ Robelyn, запас карман не тянет, а вот пустой склад — тянет нервы! 🍺",
    "💪 Robelyn, закажи побольше — босс любит когда есть запас! 🏆",
    "📦 Robelyn, помни: лучше склад ломится, чем клиенты уходят! 😤",
    "🚨 Robelyn, не злить босса = заказать вовремя! Простая математика! 📱",
  ];
  
  if (!apiKey) {
    return fallbackJokes[Math.floor(Math.random() * fallbackJokes.length)];
  }
  
  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          {
            role: 'system',
            content: `Напиши КОРОТКУЮ смешную фразу (максимум 15 слов) для Robelyn про заказ товара в бар GAMERS.

Стиль: практичный юмор про запасы, босса, склад. НЕ абстрактный. 1-2 эмодзи.

Темы на выбор:
- Лучше заказать больше, чем злить босса
- Запас карман не тянет
- Пустой склад = проблемы с боссом
- Клиенты без пива = грустные клиенты
- Закажи сегодня, завтра скажешь спасибо

Примеры хороших шуток:
- "Robelyn, запас — это любовь босса! Закажи побольше 📦"
- "Лучше лишний ящик, чем лишний разговор с боссом 😅"
- "Robelyn, пустой склад = злой босс. Простая математика! 🧮"
- "Запас карман не тянет, а вот нервы босса — ещё как! 💪"

Выведи ТОЛЬКО шутку, ничего больше.`
          },
          {
            role: 'user',
            content: 'Напиши смешное напоминание про заказ товара'
          }
        ],
      }),
    });
    
    if (!response.ok) {
      console.error('AI API error:', response.status);
      return fallbackJokes[Math.floor(Math.random() * fallbackJokes.length)];
    }
    
    const data = await response.json();
    const joke = data.choices?.[0]?.message?.content?.trim();
    
    if (joke) {
      console.log('🤖 Generated joke:', joke);
      return joke;
    }
    
    return fallbackJokes[Math.floor(Math.random() * fallbackJokes.length)];
  } catch (error) {
    console.error('Error generating joke:', error);
    return fallbackJokes[Math.floor(Math.random() * fallbackJokes.length)];
  }
}

async function formatPurchaseOrder(data: any): Promise<string> {
  if (!data?.recommendations?.length) {
    return '📦 <b>PURCHASE ORDER</b>\n\n✅ All items in stock!';
  }
  
  const itemsToOrder = data.recommendations.filter((item: any) => item.toOrder > 0);
  if (itemsToOrder.length === 0) {
    return '📦 <b>PURCHASE ORDER</b>\n\n✅ All items in stock!';
  }
  
  // Group by supplier
  const bySupplier: Record<string, any[]> = {};
  for (const item of itemsToOrder) {
    const supplier = item.supplier || 'Other';
    if (!bySupplier[supplier]) bySupplier[supplier] = [];
    bySupplier[supplier].push(item);
  }
  
  const joke = await generateJokeForRobelyn();
  
  let message = `📦 <b>PURCHASE ORDER</b>\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `${joke}\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `📊 Analysis: ${data.period?.days || 3} days\n`;
  message += `📅 Delivery buffer: ${data.period?.deliveryBuffer || 2} days\n\n`;
  
  const supplierEmojis: Record<string, string> = {
    'San Miguel': '🍺',
    'Tanduay': '🥃',
    'Others': '🥤',
    'Other': '📦',
  };
  
  let grandTotalCases = 0;
  
  for (const [supplier, items] of Object.entries(bySupplier)) {
    const totalCases = items.reduce((sum: number, item: any) => sum + (item.casesToOrder || 0), 0);
    grandTotalCases += totalCases;
    const emoji = supplierEmojis[supplier] || '📦';
    
    message += `${emoji} <b>${supplier.toUpperCase()}</b>\n`;
    message += `┌─────────────────────\n`;
    
    for (const item of items) {
      const name = item.name.replace(/\s*\(from towers\)/gi, '').replace(/\s*\(from baskets\)/gi, '');
      message += `│ • ${name}\n`;
      message += `│   📦 <b>${item.casesToOrder}</b> cs (${item.caseSize} pcs each)\n`;
    }
    message += `└─────────────────────\n\n`;
  }
  
  const totalUnits = itemsToOrder.reduce((sum: number, item: any) => sum + item.toOrder, 0);
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `📊 <b>TOTAL:</b> ${totalUnits} pcs / ${grandTotalCases} cs`;
  
  return message;
}

function formatCashReport(data: any): string {
  if (!data?.summary) {
    return '💰 <b>FINANCIAL REPORT</b>\n\nNo data';
  }
  
  const s = data.summary;
  const formatMoney = (n: number) => `₱${n?.toLocaleString() || 0}`;
  
  let message = `💰 <b>FINANCIAL REPORT</b>\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `📅 Shift: 5:00 AM - 5:00 AM\n\n`;
  
  // By category
  if (s.byCategory) {
    const cats = s.byCategory;
    
    // Billiards
    if (cats.billiards?.sales > 0 || cats.billiards?.refunds > 0) {
      message += `🎱 <b>BILLIARDS</b>\n`;
      message += `   💵 Sales: ${formatMoney(cats.billiards.sales)}\n`;
      if (cats.billiards.refunds > 0) {
        message += `   ↩️ Refunds: ${formatMoney(cats.billiards.refunds)}\n`;
      }
      message += `   📊 Net: ${formatMoney(cats.billiards.sales - cats.billiards.refunds)}\n\n`;
    }
    
    // VIP
    if (cats.vip?.sales > 0 || cats.vip?.refunds > 0) {
      message += `👑 <b>VIP / PS</b>\n`;
      message += `   💵 Sales: ${formatMoney(cats.vip.sales)}\n`;
      if (cats.vip.refunds > 0) {
        message += `   ↩️ Refunds: ${formatMoney(cats.vip.refunds)}\n`;
      }
      message += `   📊 Net: ${formatMoney(cats.vip.sales - cats.vip.refunds)}\n\n`;
    }
    
    // Bar
    if (cats.bar?.sales > 0 || cats.bar?.refunds > 0) {
      message += `🍺 <b>BAR</b>\n`;
      message += `   💵 Sales: ${formatMoney(cats.bar.sales)}\n`;
      if (cats.bar.refunds > 0) {
        message += `   ↩️ Refunds: ${formatMoney(cats.bar.refunds)}\n`;
      }
      const barProfit = cats.bar.sales - cats.bar.refunds - (cats.bar.cost || 0);
      message += `   💸 Cost: ${formatMoney(cats.bar.cost || 0)}\n`;
      message += `   📈 Profit: ${formatMoney(barProfit)}\n\n`;
    }
  }
  
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `📊 <b>TOTAL</b>\n`;
  message += `   💵 Sales: ${formatMoney(s.totalAmount)} (${s.totalReceipts} receipts)\n`;
  message += `   ↩️ Refunds: ${formatMoney(s.totalRefundAmount)} (${s.totalRefunds} items)\n`;
  message += `   📊 Net: ${formatMoney(s.netAmount)}\n`;
  
  if (s.totalCost !== undefined) {
    message += `   💸 Cost: ${formatMoney(s.totalCost)}\n`;
    message += `   📈 Profit: ${formatMoney(s.totalProfit)}\n`;
  }
  
  // Payment types breakdown
  if (Object.keys(s.byPaymentType || {}).length > 0) {
    message += `\n💳 <b>BY PAYMENT TYPE</b>\n`;
    for (const [type, p] of Object.entries(s.byPaymentType as Record<string, any>)) {
      if (p.amount > 0 || p.refundAmount > 0) {
        message += `   • ${type}: ${formatMoney(p.amount)}`;
        if (p.refundAmount > 0) {
          message += ` (refund: ${formatMoney(p.refundAmount)})`;
        }
        message += `\n`;
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
      message += await formatPurchaseOrder(purchaseData);
    }
    
    if (action === 'cash' || action === 'all' || action === 'morning') {
      // Calculate 5AM-5AM period for the PREVIOUS shift in Manila timezone
      // Manila is UTC+8
      const now = new Date();
      const manilaOffset = 8 * 60; // Manila is UTC+8
      const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
      const manilaTime = new Date(utcTime + (manilaOffset * 60000));
      
      const manilaHour = manilaTime.getHours();
      const manilaDate = manilaTime.getDate();
      const manilaMonth = manilaTime.getMonth();
      const manilaYear = manilaTime.getFullYear();
      
      // If current Manila time is before 5AM, we want yesterday's shift (day before yesterday 5AM to yesterday 5AM)
      // If current Manila time is 5AM or later, we want the shift that just ended (yesterday 5AM to today 5AM)
      let endDate: Date;
      let startDate: Date;
      
      if (manilaHour < 5) {
        // Before 5AM Manila: report for shift that ended yesterday at 5AM
        // End: yesterday 5AM Manila = yesterday 5AM - 8 hours = yesterday at -3 (day before at 21:00 UTC)
        endDate = new Date(Date.UTC(manilaYear, manilaMonth, manilaDate - 1, 5 - 8, 0, 0));
        startDate = new Date(Date.UTC(manilaYear, manilaMonth, manilaDate - 2, 5 - 8, 0, 0));
      } else {
        // 5AM or later Manila: report for shift that just ended at 5AM today
        // End: today 5AM Manila = today 5AM - 8 hours = yesterday 21:00 UTC
        endDate = new Date(Date.UTC(manilaYear, manilaMonth, manilaDate, 5 - 8, 0, 0));
        startDate = new Date(Date.UTC(manilaYear, manilaMonth, manilaDate - 1, 5 - 8, 0, 0));
      }
      
      console.log(`📊 Cash report period: ${startDate.toISOString()} to ${endDate.toISOString()}`);
      console.log(`📊 Manila time now: ${manilaTime.toISOString()}, hour: ${manilaHour}`);
      
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
