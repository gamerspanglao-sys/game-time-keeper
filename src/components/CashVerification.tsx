import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { 
  Check, X, AlertTriangle, TrendingUp, TrendingDown, 
  Banknote, Smartphone, Loader2, Clock, Users, Pencil, Trash2, Plus, RefreshCw,
  History, ChevronDown, ChevronUp
} from 'lucide-react';

interface PendingShift {
  id: string;
  date: string;
  shift_type: string | null;
  employee_id: string;
  employee_name: string;
  cash_handed_over: number | null;
  gcash_handed_over: number | null;
  cash_approved: boolean;
}

interface PendingExpense {
  id: string;
  date: string;
  shift: string;
  category: string;
  amount: number;
  description: string | null;
  payment_source: string;
  approved: boolean;
  cash_register_id?: string;
}

interface CashRegisterRecord {
  id: string;
  date: string;
  shift: string;
  cash_expected: number | null;
  gcash_expected: number | null;
}

interface PendingVerification {
  date: string;
  shift: string;
  // Breakdown values
  carryoverCash: number;
  carryoverGcash: number;
  loyverseCash: number;
  loyverseGcash: number;
  expensesCash: number;
  expensesGcash: number;
  // Calculated expected
  cashExpected: number;
  gcashExpected: number;
  cashSubmitted: number;
  gcashSubmitted: number;
  totalExpected: number;
  totalSubmitted: number;
  totalAccountedFor: number; // Submitted + ChangeFundLeaving
  difference: number;
  shifts: PendingShift[];
  expenses: PendingExpense[];
  registerId?: string;
  handoverId?: string;
  changeFundLeaving: number; // What they're leaving for next shift
}

const CATEGORIES = [
  { value: 'purchases', label: 'Purchases' },
  { value: 'employee_food', label: 'Employee Food' },
  { value: 'food_hunters', label: 'Food Hunters' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'other', label: 'Other' }
];

const getCategoryLabel = (v: string) => {
  return CATEGORIES.find(c => c.value === v)?.label || v;
};

interface ApprovedHistory {
  date: string;
  shift: string;
  employees: string[];
  // Calculation breakdown
  carryoverCash: number;
  loyverseCash: number;
  loyverseGcash: number;
  expensesCash: number;
  expensesGcash: number;
  cashExpected: number;
  gcashExpected: number;
  cashSubmitted: number;
  gcashSubmitted: number;
  cashActual: number;
  gcashActual: number;
  totalAccountedFor: number; // Submitted + ChangeFundLeft
  difference: number;
  shortage: number;
  changeFundLeft: number;
}

export function CashVerification() {
  const [loading, setLoading] = useState(true);
  const [pendingVerifications, setPendingVerifications] = useState<PendingVerification[]>([]);
  const [pendingExpenses, setPendingExpenses] = useState<PendingExpense[]>([]);
  const [approvedHistory, setApprovedHistory] = useState<ApprovedHistory[]>([]);
  const [shortageInputs, setShortageInputs] = useState<Record<string, Record<string, string>>>({});
  const [processing, setProcessing] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(true);
  const [editingCarryover, setEditingCarryover] = useState<string | null>(null);
  const [carryoverInput, setCarryoverInput] = useState('');
  
  // Confirmation dialog state - admin enters actual received amounts
  const [confirmingVerification, setConfirmingVerification] = useState<PendingVerification | null>(null);
  const [actualCash, setActualCash] = useState('');
  const [actualGcash, setActualGcash] = useState('');
  
  // Edit expense state
  const [editingExpense, setEditingExpense] = useState<PendingExpense | null>(null);
  const [editAmount, setEditAmount] = useState('');
  
  // Add expense dialog state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addContext, setAddContext] = useState<{ date: string; shift: string; registerId?: string } | null>(null);
  const [newExpAmount, setNewExpAmount] = useState('');
  const [newExpCategory, setNewExpCategory] = useState('purchases');
  const [newExpDescription, setNewExpDescription] = useState('');
  const [newExpSource, setNewExpSource] = useState<'cash' | 'gcash'>('cash');
  
  // History expand/edit state
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());
  const [editingHistoryKey, setEditingHistoryKey] = useState<string | null>(null);
  const [editHistoryCashSubmitted, setEditHistoryCashSubmitted] = useState('');
  const [editHistoryGcashSubmitted, setEditHistoryGcashSubmitted] = useState('');
  const [editHistoryChangeFund, setEditHistoryChangeFund] = useState('');
  
  // Edit submitted amounts state (pending)
  const [editingSubmitted, setEditingSubmitted] = useState<string | null>(null);
  const [editCashSubmitted, setEditCashSubmitted] = useState('');
  const [editGcashSubmitted, setEditGcashSubmitted] = useState('');
  const [editChangeFundLeaving, setEditChangeFundLeaving] = useState('');

  // Helper to get previous shift date/type
  const getPreviousShift = (date: string, shift: string): { date: string; shift: string } => {
    if (shift === 'day') {
      // Previous shift is night of previous day
      const prevDate = new Date(date);
      prevDate.setDate(prevDate.getDate() - 1);
      return { date: prevDate.toISOString().split('T')[0], shift: 'night' };
    } else {
      // Previous shift is day of same date
      return { date, shift: 'day' };
    }
  };

  const loadPendingData = async () => {
    try {
      // Load unapproved cash handovers (collective shift closure)
      const { data: handovers } = await supabase
        .from('cash_handovers')
        .select('*, employees:handed_by_employee_id(name)')
        .eq('approved', false)
        .order('shift_date', { ascending: false });

      // Load ALL handovers to find previous shift's change_fund for carryover calculation
      const { data: allHandovers } = await supabase
        .from('cash_handovers')
        .select('shift_date, shift_type, change_fund_amount, approved')
        .order('shift_date', { ascending: false });

      // Load closed shifts for handover employees display
      const { data: closedShifts } = await supabase
        .from('shifts')
        .select('*, employees(name)')
        .eq('status', 'closed')
        .order('date', { ascending: false });

      // Load unapproved expenses
      // Load ALL expenses for calculation (not just unapproved)
      const { data: allExpenses } = await supabase
        .from('cash_expenses')
        .select('*')
        .eq('expense_type', 'shift')
        .order('date', { ascending: false });
      
      // Also load unapproved expenses for the pending list
      const { data: unapprovedExpenses } = await supabase
        .from('cash_expenses')
        .select('*')
        .eq('approved', false)
        .order('date', { ascending: false });

      // Load cash register records for expected and actual values
      const { data: registers } = await supabase
        .from('cash_register')
        .select('id, date, shift, cash_expected, gcash_expected, cash_actual, gcash_actual')
        .order('date', { ascending: false });

      // Load approved shifts for carryover calculation and history
      const { data: approvedShifts } = await supabase
        .from('shifts')
        .select('date, type, shift_type, cash_handed_over, gcash_handed_over, cash_shortage, change_fund_received, employees(name)')
        .eq('cash_approved', true)
        .order('date', { ascending: false });

      // Load all shifts to get change_fund_received
      const { data: allShifts } = await supabase
        .from('shifts')
        .select('date, type, change_fund_received')
        .order('date', { ascending: false });

      setPendingExpenses((unapprovedExpenses || []) as PendingExpense[]);

      // Group by date+shift from cash_handovers
      const groupedVerifications: Record<string, PendingVerification> = {};
      
      // Helper to get previous shift info
      const getPrevShift = (date: string, shift: string): { date: string; shift: string } => {
        if (shift === 'day') {
          const prevDate = new Date(date);
          prevDate.setDate(prevDate.getDate() - 1);
          return { date: prevDate.toISOString().split('T')[0], shift: 'night' };
        } else {
          return { date, shift: 'day' };
        }
      };
      
      // Helper to find change_fund_received from shifts (what employees confirmed receiving)
      const findChangeFundReceived = (date: string, shift: string): number => {
        // Find any shift for this date/shift that has change_fund_received
        const shiftRecord = (allShifts || []).find((s: any) => {
          const sType = s.type || 'day';
          return s.date === date && sType === shift && s.change_fund_received != null;
        });
        if (shiftRecord?.change_fund_received != null) {
          return shiftRecord.change_fund_received;
        }
        // Fallback: look for previous shift's change_fund_amount in handovers
        const prev = getPrevShift(date, shift);
        const prevHandover = (allHandovers || []).find((ph: any) => {
          const phShift = ph.shift_type?.toLowerCase().includes('night') ? 'night' : 'day';
          return ph.shift_date === prev.date && phShift === prev.shift;
        });
        return prevHandover?.change_fund_amount || 0;
      };
      
      (handovers || []).forEach((h: any) => {
        const shiftType = h.shift_type?.toLowerCase().includes('night') ? 'night' : 'day';
        const key = `${h.shift_date}-${shiftType}`;
        
        const handoverEmployee = {
          id: h.id,
          date: h.shift_date,
          shift_type: h.shift_type,
          employee_id: h.handed_by_employee_id,
          employee_name: h.employees?.name || 'Unknown',
          cash_handed_over: h.cash_amount,
          gcash_handed_over: h.gcash_amount,
          cash_approved: false
        };
        
        if (!groupedVerifications[key]) {
          const register = registers?.find(r => r.date === h.shift_date && r.shift === shiftType);
          
          // Get carryover - check change_fund_received first, then fallback to previous shift's change_fund
          const carryover = findChangeFundReceived(h.shift_date, shiftType);
          
          groupedVerifications[key] = {
            date: h.shift_date,
            shift: shiftType,
            carryoverCash: carryover, // Opening cash from PREVIOUS shift
            carryoverGcash: 0,
            loyverseCash: register?.cash_expected || 0,
            loyverseGcash: register?.gcash_expected || 0,
            expensesCash: 0,
            expensesGcash: 0,
            cashExpected: 0,
            gcashExpected: 0,
            cashSubmitted: h.cash_amount || 0,
            gcashSubmitted: h.gcash_amount || 0,
            totalExpected: 0,
            totalSubmitted: 0,
            totalAccountedFor: 0,
            difference: 0,
            shifts: [handoverEmployee],
            expenses: [],
            registerId: register?.id,
            handoverId: h.id,
            changeFundLeaving: h.change_fund_amount || 0 // What they're leaving for next shift
          };
        } else {
          // Add employee to existing group
          groupedVerifications[key].shifts.push(handoverEmployee);
          groupedVerifications[key].cashSubmitted += h.cash_amount || 0;
          groupedVerifications[key].gcashSubmitted += h.gcash_amount || 0;
        }
      });

      // Add related expenses and calculate totals
      Object.values(groupedVerifications).forEach(v => {
        // Use ALL expenses for calculation (not just unapproved)
        const shiftExpenses = (allExpenses || []).filter(e => e.date === v.date && e.shift === v.shift);
        v.expenses = shiftExpenses as PendingExpense[];
        
        // Calculate expenses by payment source
        v.expensesCash = v.expenses
          .filter(e => e.payment_source === 'cash')
          .reduce((sum, e) => sum + e.amount, 0);
        v.expensesGcash = v.expenses
          .filter(e => e.payment_source === 'gcash')
          .reduce((sum, e) => sum + e.amount, 0);
        
        // Expected = Opening Cash (change_fund) + Loyverse Sales - Expenses
        // carryoverCash is already set from change_fund_amount in handover record
        v.cashExpected = v.carryoverCash + v.loyverseCash - v.expensesCash;
        v.gcashExpected = v.carryoverGcash + v.loyverseGcash - v.expensesGcash;
        v.totalExpected = v.cashExpected + v.gcashExpected;
        v.totalSubmitted = v.cashSubmitted + v.gcashSubmitted;
        // Total accounted = cash submitted + gcash submitted + change fund left for next shift
        v.totalAccountedFor = v.cashSubmitted + v.gcashSubmitted + v.changeFundLeaving;
        // Difference = what was accounted for minus what was expected
        v.difference = v.totalAccountedFor - v.totalExpected;
      });

      setPendingVerifications(Object.values(groupedVerifications));
      
      // Initialize shortage inputs
      const inputs: Record<string, Record<string, string>> = {};
      Object.values(groupedVerifications).forEach(v => {
        const key = `${v.date}-${v.shift}`;
        inputs[key] = {};
        if (v.difference < 0) {
          const shortagePerPerson = Math.abs(v.difference) / v.shifts.length;
          v.shifts.forEach(s => {
            inputs[key][s.id] = Math.round(shortagePerPerson).toString();
          });
        }
      });
      setShortageInputs(inputs);

      // Build approved history from approved cash_handovers
      const { data: approvedHandovers, error: handoverError } = await supabase
        .from('cash_handovers')
        .select('*, employees:handed_by_employee_id(name)')
        .eq('approved', true)
        .order('shift_date', { ascending: false })
        .limit(30);
      
      const historyMap: Record<string, ApprovedHistory> = {};
      
      (approvedHandovers || []).forEach((h: any) => {
        const shiftType = h.shift_type?.toLowerCase().includes('night') ? 'night' : 'day';
        const key = `${h.shift_date}-${shiftType}`;
        
        if (!historyMap[key]) {
          const register = registers?.find(r => r.date === h.shift_date && r.shift === shiftType);
          
          // Get carryover - check change_fund_received first, then fallback
          const carryover = findChangeFundReceived(h.shift_date, shiftType);
          
          // Get expenses for this shift
          const shiftExpenses = (allExpenses || []).filter(e => e.date === h.shift_date && e.shift === shiftType);
          const expensesCash = shiftExpenses
            .filter(e => e.payment_source === 'cash')
            .reduce((sum, e) => sum + e.amount, 0);
          const expensesGcash = shiftExpenses
            .filter(e => e.payment_source === 'gcash')
            .reduce((sum, e) => sum + e.amount, 0);
          
          const loyverseCash = register?.cash_expected || 0;
          const loyverseGcash = register?.gcash_expected || 0;
          
          historyMap[key] = {
            date: h.shift_date,
            shift: shiftType,
            employees: [h.employees?.name || 'Unknown'],
            carryoverCash: carryover,
            loyverseCash,
            loyverseGcash,
            expensesCash,
            expensesGcash,
            cashExpected: carryover + loyverseCash - expensesCash,
            gcashExpected: loyverseGcash - expensesGcash,
            cashSubmitted: h.cash_amount || 0,
            gcashSubmitted: h.gcash_amount || 0,
            cashActual: register?.cash_actual || 0,
            gcashActual: register?.gcash_actual || 0,
            totalAccountedFor: 0, // Will be calculated below
            difference: 0,
            shortage: 0,
            changeFundLeft: h.change_fund_amount || 0
          };
        } else {
          // Add employee to existing group
          if (h.employees?.name && !historyMap[key].employees.includes(h.employees.name)) {
            historyMap[key].employees.push(h.employees.name);
          }
          historyMap[key].cashSubmitted += h.cash_amount || 0;
          historyMap[key].gcashSubmitted += h.gcash_amount || 0;
        }
      });

      // Add shortage from shifts table
      (approvedShifts || []).forEach((s: any) => {
        const shiftType = s.shift_type?.includes('Night') || s.shift_type === '12 hours' || s.type === 'night' ? 'night' : 'day';
        const key = `${s.date}-${shiftType}`;
        if (historyMap[key]) {
          historyMap[key].shortage += s.cash_shortage || 0;
        }
      });

      // Calculate totalAccountedFor and differences
      Object.values(historyMap).forEach(h => {
        // Total accounted = submitted + change fund left for next shift
        h.totalAccountedFor = h.cashSubmitted + h.gcashSubmitted + h.changeFundLeft;
        // Difference = accounted vs expected
        h.difference = h.totalAccountedFor - (h.cashExpected + h.gcashExpected);
      });

      // Sort by date descending
      const sortedHistory = Object.values(historyMap).sort((a, b) => b.date.localeCompare(a.date));
      setApprovedHistory(sortedHistory.slice(0, 30));
      
    } catch (e) {
      console.error('Error loading pending data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPendingData(); }, []);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase.channel('cash-verification')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, loadPendingData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_expenses' }, loadPendingData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_register' }, loadPendingData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_handovers' }, loadPendingData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const rejectShift = async (shiftId: string) => {
    try {
      await supabase
        .from('shifts')
        .update({ 
          cash_handed_over: null,
          gcash_handed_over: null
        })
        .eq('id', shiftId);
      
      toast.success('Rejected - employee must resubmit');
      loadPendingData();
    } catch (e) {
      toast.error('Failed to reject');
    }
  };

  const approveExpense = async (id: string) => {
    try {
      await supabase
        .from('cash_expenses')
        .update({ approved: true })
        .eq('id', id);
      toast.success('Expense approved');
      loadPendingData();
    } catch (e) {
      toast.error('Failed to approve');
    }
  };

  const rejectExpense = async (id: string) => {
    try {
      await supabase
        .from('cash_expenses')
        .delete()
        .eq('id', id);
      toast.success('Expense rejected');
      loadPendingData();
    } catch (e) {
      toast.error('Failed to reject');
    }
  };

  const splitEqually = (verification: PendingVerification) => {
    if (verification.difference >= 0) return;
    const key = `${verification.date}-${verification.shift}`;
    const shortagePerPerson = Math.abs(verification.difference) / verification.shifts.length;
    const newInputs = { ...shortageInputs };
    newInputs[key] = {};
    verification.shifts.forEach(s => {
      newInputs[key][s.id] = Math.round(shortagePerPerson).toString();
    });
    setShortageInputs(newInputs);
  };

  // Edit expense amount
  const startEditExpense = (expense: PendingExpense) => {
    setEditingExpense(expense);
    setEditAmount(expense.amount.toString());
  };

  const saveEditExpense = async () => {
    if (!editingExpense) return;
    const amount = parseInt(editAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter valid amount');
      return;
    }
    try {
      await supabase
        .from('cash_expenses')
        .update({ amount })
        .eq('id', editingExpense.id);
      toast.success('Amount updated');
      setEditingExpense(null);
      loadPendingData();
    } catch (e) {
      toast.error('Failed to update');
    }
  };

  // Save carryover (change fund) amount
  const saveCarryover = async (verification: PendingVerification, amount: number) => {
    if (!verification.handoverId) return;
    try {
      await supabase
        .from('cash_handovers')
        .update({ change_fund_amount: amount })
        .eq('id', verification.handoverId);
      toast.success('Change fund updated');
      setEditingCarryover(null);
      loadPendingData();
    } catch (e) {
      toast.error('Failed to update');
    }
  };

  // Start confirmation flow - prefill with submitted amounts
  const startConfirmation = (v: PendingVerification) => {
    setConfirmingVerification(v);
    setActualCash(v.cashSubmitted.toString());
    setActualGcash(v.gcashSubmitted.toString());
  };

  // Confirm with actual received amounts
  const confirmWithActualAmounts = async () => {
    if (!confirmingVerification) return;
    const cash = parseInt(actualCash) || 0;
    const gcash = parseInt(actualGcash) || 0;
    const key = `${confirmingVerification.date}-${confirmingVerification.shift}`;
    setProcessing(key);
    
    try {
      // Update all shifts as approved
      for (const shift of confirmingVerification.shifts) {
        const shortage = (cash + gcash) < confirmingVerification.totalExpected
          ? parseInt(shortageInputs[key]?.[shift.id] || '0') 
          : 0;
        
        await supabase
          .from('shifts')
          .update({ 
            cash_approved: true,
            cash_shortage: shortage
          })
          .eq('id', shift.id);
      }

      // Approve the cash handover record
      if (confirmingVerification.handoverId) {
        await supabase
          .from('cash_handovers')
          .update({ approved: true })
          .eq('id', confirmingVerification.handoverId);
      }

      // Approve related expenses
      for (const expense of confirmingVerification.expenses) {
        await supabase
          .from('cash_expenses')
          .update({ approved: true })
          .eq('id', expense.id);
      }

      // Add ACTUAL received amounts to storage
      const { data: existing } = await supabase
        .from('cash_register')
        .select('id, cash_actual, gcash_actual')
        .eq('date', confirmingVerification.date)
        .eq('shift', confirmingVerification.shift)
        .maybeSingle();
      
      if (existing) {
        await supabase
          .from('cash_register')
          .update({
            cash_actual: (existing.cash_actual || 0) + cash,
            gcash_actual: (existing.gcash_actual || 0) + gcash
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('cash_register')
          .insert({
            date: confirmingVerification.date,
            shift: confirmingVerification.shift,
            cash_actual: cash,
            gcash_actual: gcash
          });
      }

      toast.success(`Confirmed: ₱${cash.toLocaleString()} cash + ₱${gcash.toLocaleString()} gcash added to storage`);
      setConfirmingVerification(null);
      loadPendingData();
    } catch (e) {
      console.error('Error confirming:', e);
      toast.error('Failed to confirm');
    } finally {
      setProcessing(null);
    }
  };

  // Detect пересортица (mis-categorization between Cash and GCash)
  const detectMiscategorization = (v: PendingVerification): { detected: boolean; message: string } => {
    const cashDiff = v.cashSubmitted - v.cashExpected;
    const gcashDiff = v.gcashSubmitted - v.gcashExpected;
    const threshold = 50; // minimum threshold
    
    // If one is positive and other is negative with similar absolute values
    if ((cashDiff > threshold && gcashDiff < -threshold) || 
        (cashDiff < -threshold && gcashDiff > threshold)) {
      const swapAmount = Math.min(Math.abs(cashDiff), Math.abs(gcashDiff));
      if (cashDiff > 0) {
        return {
          detected: true,
          message: `Possible mis-categorization: ~₱${swapAmount.toLocaleString()} may have been recorded as Cash in Loyverse but was actually GCash`
        };
      } else {
        return {
          detected: true,
          message: `Possible mis-categorization: ~₱${swapAmount.toLocaleString()} may have been recorded as GCash in Loyverse but was actually Cash`
        };
      }
    }
    return { detected: false, message: '' };
  };

  // Delete expense
  const deleteExpense = async (id: string) => {
    try {
      await supabase.from('cash_expenses').delete().eq('id', id);
      toast.success('Expense removed');
      loadPendingData();
    } catch (e) {
      toast.error('Failed to delete');
    }
  };

  // Open add expense dialog
  const openAddExpense = (date: string, shift: string, registerId?: string) => {
    setAddContext({ date, shift, registerId });
    setNewExpAmount('');
    setNewExpCategory('purchases');
    setNewExpDescription('');
    setNewExpSource('cash');
    setShowAddDialog(true);
  };

  // Add new expense
  const addNewExpense = async () => {
    if (!addContext) return;
    const amount = parseInt(newExpAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter valid amount');
      return;
    }
    try {
      let registerId = addContext.registerId;
      if (!registerId) {
        const { data: newReg } = await supabase
          .from('cash_register')
          .insert({ date: addContext.date, shift: addContext.shift })
          .select('id')
          .single();
        registerId = newReg?.id;
      }
      
      await supabase.from('cash_expenses').insert({
        cash_register_id: registerId,
        amount,
        category: newExpCategory,
        description: newExpDescription || null,
        payment_source: newExpSource,
        expense_type: 'shift',
        shift: addContext.shift,
        date: addContext.date,
        approved: false
      });
      
      toast.success('Expense added');
      setShowAddDialog(false);
      loadPendingData();
    } catch (e) {
      toast.error('Failed to add');
    }
  };

  // Start editing submitted amounts
  const startEditSubmitted = (v: PendingVerification) => {
    const key = `${v.date}-${v.shift}`;
    setEditingSubmitted(key);
    setEditCashSubmitted(v.cashSubmitted.toString());
    setEditGcashSubmitted(v.gcashSubmitted.toString());
    setEditChangeFundLeaving(v.changeFundLeaving.toString());
  };

  // Save edited submitted amounts
  const saveEditedSubmitted = async (v: PendingVerification) => {
    const cashAmount = parseInt(editCashSubmitted) || 0;
    const gcashAmount = parseInt(editGcashSubmitted) || 0;
    const changeFund = parseInt(editChangeFundLeaving) || 0;
    
    try {
      // Update cash_handovers record
      if (v.handoverId) {
        await supabase
          .from('cash_handovers')
          .update({
            cash_amount: cashAmount,
            gcash_amount: gcashAmount,
            change_fund_amount: changeFund
          })
          .eq('id', v.handoverId);
      }
      
      toast.success('Amounts updated');
      setEditingSubmitted(null);
      loadPendingData();
    } catch (e) {
      toast.error('Failed to update');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const standalonePendingExpenses = pendingExpenses.filter(e => 
    !pendingVerifications.some(v => v.expenses.some(ve => ve.id === e.id))
  );


  const toggleHistoryExpand = (key: string) => {
    const newExpanded = new Set(expandedHistory);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedHistory(newExpanded);
  };

  const startEditHistory = (h: ApprovedHistory) => {
    const key = `${h.date}-${h.shift}`;
    setEditingHistoryKey(key);
    setEditHistoryCashSubmitted(h.cashSubmitted.toString());
    setEditHistoryGcashSubmitted(h.gcashSubmitted.toString());
    setEditHistoryChangeFund(h.changeFundLeft.toString());
  };

  const saveEditHistory = async (h: ApprovedHistory) => {
    const cashSubmitted = parseInt(editHistoryCashSubmitted) || 0;
    const gcashSubmitted = parseInt(editHistoryGcashSubmitted) || 0;
    const changeFund = parseInt(editHistoryChangeFund) || 0;
    
    const shiftType = h.shift === 'night' ? 'Night Shift' : 'Day Shift';
    
    try {
      // Update all cash_handovers for this date/shift
      await supabase
        .from('cash_handovers')
        .update({ 
          cash_amount: cashSubmitted, 
          gcash_amount: gcashSubmitted,
          change_fund_amount: changeFund
        })
        .eq('shift_date', h.date)
        .ilike('shift_type', `%${h.shift}%`);
        
      toast.success('Amounts updated');
      setEditingHistoryKey(null);
      loadPendingData();
    } catch (e) {
      toast.error('Failed to update');
    }
  };

  // Render history section component
  const renderHistorySection = () => (
    <Card>
      <CardHeader className="py-3 pb-2 cursor-pointer" onClick={() => setShowHistory(!showHistory)}>
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <History className="w-4 h-4 text-muted-foreground" />
            Confirmation History ({approvedHistory.length})
          </span>
          {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </CardTitle>
      </CardHeader>
      {showHistory && (
        <CardContent className="space-y-2 pt-0">
          {approvedHistory.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No approved shifts yet</p>
          )}
          {approvedHistory.map(h => {
            const key = `${h.date}-${h.shift}`;
            const isExpanded = expandedHistory.has(key);
            const isEditing = editingHistoryKey === key;
            const totalExpected = h.cashExpected + h.gcashExpected;
            
            return (
              <div key={key} className="rounded-lg bg-muted/30 text-sm overflow-hidden">
                {/* Header row - clickable to expand */}
                <div 
                  className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleHistoryExpand(key)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium flex items-center gap-2">
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      {h.date} • {h.shift === 'day' ? '☀️ Day' : '🌙 Night'}
                    </span>
                    <div className="flex items-center gap-2">
                      {h.shortage > 0 && (
                        <Badge variant="outline" className="text-red-500 border-red-500/30 text-xs">
                          Short: ₱{h.shortage.toLocaleString()}
                        </Badge>
                      )}
                      <Badge variant="outline" className={cn(
                        "text-xs",
                        h.difference >= 0 ? "text-green-500 border-green-500/30" : "text-red-500 border-red-500/30"
                      )}>
                        {h.difference >= 0 ? '+' : ''}₱{h.difference.toLocaleString()}
                      </Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground mt-2">
                    <div>
                      <p className="opacity-70">Expected</p>
                      <p>₱{totalExpected.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="opacity-70">Accounted</p>
                      <p>₱{h.totalAccountedFor.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="opacity-70">Change Left</p>
                      <p>₱{h.changeFundLeft.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
                
                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-border/30 space-y-3">
                    {/* Change Fund Summary - PROMINENT */}
                    <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 space-y-2">
                      <p className="text-xs font-semibold text-primary">💰 Change Fund (Размен)</p>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Received at start</p>
                          <p className="font-bold text-lg">₱{h.carryoverCash.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">(from previous shift)</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Left at end</p>
                          <p className="font-bold text-lg">₱{h.changeFundLeft.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">(for next shift)</p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Calculation breakdown */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Cash Calculation</p>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="space-y-1 bg-background/50 p-2 rounded">
                          <p className="font-medium flex items-center gap-1">
                            <Banknote className="w-3 h-3" /> Cash
                          </p>
                          <div className="space-y-0.5 text-muted-foreground">
                            <div className="flex justify-between">
                              <span>Change fund received</span>
                              <span className="text-foreground">₱{h.carryoverCash.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>+ Loyverse sales</span>
                              <span className="text-foreground">₱{h.loyverseCash.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>− Expenses</span>
                              <span className="text-foreground">₱{h.expensesCash.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between border-t border-border/50 pt-1 font-medium">
                              <span>= Expected total</span>
                              <span className="text-foreground">₱{h.cashExpected.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-1 bg-background/50 p-2 rounded">
                          <p className="font-medium flex items-center gap-1">
                            <Smartphone className="w-3 h-3" /> GCash
                          </p>
                          <div className="space-y-0.5 text-muted-foreground">
                            <div className="flex justify-between">
                              <span>Loyverse sales</span>
                              <span className="text-foreground">₱{h.loyverseGcash.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>− Expenses</span>
                              <span className="text-foreground">₱{h.expensesGcash.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between border-t border-border/50 pt-1 font-medium">
                              <span>= Expected</span>
                              <span className="text-foreground">₱{h.gcashExpected.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Submitted + Change Fund = Accounted */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-muted-foreground">Total Accounted For</p>
                        {!isEditing ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={(e) => { e.stopPropagation(); startEditHistory(h); }}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                        ) : (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 text-green-500"
                              onClick={(e) => { e.stopPropagation(); saveEditHistory(h); }}
                            >
                              <Check className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 text-red-500"
                              onClick={(e) => { e.stopPropagation(); setEditingHistoryKey(null); }}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                      
                      {isEditing ? (
                        <div className="bg-background/50 p-2 rounded space-y-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">Cash:</span>
                            <Input
                              type="number"
                              className="h-6 text-xs w-24 text-right"
                              value={editHistoryCashSubmitted}
                              onChange={e => setEditHistoryCashSubmitted(e.target.value)}
                              onClick={e => e.stopPropagation()}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">GCash:</span>
                            <Input
                              type="number"
                              className="h-6 text-xs w-24 text-right"
                              value={editHistoryGcashSubmitted}
                              onChange={e => setEditHistoryGcashSubmitted(e.target.value)}
                              onClick={e => e.stopPropagation()}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">Change fund:</span>
                            <Input
                              type="number"
                              className="h-6 text-xs w-24 text-right"
                              value={editHistoryChangeFund}
                              onChange={e => setEditHistoryChangeFund(e.target.value)}
                              onClick={e => e.stopPropagation()}
                            />
                          </div>
                          <div className="flex justify-between border-t border-border/50 pt-1 font-bold">
                            <span>= Total</span>
                            <span>₱{((parseInt(editHistoryCashSubmitted) || 0) + (parseInt(editHistoryGcashSubmitted) || 0) + (parseInt(editHistoryChangeFund) || 0)).toLocaleString()}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-background/50 p-2 rounded space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Submitted Cash</span>
                            <span>₱{h.cashSubmitted.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Submitted GCash</span>
                            <span>₱{h.gcashSubmitted.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">+ Change fund left</span>
                            <span className="text-amber-600 font-medium">₱{h.changeFundLeft.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between border-t border-border/50 pt-1 font-bold">
                            <span>= Total Accounted</span>
                            <span>₱{h.totalAccountedFor.toLocaleString()}</span>
                          </div>
                          <div className={cn(
                            "flex justify-between pt-1 font-bold",
                            h.difference >= 0 ? "text-green-500" : "text-red-500"
                          )}>
                            <span>vs Expected ₱{(h.cashExpected + h.gcashExpected).toLocaleString()}</span>
                            <span>{h.difference >= 0 ? '+' : ''}₱{h.difference.toLocaleString()}</span>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Staff */}
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <Users className="w-3 h-3" />
                      <span>{h.employees.join(', ')}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );

  if (pendingVerifications.length === 0 && standalonePendingExpenses.length === 0) {
    return (
      <div className="space-y-4">
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-muted-foreground">
            <Check className="w-8 h-8 mx-auto mb-2 text-green-500" />
            <p>No pending approvals</p>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => { setLoading(true); loadPendingData(); }}
              className="mt-3"
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              Refresh
            </Button>
          </CardContent>
        </Card>
        {renderHistorySection()}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {pendingVerifications.length} pending verification{pendingVerifications.length !== 1 ? 's' : ''}
        </p>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => { setLoading(true); loadPendingData(); }}
          disabled={loading}
          className="h-8"
        >
          <RefreshCw className={cn("w-4 h-4 mr-1", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>
      
      {/* Cash Handover Verifications */}
      {pendingVerifications.map(v => {
        const key = `${v.date}-${v.shift}`;
        const isSurplus = v.difference > 0;
        const isShortage = v.difference < 0;
        const isMatch = v.difference === 0;
        
        return (
          <Card key={key} className={cn(
            "border-2 transition-all",
            isSurplus && "border-green-500/50 bg-green-500/5",
            isShortage && "border-red-500/50 bg-red-500/5",
            isMatch && "border-blue-500/50 bg-blue-500/5"
          )}>
            <CardHeader className="py-3 pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  {v.date} • {v.shift === 'day' ? '☀️ Day' : '🌙 Night'}
                </span>
                <Badge variant="outline" className={cn(
                  "font-bold",
                  isSurplus && "border-green-500 text-green-500",
                  isShortage && "border-red-500 text-red-500",
                  isMatch && "border-blue-500 text-blue-500"
                )}>
                  {isSurplus && <TrendingUp className="w-3 h-3 mr-1" />}
                  {isShortage && <TrendingDown className="w-3 h-3 mr-1" />}
                  {isMatch ? 'MATCH' : `${v.difference > 0 ? '+' : ''}₱${v.difference.toLocaleString()}`}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Calculation Breakdown */}
              <div className="p-2 rounded-lg bg-background/80 text-xs space-y-1">
                <p className="text-[10px] text-muted-foreground mb-2 font-medium">Expected Calculation</p>
                <div className="grid grid-cols-3 gap-1 text-muted-foreground">
                  <span></span>
                  <span className="text-center"><Banknote className="w-3 h-3 inline text-green-500" /> Cash</span>
                  <span className="text-center"><Smartphone className="w-3 h-3 inline text-blue-500" /> GCash</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <span className="text-muted-foreground flex items-center gap-1">
                    Carryover:
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="h-4 w-4 p-0"
                      onClick={() => {
                        setEditingCarryover(key);
                        setCarryoverInput(v.carryoverCash.toString());
                      }}
                    >
                      <Pencil className="w-2.5 h-2.5" />
                    </Button>
                  </span>
                  {editingCarryover === key ? (
                    <>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          className="h-5 w-16 text-xs text-center p-1"
                          value={carryoverInput}
                          onChange={(e) => setCarryoverInput(e.target.value)}
                          autoFocus
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 p-0 text-green-500"
                          onClick={() => saveCarryover(v, parseInt(carryoverInput) || 0)}
                        >
                          <Check className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 p-0 text-red-500"
                          onClick={() => setEditingCarryover(null)}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                      <span className="text-center">₱{v.carryoverGcash.toLocaleString()}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-center">₱{v.carryoverCash.toLocaleString()}</span>
                      <span className="text-center">₱{v.carryoverGcash.toLocaleString()}</span>
                    </>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <span className="text-muted-foreground">+ Sales:</span>
                  <span className="text-center text-green-600">₱{v.loyverseCash.toLocaleString()}</span>
                  <span className="text-center text-green-600">₱{v.loyverseGcash.toLocaleString()}</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <span className="text-muted-foreground">− Expenses:</span>
                  <span className="text-center text-red-500">₱{v.expensesCash.toLocaleString()}</span>
                  <span className="text-center text-red-500">₱{v.expensesGcash.toLocaleString()}</span>
                </div>
                <div className="grid grid-cols-3 gap-1 pt-1 border-t border-border font-bold">
                  <span>= Expected:</span>
                  <span className="text-center">₱{v.cashExpected.toLocaleString()}</span>
                  <span className="text-center">₱{v.gcashExpected.toLocaleString()}</span>
                </div>
                <p className="font-bold text-right pt-1">Total Expected: ₱{v.totalExpected.toLocaleString()}</p>
              </div>

              {/* Staff Submitted + Change Fund Left */}
              <div className="p-2 rounded-lg bg-background/80 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground">Staff Accounted For</p>
                  {editingSubmitted !== key ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => startEditSubmitted(v)}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                  ) : (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-green-500"
                        onClick={() => saveEditedSubmitted(v)}
                      >
                        <Check className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-red-500"
                        onClick={() => setEditingSubmitted(null)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </div>
                
                {editingSubmitted === key ? (
                  <>
                    <div className="grid grid-cols-3 gap-1 text-xs items-center">
                      <span className="text-muted-foreground">Submitted Cash:</span>
                      <Input
                        type="number"
                        className="h-6 text-xs text-center col-span-2"
                        value={editCashSubmitted}
                        onChange={e => setEditCashSubmitted(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-xs items-center">
                      <span className="text-muted-foreground">Submitted GCash:</span>
                      <Input
                        type="number"
                        className="h-6 text-xs text-center col-span-2"
                        value={editGcashSubmitted}
                        onChange={e => setEditGcashSubmitted(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-xs items-center">
                      <span className="text-muted-foreground">Change fund left:</span>
                      <Input
                        type="number"
                        className="h-6 text-xs text-center col-span-2"
                        value={editChangeFundLeaving}
                        onChange={e => setEditChangeFundLeaving(e.target.value)}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-1 text-xs">
                      <span className="text-muted-foreground">Submitted:</span>
                      <span className="text-center">
                        <Banknote className="w-3 h-3 inline text-green-500 mr-1" />₱{v.cashSubmitted.toLocaleString()}
                      </span>
                      <span className="text-center">
                        <Smartphone className="w-3 h-3 inline text-blue-500 mr-1" />₱{v.gcashSubmitted.toLocaleString()}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-xs">
                      <span className="text-muted-foreground">+ Change fund left:</span>
                      <span className="text-center font-medium text-amber-600">₱{v.changeFundLeaving.toLocaleString()}</span>
                      <span className="text-center text-muted-foreground">—</span>
                    </div>
                  </>
                )}
                
                <div className="grid grid-cols-3 gap-1 text-sm pt-1 border-t border-border font-bold">
                  <span>= Total Accounted:</span>
                  <span className="text-center col-span-2">
                    ₱{editingSubmitted === key 
                      ? ((parseInt(editCashSubmitted) || 0) + (parseInt(editGcashSubmitted) || 0) + (parseInt(editChangeFundLeaving) || 0)).toLocaleString()
                      : v.totalAccountedFor.toLocaleString()
                    }
                  </span>
                </div>
              </div>

              {/* Discrepancy */}
              {v.difference !== 0 && (
                <div className={cn(
                  "p-3 rounded-lg border-2 text-sm",
                  isSurplus && "bg-green-500/10 border-green-500/50",
                  isShortage && "bg-red-500/10 border-red-500/50"
                )}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium flex items-center gap-1">
                      {isShortage ? <TrendingDown className="w-4 h-4 text-red-500" /> : <TrendingUp className="w-4 h-4 text-green-500" />}
                      {isShortage ? 'SHORTAGE' : 'SURPLUS'}
                    </span>
                    <span className={cn("font-bold text-lg", isShortage ? "text-red-500" : "text-green-500")}>
                      {v.difference > 0 ? '+' : ''}₱{v.difference.toLocaleString()}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div></div>
                    <div className="text-center"><Banknote className="w-3 h-3 inline text-green-600" /> Cash</div>
                    <div className="text-center"><Smartphone className="w-3 h-3 inline text-blue-600" /> GCash</div>
                    
                    <div className="text-muted-foreground">Expected:</div>
                    <div className="text-center">₱{v.cashExpected.toLocaleString()}</div>
                    <div className="text-center">₱{v.gcashExpected.toLocaleString()}</div>
                    
                    <div className="text-muted-foreground">Submitted:</div>
                    <div className="text-center">₱{v.cashSubmitted.toLocaleString()}</div>
                    <div className="text-center">₱{v.gcashSubmitted.toLocaleString()}</div>
                    
                    <div className="font-medium">Diff:</div>
                    <div className={cn("text-center font-bold", (v.cashSubmitted - v.cashExpected) >= 0 ? "text-green-500" : "text-red-500")}>
                      {(v.cashSubmitted - v.cashExpected) >= 0 ? '+' : ''}₱{(v.cashSubmitted - v.cashExpected).toLocaleString()}
                    </div>
                    <div className={cn("text-center font-bold", (v.gcashSubmitted - v.gcashExpected) >= 0 ? "text-green-500" : "text-red-500")}>
                      {(v.gcashSubmitted - v.gcashExpected) >= 0 ? '+' : ''}₱{(v.gcashSubmitted - v.gcashExpected).toLocaleString()}
                    </div>
                  </div>
                </div>
              )}

              {/* Mis-categorization warning */}
              {(() => {
                const miscat = detectMiscategorization(v);
                return miscat.detected && (
                  <div className="p-3 rounded-lg border-2 border-amber-500/50 bg-amber-500/10">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-amber-600 text-sm">Possible Пересортица</p>
                        <p className="text-xs text-muted-foreground mt-1">{miscat.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          💡 If this is the case, the totals may still be correct - just misallocated between Cash and GCash.
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Users className="w-3 h-3" /> Employee Submissions ({v.shifts.length})
                </p>
                {v.shifts.map(s => (
                  <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg bg-background/60 text-sm group">
                    <span className="flex-1 font-medium">{s.employee_name}</span>
                    <Badge variant="outline" className="text-green-600 border-green-500/30">
                      <Banknote className="w-3 h-3 mr-1" />
                      ₱{(s.cash_handed_over || 0).toLocaleString()}
                    </Badge>
                    <Badge variant="outline" className="text-blue-600 border-blue-500/30">
                      <Smartphone className="w-3 h-3 mr-1" />
                      ₱{(s.gcash_handed_over || 0).toLocaleString()}
                    </Badge>
                    {isShortage && (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-red-500">Shortage:</span>
                        <Input
                          type="number"
                          className="w-20 h-7 text-xs text-center"
                          value={shortageInputs[key]?.[s.id] || '0'}
                          onChange={e => {
                            const newInputs = { ...shortageInputs };
                            if (!newInputs[key]) newInputs[key] = {};
                            newInputs[key][s.id] = e.target.value;
                            setShortageInputs(newInputs);
                          }}
                        />
                      </div>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-red-500 hover:bg-red-500/10"
                      onClick={() => rejectShift(s.id)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Related expenses */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Related Expenses ({v.expenses.length})</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs text-amber-600 hover:bg-amber-500/10"
                    onClick={() => openAddExpense(v.date, v.shift, v.registerId)}
                  >
                    <Plus className="w-3 h-3 mr-1" />Add
                  </Button>
                </div>
                {v.expenses.map(exp => (
                  <div key={exp.id} className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 text-sm group">
                    <Badge variant="outline" className="text-xs shrink-0">
                      {exp.payment_source === 'gcash' ? '📱' : '💵'}
                    </Badge>
                    <span className="flex-1 truncate">{getCategoryLabel(exp.category)}</span>
                    {exp.description && (
                      <span className="text-xs text-muted-foreground truncate max-w-20">{exp.description}</span>
                    )}
                    <span className="font-medium shrink-0">₱{exp.amount.toLocaleString()}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 text-blue-500 hover:bg-blue-500/10"
                      onClick={() => startEditExpense(exp)}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 text-red-500 hover:bg-red-500/10"
                      onClick={() => deleteExpense(exp.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
                {v.expenses.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">No expenses</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                {isShortage && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => splitEqually(v)}
                  >
                    Split Equally
                  </Button>
                )}
                <Button
                  className={cn(
                    "flex-1",
                    isSurplus && "bg-green-500 hover:bg-green-600",
                    isShortage && "bg-red-500 hover:bg-red-600",
                    isMatch && "bg-blue-500 hover:bg-blue-600"
                  )}
                  onClick={() => startConfirmation(v)}
                  disabled={processing === key}
                >
                  {processing === key ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Check className="w-4 h-4 mr-2" />
                  )}
                  Confirm & Add to Storage
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Standalone Pending Expenses */}
      {standalonePendingExpenses.length > 0 && (
        <Card>
          <CardHeader className="py-3 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Pending Expenses ({standalonePendingExpenses.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {standalonePendingExpenses.map(exp => (
              <div key={exp.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 text-sm group">
                <Badge variant="outline" className="text-xs">
                  {exp.payment_source === 'gcash' ? '📱 GCash' : '💵 Cash'}
                </Badge>
                <span className="text-muted-foreground text-xs">{exp.date}</span>
                <span className="flex-1">{getCategoryLabel(exp.category)}</span>
                {exp.description && (
                  <span className="text-xs text-muted-foreground truncate max-w-24">{exp.description}</span>
                )}
                <span className="font-medium">₱{exp.amount.toLocaleString()}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 text-blue-500 hover:bg-blue-500/10"
                  onClick={() => startEditExpense(exp)}
                >
                  <Pencil className="w-3 h-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-green-500 hover:bg-green-500/10"
                  onClick={() => approveExpense(exp.id)}
                >
                  <Check className="w-3 h-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-red-500 hover:bg-red-500/10"
                  onClick={() => deleteExpense(exp.id)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Approved History - Always show */}
      <Card>
        <CardHeader className="py-3 pb-2 cursor-pointer" onClick={() => setShowHistory(!showHistory)}>
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              <History className="w-4 h-4 text-muted-foreground" />
              Confirmation History ({approvedHistory.length})
            </span>
            {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </CardTitle>
        </CardHeader>
        {showHistory && (
          <CardContent className="space-y-2 pt-0">
            {approvedHistory.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No approved shifts yet</p>
            )}
              {approvedHistory.map(h => {
                const totalSubmitted = h.cashSubmitted + h.gcashSubmitted;
                const totalActual = h.cashActual + h.gcashActual;
                const totalExpected = h.cashExpected + h.gcashExpected;
                const adminDiff = totalActual - totalSubmitted;
                const expectedDiff = totalSubmitted - totalExpected;
                
                return (
                  <div key={`${h.date}-${h.shift}`} className="p-3 rounded-lg bg-muted/30 text-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium flex items-center gap-2">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        {h.date} • {h.shift === 'day' ? '☀️ Day' : '🌙 Night'}
                      </span>
                      <div className="flex items-center gap-2">
                        {h.shortage > 0 && (
                          <Badge variant="outline" className="text-red-500 border-red-500/30 text-xs">
                            Shortage: ₱{h.shortage.toLocaleString()}
                          </Badge>
                        )}
                        <Badge variant="outline" className={cn(
                          "text-xs",
                          expectedDiff >= 0 ? "text-green-500 border-green-500/30" : "text-red-500 border-red-500/30"
                        )}>
                          {expectedDiff >= 0 ? '+' : ''}₱{expectedDiff.toLocaleString()}
                        </Badge>
                      </div>
                    </div>
                    
                    <p className="text-xs text-muted-foreground">
                      {h.employees.join(', ')}
                    </p>
                    
                    {/* Calculation Breakdown */}
                    <div className="p-2 rounded bg-background/60 text-xs space-y-1">
                      <div className="grid grid-cols-3 gap-1 text-[10px] text-muted-foreground">
                        <span></span>
                        <span className="text-center"><Banknote className="w-2.5 h-2.5 inline" /> Cash</span>
                        <span className="text-center"><Smartphone className="w-2.5 h-2.5 inline" /> GCash</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        <span className="text-muted-foreground">Carryover:</span>
                        <span className="text-center">₱{h.carryoverCash.toLocaleString()}</span>
                        <span className="text-center">₱0</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        <span className="text-muted-foreground">+ Sales:</span>
                        <span className="text-center text-green-600">₱{h.loyverseCash.toLocaleString()}</span>
                        <span className="text-center text-green-600">₱{h.loyverseGcash.toLocaleString()}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        <span className="text-muted-foreground">− Expenses:</span>
                        <span className="text-center text-red-500">₱{h.expensesCash.toLocaleString()}</span>
                        <span className="text-center text-red-500">₱{h.expensesGcash.toLocaleString()}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1 pt-1 border-t border-border font-medium">
                        <span>= Expected:</span>
                        <span className="text-center">₱{h.cashExpected.toLocaleString()}</span>
                        <span className="text-center">₱{h.gcashExpected.toLocaleString()}</span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2 text-xs pt-1">
                      <div>
                        <p className="text-muted-foreground">Submitted</p>
                        <p className="font-medium">₱{totalSubmitted.toLocaleString()}</p>
                        <p className="text-[10px] text-muted-foreground">
                          Left: ₱{h.changeFundLeft.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Admin Actual</p>
                        <p className="font-medium">₱{totalActual.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">vs Expected</p>
                        <p className={cn(
                          "font-medium",
                          expectedDiff > 0 && "text-green-500",
                          expectedDiff < 0 && "text-red-500",
                          expectedDiff === 0 && "text-muted-foreground"
                        )}>
                          {expectedDiff === 0 ? 'Match' : `${expectedDiff > 0 ? '+' : ''}₱${expectedDiff.toLocaleString()}`}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          )}
        </Card>

      <Dialog open={!!editingExpense} onOpenChange={(open) => !open && setEditingExpense(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4" />
              Edit Amount
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">
                {editingExpense && getCategoryLabel(editingExpense.category)}
                {editingExpense?.description && ` • ${editingExpense.description}`}
              </p>
              <Input
                type="number"
                placeholder="Amount"
                value={editAmount}
                onChange={e => setEditAmount(e.target.value)}
                className="text-lg"
                autoFocus
              />
            </div>
            <Button className="w-full" onClick={saveEditExpense}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Expense Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add Expense
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Amount</label>
              <Input
                type="number"
                placeholder="0"
                value={newExpAmount}
                onChange={e => setNewExpAmount(e.target.value)}
                className="text-lg"
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Category</label>
              <Select value={newExpCategory} onValueChange={setNewExpCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Payment Source</label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={newExpSource === 'cash' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setNewExpSource('cash')}
                >
                  <Banknote className="w-4 h-4 mr-2" />Cash
                </Button>
                <Button
                  type="button"
                  variant={newExpSource === 'gcash' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setNewExpSource('gcash')}
                >
                  <Smartphone className="w-4 h-4 mr-2" />GCash
                </Button>
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Description (optional)</label>
              <Input
                placeholder="What was it for?"
                value={newExpDescription}
                onChange={e => setNewExpDescription(e.target.value)}
              />
            </div>
            <Button className="w-full" onClick={addNewExpense}>
              <Plus className="w-4 h-4 mr-2" />Add Expense
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Verification Dialog */}
      <Dialog open={!!confirmingVerification} onOpenChange={(open) => !open && setConfirmingVerification(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-500" />
              Confirm & Add to Storage
            </DialogTitle>
          </DialogHeader>
          {confirmingVerification && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 text-sm">
                <p className="text-muted-foreground mb-2">Staff submitted:</p>
                <div className="flex gap-4">
                  <span className="flex items-center gap-1">
                    <Banknote className="w-4 h-4 text-green-500" />
                    ₱{confirmingVerification.cashSubmitted.toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <Smartphone className="w-4 h-4 text-blue-500" />
                    ₱{confirmingVerification.gcashSubmitted.toLocaleString()}
                  </span>
                </div>
              </div>
              
              <p className="text-sm font-medium">Enter actual amounts received:</p>
              
              <div>
                <label className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                  <Banknote className="w-3 h-3 text-green-500" /> Actual Cash Received
                </label>
                <Input
                  type="number"
                  placeholder="0"
                  value={actualCash}
                  onChange={e => setActualCash(e.target.value)}
                  className="text-lg"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                  <Smartphone className="w-3 h-3 text-blue-500" /> Actual GCash Received
                </label>
                <Input
                  type="number"
                  placeholder="0"
                  value={actualGcash}
                  onChange={e => setActualGcash(e.target.value)}
                  className="text-lg"
                />
              </div>
              
              {(parseInt(actualCash) || 0) + (parseInt(actualGcash) || 0) !== confirmingVerification.cashSubmitted + confirmingVerification.gcashSubmitted && (
                <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-xs text-amber-600">
                  <AlertTriangle className="w-3 h-3 inline mr-1" />
                  Total differs from submitted: ₱{((parseInt(actualCash) || 0) + (parseInt(actualGcash) || 0) - confirmingVerification.cashSubmitted - confirmingVerification.gcashSubmitted).toLocaleString()}
                </div>
              )}
              
              <Button 
                className="w-full" 
                onClick={confirmWithActualAmounts}
                disabled={processing === `${confirmingVerification.date}-${confirmingVerification.shift}`}
              >
                {processing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                Confirm & Add to Storage
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
