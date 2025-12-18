import { supabase } from '@/integrations/supabase/client';

type ActivityModule = 
  | 'Timer' 
  | 'Shift' 
  | 'Expense' 
  | 'Cash' 
  | 'Inventory' 
  | 'Payroll'
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

  // System actions
  syncLoyverse: (result: string) => 
    logActivity({ module: 'System', action: 'sync_loyverse', details: result }),
  
  syncSheets: (result: string) => 
    logActivity({ module: 'System', action: 'sync_sheets', details: result }),
  
  telegramSent: (type: string) => 
    logActivity({ module: 'System', action: 'telegram_sent', details: type }),
};
