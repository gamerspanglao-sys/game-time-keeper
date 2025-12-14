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

function getRandomJokeForRobelyn(): string {
  const jokes = [
    "🎯 Robelyn, помни: заказ сегодня = пиво завтра! Не подведи команду! 🍺",
    "⏰ Robelyn! Время заказа! Клиенты без пива = грустные клиенты = грустный босс 😅",
    "🦸‍♀️ Robelyn, ты наш супергерой закупок! Не забудь спасти мир (и склад) сегодня!",
    "📱 Robelyn, это твой будильник! ЗАКАЗЫВАЙ! Или клиенты будут пить воду из-под крана 🚰",
    "🎪 Robelyn, цирк начинается если забудешь заказать! И ты будешь главным клоуном 🤡",
    "💪 Robelyn, будь сильной! Нажми 'заказать' и стань героем дня! 🏆",
    "🍕 Robelyn, закажи всё и босс угостит пиццей! (может быть... наверное... вряд ли 😂)",
    "⚡ Robelyn, Flash заказывает быстрее тебя! Докажи что ты круче! 🏃‍♀️",
    "🎵 Robelyn, напоминаю песней: За-ка-зы-вай, не за-бы-вай! 🎤",
    "🌟 Robelyn, звёзды говорят: сегодня идеальный день для заказа! И завтра тоже! И всегда!",
    "🐌 Robelyn, даже улитка уже бы заказала! Ты же быстрее улитки? 😄",
    "🎁 Robelyn, заказ = подарок для всех! Не будь Гринчем, закажи! 🎄",
    "🔥 Robelyn, горячая новость: товары сами себя не закажут! Действуй! 🚒",
    "🧠 Robelyn, используй 100% мозга сегодня: 99% на заказ, 1% на всё остальное 😎",
    "🎰 Robelyn, шансы что ты забудешь: 50%. Шансы что босс расстроится: 100%. Выбирай мудро! 🎲",
  ];
  return jokes[Math.floor(Math.random() * jokes.length)];
}

function formatPurchaseOrder(data: any): string {
  if (!data?.recommendations?.length) {
    return '📦 <b>Заказ товаров</b>\n\n✅ Все товары в наличии!';
  }
  
  const itemsToOrder = data.recommendations.filter((item: any) => item.toOrder > 0);
  if (itemsToOrder.length === 0) {
    return '📦 <b>Заказ товаров</b>\n\n✅ Все товары в наличии!';
  }
  
  // Group by supplier
  const bySupplier: Record<string, any[]> = {};
  for (const item of itemsToOrder) {
    const supplier = item.supplier || 'Другое';
    if (!bySupplier[supplier]) bySupplier[supplier] = [];
    bySupplier[supplier].push(item);
  }
  
  const joke = getRandomJokeForRobelyn();
  
  let message = `📦 <b>ЗАКАЗ ТОВАРОВ</b>\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `${joke}\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `📊 Анализ: ${data.period?.days || 3} дней\n`;
  message += `📅 Буфер доставки: ${data.period?.deliveryBuffer || 2} дней\n\n`;
  
  const supplierEmojis: Record<string, string> = {
    'San Miguel': '🍺',
    'Tanduay': '🥃',
    'Others': '🥤',
    'Другое': '📦',
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
      message += `│   📦 <b>${item.casesToOrder}</b> уп. (по ${item.caseSize} шт)\n`;
    }
    message += `└─────────────────────\n\n`;
  }
  
  const totalUnits = itemsToOrder.reduce((sum: number, item: any) => sum + item.toOrder, 0);
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `📊 <b>ИТОГО:</b> ${totalUnits} шт / ${grandTotalCases} уп.`;
  
  return message;
}

function formatCashReport(data: any): string {
  if (!data?.summary) {
    return '💰 <b>Финансовый отчет</b>\n\nНет данных';
  }
  
  const s = data.summary;
  const formatMoney = (n: number) => `₱${n?.toLocaleString() || 0}`;
  
  let message = `💰 <b>ФИНАНСОВЫЙ ОТЧЕТ</b>\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `📅 Смена: 5:00 - 5:00\n\n`;
  
  // By category
  if (s.byCategory) {
    const cats = s.byCategory;
    
    // Billiards
    if (cats.billiards?.sales > 0 || cats.billiards?.refunds > 0) {
      message += `🎱 <b>БИЛЬЯРД</b>\n`;
      message += `   💵 Продажи: ${formatMoney(cats.billiards.sales)}\n`;
      if (cats.billiards.refunds > 0) {
        message += `   ↩️ Возвраты: ${formatMoney(cats.billiards.refunds)}\n`;
      }
      message += `   📊 Чистая: ${formatMoney(cats.billiards.sales - cats.billiards.refunds)}\n\n`;
    }
    
    // VIP
    if (cats.vip?.sales > 0 || cats.vip?.refunds > 0) {
      message += `👑 <b>VIP / PS</b>\n`;
      message += `   💵 Продажи: ${formatMoney(cats.vip.sales)}\n`;
      if (cats.vip.refunds > 0) {
        message += `   ↩️ Возвраты: ${formatMoney(cats.vip.refunds)}\n`;
      }
      message += `   📊 Чистая: ${formatMoney(cats.vip.sales - cats.vip.refunds)}\n\n`;
    }
    
    // Bar
    if (cats.bar?.sales > 0 || cats.bar?.refunds > 0) {
      message += `🍺 <b>БАР</b>\n`;
      message += `   💵 Продажи: ${formatMoney(cats.bar.sales)}\n`;
      if (cats.bar.refunds > 0) {
        message += `   ↩️ Возвраты: ${formatMoney(cats.bar.refunds)}\n`;
      }
      const barProfit = cats.bar.sales - cats.bar.refunds - (cats.bar.cost || 0);
      message += `   💸 Себест.: ${formatMoney(cats.bar.cost || 0)}\n`;
      message += `   📈 Прибыль: ${formatMoney(barProfit)}\n\n`;
    }
  }
  
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `📊 <b>ИТОГО</b>\n`;
  message += `   💵 Продажи: ${formatMoney(s.totalAmount)} (${s.totalReceipts} чеков)\n`;
  message += `   ↩️ Возвраты: ${formatMoney(s.totalRefundAmount)} (${s.totalRefunds} шт)\n`;
  message += `   📊 Чистая: ${formatMoney(s.netAmount)}\n`;
  
  if (s.totalCost !== undefined) {
    message += `   💸 Себест.: ${formatMoney(s.totalCost)}\n`;
    message += `   📈 Прибыль: ${formatMoney(s.totalProfit)}\n`;
  }
  
  // Payment types breakdown
  if (Object.keys(s.byPaymentType || {}).length > 0) {
    message += `\n💳 <b>ПО ТИПАМ ОПЛАТЫ</b>\n`;
    for (const [type, p] of Object.entries(s.byPaymentType as Record<string, any>)) {
      if (p.amount > 0 || p.refundAmount > 0) {
        message += `   • ${type}: ${formatMoney(p.amount)}`;
        if (p.refundAmount > 0) {
          message += ` (возврат: ${formatMoney(p.refundAmount)})`;
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
