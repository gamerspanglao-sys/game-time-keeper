import { supabase } from '@/integrations/supabase/client';

type ActivityModule = 
  | 'Timer' 
  | 'Queue'
  | 'Shift' 
  | 'Expense' 
  | 'Cash' 
  | 'Inventory' 
  | 'Payroll'
  | 'Admin'
  | 'System';

interface LogActivityParams {
  module: ActivityModule;
  action: string;
  details?: string;
  entityId?: string;
}

export async function logActivity({ module, action, details, entityId }: LogActivityParams) {
  try {
    const displayName = details ? `${module}: ${details}` : module;
    
    await supabase.from('activity_log').insert({
      timer_id: entityId || module.toLowerCase(),
      timer_name: displayName,
      action,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
}

// Convenience functions for common actions
export const ActivityLogger = {
  // Timer actions
  timerStart: (timerName: string, duration: number, paymentType: string) => 
    logActivity({ module: 'Timer', action: 'timer_start', details: `${timerName} | ${duration}min | ${paymentType}` }),
  
  timerStop: (timerName: string, elapsedMin: number) => 
    logActivity({ module: 'Timer', action: 'timer_stop', details: `${timerName} | ${elapsedMin}min` }),
  
  timerExtend: (timerName: string, addedMin: number, paymentType: string) => 
    logActivity({ module: 'Timer', action: 'timer_extend', details: `${timerName} | +${addedMin}min | ${paymentType}` }),
  
  timerReset: (timerName: string) => 
    logActivity({ module: 'Timer', action: 'timer_reset', details: timerName }),
  
  timerPromo: (timerName: string, amount: number) => 
    logActivity({ module: 'Timer', action: 'timer_promo', details: `${timerName} | ₱${amount}` }),

  timerAdjust: (timerName: string, adjustMin: number) => 
    logActivity({ module: 'Timer', action: 'timer_adjust', details: `${timerName} | ${adjustMin > 0 ? '+' : ''}${adjustMin}min` }),

  // Queue actions
  queueAdd: (timerName: string, customerName: string, hours: number) => 
    logActivity({ module: 'Queue', action: 'queue_add', details: `${timerName} | ${customerName} | ${hours}h` }),
  
  queueRemove: (timerName: string, customerName: string) => 
    logActivity({ module: 'Queue', action: 'queue_remove', details: `${timerName} | ${customerName}` }),

  queueClear: (timerName: string) => 
    logActivity({ module: 'Queue', action: 'queue_clear', details: timerName }),

  // Shift actions
  shiftStart: (employeeName: string, shiftType: string) => 
    logActivity({ module: 'Shift', action: 'shift_start', details: `${employeeName} - ${shiftType}` }),
  
  shiftEnd: (employeeName: string) => 
    logActivity({ module: 'Shift', action: 'shift_end', details: employeeName }),
  
  shiftClose: (shiftType: string, cash: number, gcash: number) => 
    logActivity({ module: 'Shift', action: 'shift_close', details: `${shiftType} | ₱${cash} + G₱${gcash}` }),

  // Expense actions
  expenseAdd: (category: string, amount: number, description?: string) => 
    logActivity({ module: 'Expense', action: 'expense_add', details: `${category}: ₱${amount}${description ? ` - ${description}` : ''}` }),
  
  expenseDelete: (category: string, amount: number) => 
    logActivity({ module: 'Expense', action: 'expense_delete', details: `${category}: ₱${amount}` }),
  
  expenseApprove: (count: number) => 
    logActivity({ module: 'Expense', action: 'expense_approve', details: `${count} items` }),

  // Cash actions
  cashReceived: (cash: number, gcash: number, date: string, shift: string) => 
    logActivity({ module: 'Cash', action: 'cash_received', details: `${date} ${shift}: ₱${cash} + G₱${gcash}` }),
  
  cashApprove: (date: string, shift: string) => 
    logActivity({ module: 'Cash', action: 'cash_approve', details: `${date} ${shift}` }),
  
  cashEdit: (date: string, shift: string) => 
    logActivity({ module: 'Cash', action: 'cash_edit', details: `${date} ${shift}` }),

  cashHandoverAdd: (date: string, shift: string, employee: string) => 
    logActivity({ module: 'Cash', action: 'cash_handover_add', details: `${date} ${shift} | ${employee}` }),

  cashHandoverDelete: (date: string, shift: string) => 
    logActivity({ module: 'Cash', action: 'cash_handover_delete', details: `${date} ${shift}` }),

  // Inventory actions
  inventoryReceipt: (itemName: string, qty: number) => 
    logActivity({ module: 'Inventory', action: 'receipt', details: `${itemName}: +${qty}` }),
  
  inventoryCheck: (itemName: string, result: 'ok' | 'diff') => 
    logActivity({ module: 'Inventory', action: result === 'ok' ? 'inventory_ok' : 'inventory_diff', details: itemName }),

  // Payroll actions
  salaryPaid: (employeeName: string, amount: number) => 
    logActivity({ module: 'Payroll', action: 'salary_paid', details: `${employeeName}: ₱${amount}` }),
  
  bonusAdd: (employeeName: string, type: string, amount: number) => 
    logActivity({ module: 'Payroll', action: 'bonus_add', details: `${employeeName}: ${type} ₱${amount}` }),

  shortageAssign: (employeeName: string, amount: number) => 
    logActivity({ module: 'Payroll', action: 'shortage_assign', details: `${employeeName}: ₱${amount}` }),

  // Admin actions
  shiftEdit: (employeeName: string, field: string) => 
    logActivity({ module: 'Admin', action: 'shift_edit', details: `${employeeName} | ${field}` }),

  shiftDelete: (employeeName: string, date: string) => 
    logActivity({ module: 'Admin', action: 'shift_delete', details: `${employeeName} | ${date}` }),

  shiftsReset: (scope: string) => 
    logActivity({ module: 'Admin', action: 'shifts_reset', details: scope }),

  employeeAdd: (employeeName: string) => 
    logActivity({ module: 'Admin', action: 'employee_add', details: employeeName }),

  employeeEdit: (employeeName: string) => 
    logActivity({ module: 'Admin', action: 'employee_edit', details: employeeName }),

  employeeDelete: (employeeName: string) => 
    logActivity({ module: 'Admin', action: 'employee_delete', details: employeeName }),

  // System actions
  syncLoyverse: (result: string) => 
    logActivity({ module: 'System', action: 'sync_loyverse', details: result }),
  
  syncSheets: (result: string) => 
    logActivity({ module: 'System', action: 'sync_sheets', details: result }),
  
  telegramSent: (type: string) => 
    logActivity({ module: 'System', action: 'telegram_sent', details: type }),

  purchaseGenerate: () => 
    logActivity({ module: 'System', action: 'purchase_generate', details: 'Generated' }),

  purchaseSend: () => 
    logActivity({ module: 'System', action: 'purchase_send', details: 'Sent to Telegram' }),
};
