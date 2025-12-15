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
    "🎯 Robelyn, better to order extra than explain to the boss! 😅",
    "📦 Robelyn, extra stock never hurt anyone, but empty shelves sure do! 🍺",
    "💪 Robelyn, order big, sleep well! That's the GAMERS way! 🏆",
    "⏰ Robelyn, today's order = tomorrow's happy customers! 📱",
    "🚨 Robelyn, full warehouse = peaceful life! 😌",
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
            content: `Write a SHORT funny one-liner (max 15 words) addressed to Robelyn about ordering supplies for GAMERS bar.

IMPORTANT: Always start with "Robelyn," and address her directly.

Style: practical, witty humor about real situations. 1-2 emojis max.

Topics to pick from (vary them!):
- Better to have extra stock than run out
- Happy customers when shelves are full
- Order today, relax tomorrow
- Full warehouse = peaceful day

Good examples:
- "Robelyn, better to order extra than explain to the boss! 😅"
- "Robelyn, extra stock never hurt anyone, but empty shelves sure do! 🍺"
- "Robelyn, order big, sleep well! That's the GAMERS way! 💪"
- "Robelyn, today's order = tomorrow's happy customers! 📦"

Output ONLY the joke, nothing else.`
          },
          {
            role: 'user',
            content: 'Write a quick funny reminder for Robelyn about ordering supplies'
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

function formatCashReport(data: any, shift?: string): string {
  if (!data?.summary) {
    return '💰 <b>FINANCIAL REPORT</b>\n\nNo data';
  }
  
  const s = data.summary;
  const formatMoney = (n: number) => `₱${n?.toLocaleString() || 0}`;
  
  const shiftLabel = shift === 'day' ? '☀️ Day Shift (5AM-5PM)' : 
                     shift === 'night' ? '🌙 Night Shift (5PM-5AM)' :
                     '5:00 AM - 5:00 AM';
  
  let message = `💰 <b>FINANCIAL REPORT</b>\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `📅 ${shiftLabel}\n\n`;
  
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

async function fetchCashDiscrepancy(): Promise<{ date: string; shift: string; discrepancy: number; actual: number; expected: number }[]> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Get yesterday's date in Manila timezone
  const now = new Date();
  const manilaOffset = 8 * 60;
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const manilaTime = new Date(utcTime + (manilaOffset * 60000));
  
  // Yesterday in Manila
  const yesterday = new Date(manilaTime);
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0];
  
  console.log(`📅 Checking cash discrepancy for: ${dateStr} (both shifts)`);
  
  const { data, error } = await supabase
    .from('cash_register')
    .select('date, shift, actual_cash, discrepancy')
    .eq('date', dateStr)
    .not('discrepancy', 'is', null)
    .neq('discrepancy', 0);
  
  if (error || !data || data.length === 0) {
    console.log(`✅ No discrepancies for ${dateStr}`);
    return [];
  }
  
  return data.map(d => ({
    date: d.date,
    shift: d.shift,
    discrepancy: d.discrepancy,
    actual: d.actual_cash || 0,
    expected: (d.actual_cash || 0) - d.discrepancy
  }));
}

function formatDiscrepancyAlert(discrepancies: { date: string; shift: string; discrepancy: number; actual: number; expected: number }[]): string {
  if (discrepancies.length === 0) return '';
  
  const formatMoney = (n: number) => `₱${n?.toLocaleString() || 0}`;
  
  let message = `🚨 <b>CASH DISCREPANCY ALERT</b>\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  
  for (const d of discrepancies) {
    const isShortage = d.discrepancy < 0;
    const emoji = isShortage ? '📉' : '📈';
    const shiftEmoji = d.shift === 'day' ? '☀️' : '🌙';
    const type = isShortage ? 'SHORT' : 'OVER';
    
    message += `\n${shiftEmoji} <b>${d.shift === 'day' ? 'Day' : 'Night'} Shift</b> (${d.date})\n`;
    message += `   💰 Expected: ${formatMoney(d.expected)}\n`;
    message += `   💵 Actual: ${formatMoney(d.actual)}\n`;
    message += `   ${emoji} <b>${formatMoney(Math.abs(d.discrepancy))}</b> ${type}\n`;
    
    if (isShortage && Math.abs(d.discrepancy) > 500) {
      message += `   ⚠️ Large shortage! Investigate!\n`;
    }
  }
  
  return message;
}

// Low stock alert - items with stock below daily average
function formatLowStockAlert(data: any): string | null {
  if (!data?.recommendations?.length) {
    return null;
  }
  
  // Filter items with critically low stock (less than 1 day of stock)
  const criticalItems = data.recommendations.filter((item: any) => {
    return item.inStock > 0 && item.inStock < item.avgPerDay && item.avgPerDay > 0;
  });
  
  // Filter items that are out of stock
  const outOfStock = data.recommendations.filter((item: any) => {
    return item.inStock <= 0 && item.avgPerDay > 0;
  });
  
  if (criticalItems.length === 0 && outOfStock.length === 0) {
    return null;
  }
  
  let message = `🚨 <b>LOW STOCK ALERT</b>\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  
  if (outOfStock.length > 0) {
    message += `\n❌ <b>OUT OF STOCK</b>\n`;
    for (const item of outOfStock.slice(0, 10)) {
      const name = item.name.replace(/\s*\(from towers\)/gi, '').replace(/\s*\(from baskets\)/gi, '');
      message += `• ${name} (avg: ${item.avgPerDay}/day)\n`;
    }
  }
  
  if (criticalItems.length > 0) {
    message += `\n⚠️ <b>CRITICAL (< 1 day)</b>\n`;
    for (const item of criticalItems.slice(0, 10)) {
      const name = item.name.replace(/\s*\(from towers\)/gi, '').replace(/\s*\(from baskets\)/gi, '');
      const daysLeft = (item.inStock / item.avgPerDay).toFixed(1);
      message += `• ${name}: ${item.inStock} left (~${daysLeft} days)\n`;
    }
  }
  
  message += `\n📦 Order ASAP to avoid stockouts!`;
  
  return message;
}

// Daily summary - profit and sales overview
async function fetchDailySummary(): Promise<any | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Get last 7 days of data
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);
  
  const { data, error } = await supabase
    .from('cash_register')
    .select('*')
    .gte('date', startDate.toISOString().split('T')[0])
    .order('date', { ascending: false });
  
  if (error || !data || data.length === 0) {
    console.log('ℹ️ No cash register data for summary');
    return null;
  }
  
  const totalSales = data.reduce((sum, r) => sum + (r.expected_sales || 0), 0);
  const totalCost = data.reduce((sum, r) => sum + (r.cost || 0), 0);
  const totalExpenses = data.reduce((sum, r) => sum + (r.purchases || 0) + (r.salaries || 0) + (r.other_expenses || 0), 0);
  const grossProfit = totalSales - totalCost;
  const netProfit = grossProfit - totalExpenses;
  
  // Yesterday's data (both shifts)
  const yesterday = data.filter(r => r.date === data[0]?.date);
  const yesterdaySales = yesterday.reduce((sum, r) => sum + (r.expected_sales || 0), 0);
  const yesterdayProfit = yesterday.reduce((sum, r) => 
    sum + (r.expected_sales - (r.cost || 0) - r.purchases - r.salaries - r.other_expenses), 0);
  
  // Count unique days
  const uniqueDays = new Set(data.map(r => r.date)).size;
  
  return {
    days: uniqueDays,
    shifts: data.length,
    totalSales,
    totalCost,
    grossProfit,
    totalExpenses,
    netProfit,
    yesterday: yesterday.length > 0 ? {
      date: yesterday[0].date,
      sales: yesterdaySales,
      profit: yesterdayProfit,
      shifts: yesterday.length
    } : null
  };
}

function formatDailySummary(data: any): string {
  const formatMoney = (n: number) => `₱${n?.toLocaleString() || 0}`;
  
  let message = `📊 <b>WEEKLY SUMMARY</b>\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `📅 Last ${data.days} days (${data.shifts} shifts)\n\n`;
  
  message += `💵 Total Sales: ${formatMoney(data.totalSales)}\n`;
  message += `💸 Total Cost: ${formatMoney(data.totalCost)}\n`;
  message += `📈 Gross Profit: ${formatMoney(data.grossProfit)}\n`;
  message += `📉 Expenses: ${formatMoney(data.totalExpenses)}\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `💰 <b>Net Profit: ${formatMoney(data.netProfit)}</b>\n`;
  
  if (data.yesterday) {
    message += `\n📅 <b>Yesterday (${data.yesterday.date})</b>\n`;
    message += `   Shifts: ${data.yesterday.shifts}\n`;
    message += `   Sales: ${formatMoney(data.yesterday.sales)}\n`;
    message += `   Profit: ${formatMoney(data.yesterday.profit)}\n`;
  }
  
  // Profit margin
  if (data.totalSales > 0) {
    const margin = ((data.netProfit / data.totalSales) * 100).toFixed(1);
    message += `\n📊 Profit margin: ${margin}%`;
  }
  
  return message;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({ action: 'test' }));
    const { action, shift, employeeName, time, totalHours, cashHandedOver, expectedCash, difference, bonuses, baseSalary, bonusType, amount } = body;
    
    console.log(`📱 Telegram notify action: ${action}`);
    
    let message = '';
    
    // Employee shift notifications
    if (action === 'shift_start') {
      const now = new Date();
      const manilaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
      const hour = manilaTime.getHours();
      const shiftType = hour >= 5 && hour < 17 ? '☀️ Day Shift' : '🌙 Night Shift';
      
      message = `🟢 <b>SHIFT STARTED</b>\n`;
      message += `━━━━━━━━━━━━━━━━━━\n`;
      message += `👤 Employee: <b>${employeeName || 'Unknown'}</b>\n`;
      message += `📅 Shift: ${shiftType}\n`;
      message += `⏰ Started: ${time || manilaTime.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}\n`;
      message += `\n✅ Ready to work!`;
    }
    
    if (action === 'shift_end') {
      const formatMoney = (n: number) => `₱${n?.toLocaleString() || 0}`;
      const diff = difference || 0;
      const isShort = diff < 0;
      
      message = `🔴 <b>SHIFT ENDED - CASH HANDOVER</b>\n`;
      message += `━━━━━━━━━━━━━━━━━━\n`;
      message += `👤 Employee: <b>${employeeName || 'Unknown'}</b>\n`;
      message += `⏱ Worked: ${totalHours || 0} hours\n`;
      message += `\n💰 <b>CASH REPORT</b>\n`;
      message += `   📊 Expected: ${formatMoney(expectedCash || 0)}\n`;
      message += `   💵 Handed Over: ${formatMoney(cashHandedOver || 0)}\n`;
      
      if (diff !== 0) {
        message += `\n${isShort ? '⚠️' : '✅'} <b>Discrepancy: ${diff > 0 ? '+' : ''}${formatMoney(diff)}</b>\n`;
        if (isShort) {
          message += `   Cash is SHORT by ${formatMoney(Math.abs(diff))}\n`;
        } else {
          message += `   Cash is OVER by ${formatMoney(diff)}\n`;
        }
      } else {
        message += `\n✅ <b>Cash matches expected!</b>\n`;
      }
      
      message += `\n💵 <b>EMPLOYEE EARNINGS</b>\n`;
      message += `   Base Salary: ${formatMoney(baseSalary || 500)}\n`;
      if ((bonuses || 0) > 0) {
        message += `   Bonuses: +${formatMoney(bonuses || 0)}\n`;
      }
      message += `   <b>Total: ${formatMoney((baseSalary || 500) + (bonuses || 0))}</b>`;
    }
    
    if (action === 'bonus_added') {
      const formatMoney = (n: number) => `₱${n?.toLocaleString() || 0}`;
      const bonusLabels: Record<string, string> = {
        'sold_goods': '🛍 Sold Goods',
        'vip_room': '👑 VIP Room',
        'hookah': '💨 Hookah',
        'other': '📦 Other'
      };
      
      message = `🎁 <b>BONUS ADDED</b>\n`;
      message += `━━━━━━━━━━━━━━━━━━\n`;
      message += `👤 Employee: <b>${employeeName || 'Unknown'}</b>\n`;
      message += `📝 Type: ${bonusLabels[bonusType] || bonusType}\n`;
      message += `💰 Amount: <b>${formatMoney(amount || 0)}</b>`;
    }
    
    if (action === 'purchase' || action === 'all' || action === 'morning') {
      // Fetch purchase order data
      const purchaseData = await fetchPurchaseData();
      message += await formatPurchaseOrder(purchaseData);
    }
    
    if (action === 'cash' || action === 'all' || action === 'morning') {
      // Calculate shift period in Manila timezone
      // Manila is UTC+8
      // Notification at 6AM covers the night shift (5PM yesterday to 5AM today)
      const now = new Date();
      const manilaOffset = 8 * 60; // Manila is UTC+8
      const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
      const manilaTime = new Date(utcTime + (manilaOffset * 60000));
      
      const manilaHour = manilaTime.getHours();
      const manilaDate = manilaTime.getDate();
      const manilaMonth = manilaTime.getMonth();
      const manilaYear = manilaTime.getFullYear();
      
      let endDate: Date;
      let startDate: Date;
      let reportShift = shift;
      
      // If called at 6AM (morning report), report on the night shift that just ended
      if (action === 'morning' || manilaHour === 6) {
        // Night shift: yesterday 5PM to today 5AM
        endDate = new Date(Date.UTC(manilaYear, manilaMonth, manilaDate, 5 - 8, 0, 0)); // 5AM Manila
        startDate = new Date(Date.UTC(manilaYear, manilaMonth, manilaDate - 1, 17 - 8, 0, 0)); // 5PM Manila yesterday
        reportShift = 'night';
      } else if (manilaHour < 5) {
        // Before 5AM: still night shift
        endDate = new Date(Date.UTC(manilaYear, manilaMonth, manilaDate, 5 - 8, 0, 0));
        startDate = new Date(Date.UTC(manilaYear, manilaMonth, manilaDate - 1, 17 - 8, 0, 0));
        reportShift = 'night';
      } else if (manilaHour < 17) {
        // Day shift: 5AM to 5PM
        endDate = new Date(Date.UTC(manilaYear, manilaMonth, manilaDate, 17 - 8, 0, 0));
        startDate = new Date(Date.UTC(manilaYear, manilaMonth, manilaDate, 5 - 8, 0, 0));
        reportShift = 'day';
      } else {
        // Night shift: 5PM to 5AM next day
        endDate = new Date(Date.UTC(manilaYear, manilaMonth, manilaDate + 1, 5 - 8, 0, 0));
        startDate = new Date(Date.UTC(manilaYear, manilaMonth, manilaDate, 17 - 8, 0, 0));
        reportShift = 'night';
      }
      
      console.log(`📊 Cash report period: ${startDate.toISOString()} to ${endDate.toISOString()}, shift: ${reportShift}`);
      console.log(`📊 Manila time now: ${manilaTime.toISOString()}, hour: ${manilaHour}`);
      
      const cashData = await fetchPaymentsData(startDate.toISOString(), endDate.toISOString());
      
      if (message) message += '\n\n━━━━━━━━━━━━━━━━━━\n\n';
      message += formatCashReport(cashData, reportShift);
    }
    
    // Check for cash discrepancy alert
    if (action === 'morning' || action === 'discrepancy') {
      const discrepancies = await fetchCashDiscrepancy();
      if (discrepancies.length > 0) {
        if (message && action === 'morning') {
          message += '\n\n━━━━━━━━━━━━━━━━━━\n\n';
        }
        message += formatDiscrepancyAlert(discrepancies);
      } else if (action === 'discrepancy') {
        message = '✅ No cash discrepancies found for yesterday.';
      }
    }
    
    // Low stock alert
    if (action === 'morning' || action === 'lowstock') {
      try {
        const purchaseData = await fetchPurchaseData();
        const lowStockMsg = formatLowStockAlert(purchaseData);
        if (lowStockMsg) {
          if (message && action === 'morning') {
            message += '\n\n━━━━━━━━━━━━━━━━━━\n\n';
          }
          message += lowStockMsg;
        } else if (action === 'lowstock') {
          message = '✅ All items have sufficient stock.';
        }
      } catch (e) {
        console.error('Error checking low stock:', e);
      }
    }
    
    // Daily/Weekly summary
    if (action === 'morning' || action === 'summary') {
      try {
        const summaryData = await fetchDailySummary();
        if (summaryData) {
          if (message && action === 'morning') {
            message += '\n\n━━━━━━━━━━━━━━━━━━\n\n';
          }
          message += formatDailySummary(summaryData);
        } else if (action === 'summary') {
          message = 'ℹ️ No data available for summary.';
        }
      } catch (e) {
        console.error('Error generating summary:', e);
      }
    }
    
    if (action === 'test') {
      message = '🤖 <b>Test Message</b>\n\nTelegram notifications are working!\n\n';
      message += `📅 Time: ${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}`;
    }
    
    if (!message) {
      message = '❓ Unknown action. Use: test, purchase, cash, morning, discrepancy, lowstock, or summary';
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