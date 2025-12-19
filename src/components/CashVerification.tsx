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
  History, ChevronDown, ChevronUp, Send
} from 'lucide-react';
import { ActivityLogger } from '@/lib/activityLogger';

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
  
  // History expand/edit state - totalCash = cash submitted + change fund
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());
  const [editingHistoryKey, setEditingHistoryKey] = useState<string | null>(null);
  const [editHistoryTotalCash, setEditHistoryTotalCash] = useState('');
  const [editHistoryGcash, setEditHistoryGcash] = useState('');
  const [editHistoryChangeFund, setEditHistoryChangeFund] = useState('');
  
  // Edit submitted amounts state (pending) - totalCash = cash handed over + change fund
  const [editingSubmitted, setEditingSubmitted] = useState<string | null>(null);
  const [editTotalCash, setEditTotalCash] = useState(''); // Full cash in register
  const [editGcashSubmitted, setEditGcashSubmitted] = useState('');
  const [editChangeFundLeaving, setEditChangeFundLeaving] = useState('');
  
  // Add manual history entry state
  const [showAddHistoryDialog, setShowAddHistoryDialog] = useState(false);
  const [addHistoryDate, setAddHistoryDate] = useState('');
  const [addHistoryShift, setAddHistoryShift] = useState<'day' | 'night'>('night');
  const [addHistoryCash, setAddHistoryCash] = useState('');
  const [addHistoryGcash, setAddHistoryGcash] = useState('');
  const [addHistoryChangeFund, setAddHistoryChangeFund] = useState('2000');
  const [addHistoryEmployee, setAddHistoryEmployee] = useState('');
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);

  // Helper to get previous shift date/type
  // Previous shift = who gave you change fund when you STARTED your shift
  const getPreviousShift = (date: string, shift: string): { date: string; shift: string } => {
    if (shift === 'day') {
      // Day shift receives from night shift of SAME date (night ended this morning at 5AM)
      return { date, shift: 'night' };
    } else {
      // Night shift handover on date X = shift started X-1 evening
      // Received change fund from day shift of X-1 (who ended that evening at 5PM)
      const prevDate = new Date(date);
      prevDate.setDate(prevDate.getDate() - 1);
      return { date: prevDate.toISOString().split('T')[0], shift: 'day' };
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
      
      // Also load unapproved expenses ONLY from closed shifts (not from active/ended shifts)
      // First get all closed shift IDs
      const { data: closedShiftsForExpenses } = await supabase
        .from('shifts')
        .select('id')
        .eq('status', 'closed');
      
      const closedShiftIds = (closedShiftsForExpenses || []).map(s => s.id);
      
      // Load unapproved expenses only from closed shifts OR standalone expenses (no shift_id)
      let unapprovedExpenses: any[] = [];
      if (closedShiftIds.length > 0) {
        const { data: shiftExpenses } = await supabase
          .from('cash_expenses')
          .select('*')
          .eq('approved', false)
          .in('shift_id', closedShiftIds)
          .order('date', { ascending: false });
        
        const { data: standaloneExpenses } = await supabase
          .from('cash_expenses')
          .select('*')
          .eq('approved', false)
          .is('shift_id', null)
          .order('date', { ascending: false });
        
        unapprovedExpenses = [...(shiftExpenses || []), ...(standaloneExpenses || [])];
      } else {
        // Only load standalone expenses if no closed shifts
        const { data: standaloneExpenses } = await supabase
          .from('cash_expenses')
          .select('*')
          .eq('approved', false)
          .is('shift_id', null)
          .order('date', { ascending: false });
        
        unapprovedExpenses = standaloneExpenses || [];
      }

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
      
      // Handover dates are recorded by when the shift ENDS:
      // - Night shift that starts Dec 18 evening → handover recorded as Dec 19 night (ends Dec 19 morning)
      // - Day shift Dec 19 → handover recorded as Dec 19 day
      // 
      // Previous shift logic (who gave you change fund when you STARTED your shift):
      // - Day shift Dec 19: previous = night Dec 19 (night that ended this morning at 5AM, gave you change fund)
      // - Night shift handover Dec 19: shift STARTED Dec 18 evening, received from day Dec 18
      const getPrevShift = (date: string, shift: string): { date: string; shift: string } => {
        if (shift === 'day') {
          // Day shift receives from night shift of SAME date (night ended this morning at 5AM)
          return { date, shift: 'night' };
        } else {
          // Night shift handover on Dec 19 = shift started Dec 18 evening
          // Received change fund from day shift of Dec 18 (who ended that evening at 5PM)
          const prevDate = new Date(date);
          prevDate.setDate(prevDate.getDate() - 1);
          return { date: prevDate.toISOString().split('T')[0], shift: 'day' };
        }
      };
      
      // Loyverse records sales by when the shift STARTS:
      // - Night shift handover Dec 19 = shift that started Dec 18 evening → Loyverse date = Dec 18
      // - Day shift handover Dec 19 = shift that started Dec 19 morning → Loyverse date = Dec 19
      const getLoyverseSalesDate = (handoverDate: string, shift: string): string => {
        if (shift === 'night') {
          // Night shift handover on Dec 19 = sales recorded under Dec 18 night
          const prevDate = new Date(handoverDate);
          prevDate.setDate(prevDate.getDate() - 1);
          return prevDate.toISOString().split('T')[0];
        }
        return handoverDate;
      };
      
      // Get carryover from previous shift's handover change_fund_amount
      const findCarryover = (date: string, shift: string): number => {
        const prev = getPrevShift(date, shift);
        // Find previous shift's handover (approved or not)
        const prevHandover = (allHandovers || []).find((ph: any) => {
          const phShift = ph.shift_type?.toLowerCase().includes('night') ? 'night' : 'day';
          return ph.shift_date === prev.date && phShift === prev.shift;
        });
        return prevHandover?.change_fund_amount || 2000; // Default 2000 if no previous handover
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
          // Find Loyverse sales - night shifts are recorded by START date (previous day)
          const salesDate = getLoyverseSalesDate(h.shift_date, shiftType);
          const register = registers?.find(r => r.date === salesDate && r.shift === shiftType);
          
          // Get carryover from previous shift's handover
          const carryover = findCarryover(h.shift_date, shiftType);
          
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
        // Expenses are recorded by shift START date (same as Loyverse)
        // So for night shift handover on Dec 19, expenses are under Dec 18
        const expenseDate = getLoyverseSalesDate(v.date, v.shift);
        // Only count 'shift' expenses, not 'balance' (investor) expenses
        const shiftExpenses = (allExpenses || []).filter(e => 
          e.date === expenseDate && e.shift === v.shift && e.expense_type === 'shift'
        );
        v.expenses = shiftExpenses as PendingExpense[];
        
        // Calculate expenses by payment source
        v.expensesCash = v.expenses
          .filter(e => e.payment_source === 'cash')
          .reduce((sum, e) => sum + e.amount, 0);
        v.expensesGcash = v.expenses
          .filter(e => e.payment_source === 'gcash')
          .reduce((sum, e) => sum + e.amount, 0);
        
        // Expected = Opening Cash (change_fund) + Loyverse Sales (total money received)
        // Expenses are tracked separately as part of what staff accounts for
        v.cashExpected = v.carryoverCash + v.loyverseCash;
        v.gcashExpected = v.carryoverGcash + v.loyverseGcash;
        v.totalExpected = v.cashExpected + v.gcashExpected;
        v.totalSubmitted = v.cashSubmitted + v.gcashSubmitted;
        // Total accounted = cash + gcash + change fund + expenses (all money accounted for by staff)
        v.totalAccountedFor = v.cashSubmitted + v.gcashSubmitted + v.changeFundLeaving + v.expensesCash + v.expensesGcash;
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
      
      if (handoverError) {
        console.error('Error fetching approved handovers:', handoverError);
      }
      
      const historyMap: Record<string, ApprovedHistory> = {};
      
      (approvedHandovers || []).forEach((h: any) => {
        const shiftType = h.shift_type?.toLowerCase().includes('night') ? 'night' : 'day';
        const key = `${h.shift_date}-${shiftType}`;
        
        if (!historyMap[key]) {
          // Find Loyverse sales - night shifts are recorded by START date (previous day)
          const salesDate = getLoyverseSalesDate(h.shift_date, shiftType);
          const register = registers?.find(r => r.date === salesDate && r.shift === shiftType);
          
          // Get carryover from previous shift's handover
          const carryover = findCarryover(h.shift_date, shiftType);
          
          // Get expenses for this shift - expenses are recorded by shift START date
          // Only count 'shift' expenses, not 'balance' (investor) expenses
          const expenseDate = getLoyverseSalesDate(h.shift_date, shiftType);
          const shiftExpenses = (allExpenses || []).filter(e => 
            e.date === expenseDate && e.shift === shiftType && e.expense_type === 'shift'
          );
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
            cashExpected: carryover + loyverseCash,
            gcashExpected: loyverseGcash,
            cashSubmitted: h.cash_amount || 0,
            gcashSubmitted: h.gcash_amount || 0,
            cashActual: register?.cash_actual || 0,
            gcashActual: register?.gcash_actual || 0,
            totalAccountedFor: 0,
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
        // Total accounted = submitted + change fund + expenses (all money accounted for)
        h.totalAccountedFor = h.cashSubmitted + h.gcashSubmitted + h.changeFundLeft + h.expensesCash + h.expensesGcash;
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

  // Load employees for manual history entry
  useEffect(() => {
    const loadEmployees = async () => {
      const { data } = await supabase
        .from('employees')
        .select('id, name')
        .eq('active', true)
        .order('name');
      setEmployees(data || []);
    };
    loadEmployees();
  }, []);

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
  
  // Add manual history entry
  const addManualHistoryEntry = async () => {
    if (!addHistoryDate || !addHistoryEmployee) {
      toast.error('Select date and employee');
      return;
    }
    const cash = parseInt(addHistoryCash) || 0;
    const gcash = parseInt(addHistoryGcash) || 0;
    const changeFund = parseInt(addHistoryChangeFund) || 2000;
    
    setProcessing('add-history');
    try {
      // Create cash_handover record
      await supabase.from('cash_handovers').insert({
        shift_date: addHistoryDate,
        shift_type: addHistoryShift, // 'day' or 'night'
        cash_amount: cash,
        gcash_amount: gcash,
        change_fund_amount: changeFund,
        handed_by_employee_id: addHistoryEmployee,
        approved: true
      });
      
      // Update cash_register with actual amounts if record exists
      const { data: existing } = await supabase
        .from('cash_register')
        .select('id, cash_actual, gcash_actual')
        .eq('date', addHistoryDate)
        .eq('shift', addHistoryShift)
        .maybeSingle();
      
      if (existing) {
        await supabase
          .from('cash_register')
          .update({
            cash_actual: (existing.cash_actual || 0) + cash,
            gcash_actual: (existing.gcash_actual || 0) + gcash
          })
          .eq('id', existing.id);
      }
      
      toast.success('History entry added');
      setShowAddHistoryDialog(false);
      setAddHistoryDate('');
      setAddHistoryCash('');
      setAddHistoryGcash('');
      setAddHistoryChangeFund('2000');
      setAddHistoryEmployee('');
      loadPendingData();
    } catch (e) {
      console.error('Error adding history:', e);
      toast.error('Failed to add history entry');
    } finally {
      setProcessing(null);
    }
  };

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
      ActivityLogger.expenseApprove(1);
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

  // Save carryover (opening balance) amount - update the previous shift's handover change_fund
  const saveCarryover = async (verification: PendingVerification, amount: number) => {
    try {
      // Find the previous shift type and date
      const prevShift = verification.shift === 'day' ? 'night' : 'day';
      const prevDate = verification.date; // Same date for both (night ends morning of same day)
      
      // Update the previous shift's handover change_fund_amount
      const { error } = await supabase
        .from('cash_handovers')
        .update({ change_fund_amount: amount })
        .eq('shift_date', prevDate)
        .ilike('shift_type', `%${prevShift}%`);
      
      if (error) throw error;
      
      toast.success('Размен обновлён');
      setEditingCarryover(null);
      loadPendingData();
    } catch (e) {
      console.error('Failed to update carryover:', e);
      toast.error('Ошибка при обновлении');
    }
  };

  // Send shift close report to Telegram
  const sendToTelegram = async (v: PendingVerification) => {
    const key = `${v.date}-${v.shift}`;
    setProcessing(key + '-tg');
    try {
      const employeeNames = v.shifts.map(s => s.employee_name);
      
      await supabase.functions.invoke('telegram-notify', {
        body: {
          action: 'shift_close_report',
          date: v.date,
          shiftType: v.shift,
          carryoverCash: v.carryoverCash,
          loyverseCash: v.loyverseCash,
          loyverseGcash: v.loyverseGcash,
          expensesCash: v.expensesCash,
          expensesGcash: v.expensesGcash,
          cashExpected: v.cashExpected,
          gcashExpected: v.gcashExpected,
          cashSubmitted: v.cashSubmitted,
          gcashSubmitted: v.gcashSubmitted,
          changeFundLeft: v.changeFundLeaving,
          totalExpected: v.totalExpected,
          totalAccountedFor: v.totalAccountedFor,
          difference: v.difference,
          employees: employeeNames
        }
      });
      
      toast.success('Report sent to Telegram');
    } catch (e) {
      console.error('Failed to send to Telegram:', e);
      toast.error('Failed to send to Telegram');
    } finally {
      setProcessing(null);
    }
  };

  // Send history report to Telegram
  const sendHistoryToTelegram = async (h: ApprovedHistory) => {
    const key = `${h.date}-${h.shift}`;
    setProcessing(key + '-tg');
    try {
      await supabase.functions.invoke('telegram-notify', {
        body: {
          action: 'shift_close_report',
          date: h.date,
          shiftType: h.shift,
          carryoverCash: h.carryoverCash,
          loyverseCash: h.loyverseCash,
          loyverseGcash: h.loyverseGcash,
          expensesCash: h.expensesCash,
          expensesGcash: h.expensesGcash,
          cashExpected: h.cashExpected,
          gcashExpected: h.gcashExpected,
          cashSubmitted: h.cashSubmitted,
          gcashSubmitted: h.gcashSubmitted,
          changeFundLeft: h.changeFundLeft,
          totalExpected: h.cashExpected + h.gcashExpected,
          totalAccountedFor: h.totalAccountedFor,
          difference: h.difference,
          employees: h.employees
        }
      });
      
      toast.success('Report sent to Telegram');
    } catch (e) {
      console.error('Failed to send to Telegram:', e);
      toast.error('Failed to send to Telegram');
    } finally {
      setProcessing(null);
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
      ActivityLogger.cashReceived(cash, gcash, confirmingVerification.date, confirmingVerification.shift);
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
    // Total cash = cash submitted + change fund leaving
    const totalCash = v.cashSubmitted + v.changeFundLeaving;
    setEditTotalCash(totalCash.toString());
    setEditGcashSubmitted(v.gcashSubmitted.toString());
    setEditChangeFundLeaving(v.changeFundLeaving.toString());
  };

  // Save edited submitted amounts
  const saveEditedSubmitted = async (v: PendingVerification) => {
    const totalCash = parseInt(editTotalCash) || 0;
    const gcashAmount = parseInt(editGcashSubmitted) || 0;
    const changeFund = parseInt(editChangeFundLeaving) || 0;
    // Cash submitted = total cash - change fund
    const cashAmount = totalCash - changeFund;
    
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
    // Total cash = cash submitted + change fund left
    const totalCash = h.cashSubmitted + h.changeFundLeft;
    setEditHistoryTotalCash(totalCash.toString());
    setEditHistoryGcash(h.gcashSubmitted.toString());
    setEditHistoryChangeFund(h.changeFundLeft.toString());
  };

  const saveEditHistory = async (h: ApprovedHistory) => {
    const totalCash = parseInt(editHistoryTotalCash) || 0;
    const gcashSubmitted = parseInt(editHistoryGcash) || 0;
    const changeFund = parseInt(editHistoryChangeFund) || 0;
    // Cash submitted = total cash - change fund
    const cashSubmitted = totalCash - changeFund;
    
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
      ActivityLogger.cashEdit(h.date, h.shift);
      setEditingHistoryKey(null);
      loadPendingData();
    } catch (e) {
      toast.error('Failed to update');
    }
  };
  
  // Delete history entry
  const deleteHistoryEntry = async (h: ApprovedHistory) => {
    const key = `${h.date}-${h.shift}`;
    setProcessing(key + '-del');
    try {
      // Delete cash_handovers for this date/shift
      await supabase
        .from('cash_handovers')
        .delete()
        .eq('shift_date', h.date)
        .ilike('shift_type', `%${h.shift}%`);
      
      toast.success('History entry deleted');
      loadPendingData();
    } catch (e) {
      console.error('Error deleting history:', e);
      toast.error('Failed to delete');
    } finally {
      setProcessing(null);
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
                            <span className="text-muted-foreground">💵 Total Cash:</span>
                            <Input
                              type="number"
                              className="h-6 text-xs w-24 text-right"
                              value={editHistoryTotalCash}
                              onChange={e => setEditHistoryTotalCash(e.target.value)}
                              onClick={e => e.stopPropagation()}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">− Change fund:</span>
                            <Input
                              type="number"
                              className="h-6 text-xs w-24 text-right"
                              value={editHistoryChangeFund}
                              onChange={e => setEditHistoryChangeFund(e.target.value)}
                              onClick={e => e.stopPropagation()}
                            />
                          </div>
                          <div className="flex justify-between border-t border-border/50 pt-1">
                            <span className="text-muted-foreground">= Cash handed:</span>
                            <span className="font-medium">₱{((parseInt(editHistoryTotalCash) || 0) - (parseInt(editHistoryChangeFund) || 0)).toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-2">
                            <span className="text-muted-foreground">📱 GCash:</span>
                            <Input
                              type="number"
                              className="h-6 text-xs w-24 text-right"
                              value={editHistoryGcash}
                              onChange={e => setEditHistoryGcash(e.target.value)}
                              onClick={e => e.stopPropagation()}
                            />
                          </div>
                          <div className="flex justify-between border-t border-border/50 pt-1 font-bold">
                            <span>Total Accounted:</span>
                            <span>₱{((parseInt(editHistoryTotalCash) || 0) + (parseInt(editHistoryGcash) || 0)).toLocaleString()}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-background/50 p-2 rounded space-y-2 text-xs">
                          {/* Summary breakdown */}
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Total Cash in register</span>
                              <span className="font-medium">₱{(h.cashSubmitted + h.changeFundLeft).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">− Change fund left</span>
                              <span className="text-amber-600">₱{h.changeFundLeft.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between border-t border-border/50 pt-1">
                              <span className="text-muted-foreground">= Cash handed over</span>
                              <span>₱{h.cashSubmitted.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between mt-1">
                              <span className="text-muted-foreground">GCash handed over</span>
                              <span>₱{h.gcashSubmitted.toLocaleString()}</span>
                            </div>
                          </div>
                          
                          {/* Detailed comparison table */}
                          <div className="border-t border-border/50 pt-2 mt-2">
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div></div>
                              <div className="text-center font-medium">💵 Cash</div>
                              <div className="text-center font-medium">📱 GCash</div>
                              
                              <div className="text-muted-foreground">Expected:</div>
                              <div className="text-center">₱{h.cashExpected.toLocaleString()}</div>
                              <div className="text-center">₱{h.gcashExpected.toLocaleString()}</div>
                              
                              <div className="text-muted-foreground">Handed:</div>
                              <div className="text-center">₱{h.cashSubmitted.toLocaleString()}</div>
                              <div className="text-center">₱{h.gcashSubmitted.toLocaleString()}</div>
                              
                              <div className="text-muted-foreground text-amber-600">+ Change left:</div>
                              <div className="text-center text-amber-600">₱{h.changeFundLeft.toLocaleString()}</div>
                              <div className="text-center text-muted-foreground">—</div>
                              
                              <div className="text-muted-foreground font-medium">= Accounted:</div>
                              <div className="text-center font-medium">₱{(h.cashSubmitted + h.changeFundLeft).toLocaleString()}</div>
                              <div className="text-center font-medium">₱{h.gcashSubmitted.toLocaleString()}</div>
                              
                              <div className="font-medium">Diff:</div>
                              <div className={cn("text-center font-bold", ((h.cashSubmitted + h.changeFundLeft) - h.cashExpected) >= 0 ? "text-green-500" : "text-red-500")}>
                                {((h.cashSubmitted + h.changeFundLeft) - h.cashExpected) >= 0 ? '+' : ''}₱{((h.cashSubmitted + h.changeFundLeft) - h.cashExpected).toLocaleString()}
                              </div>
                              <div className={cn("text-center font-bold", (h.gcashSubmitted - h.gcashExpected) >= 0 ? "text-green-500" : "text-red-500")}>
                                {(h.gcashSubmitted - h.gcashExpected) >= 0 ? '+' : ''}₱{(h.gcashSubmitted - h.gcashExpected).toLocaleString()}
                              </div>
                            </div>
                          </div>
                          
                          {/* Total summary */}
                          <div className="border-t border-border/50 pt-2">
                            <div className="flex justify-between font-bold">
                              <span>Total Accounted</span>
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
              {/* SIMPLIFIED: What was expected */}
              <div className="p-3 rounded-lg bg-muted/30 space-y-2">
                <p className="text-xs font-medium text-muted-foreground mb-2">💰 Ожидаемая касса</p>
                
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Размен с прошлой смены:</span>
                  <span className="font-medium flex items-center gap-1">
                    ₱{v.carryoverCash.toLocaleString()}
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="h-5 w-5 p-0"
                      onClick={() => {
                        setEditingCarryover(key);
                        setCarryoverInput(v.carryoverCash.toString());
                      }}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                  </span>
                </div>
                
                {editingCarryover === key && (
                  <div className="flex items-center gap-2 pl-4">
                    <Input
                      type="number"
                      className="h-7 w-24 text-sm"
                      value={carryoverInput}
                      onChange={(e) => setCarryoverInput(e.target.value)}
                      autoFocus
                    />
                    <Button size="sm" variant="ghost" className="h-7 text-green-500" onClick={() => saveCarryover(v, parseInt(carryoverInput) || 0)}>
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-red-500" onClick={() => setEditingCarryover(null)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                )}
                
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">+ Продажи (Cash):</span>
                  <span className="text-green-600">₱{v.loyverseCash.toLocaleString()}</span>
                </div>
                
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">+ Продажи (GCash):</span>
                  <span className="text-blue-500">₱{v.loyverseGcash.toLocaleString()}</span>
                </div>
                
                {/* Expenses shown in "Сдано сотрудниками" section as part of accounted money */}
                
                <div className="flex justify-between text-sm pt-2 border-t border-border font-bold">
                  <span>= Должно быть:</span>
                  <span>₱{v.totalExpected.toLocaleString()}</span>
                </div>
              </div>

              {/* SIMPLIFIED: What staff submitted */}
              <div className="p-3 rounded-lg bg-muted/30 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">📋 Сдано сотрудниками</p>
                  {editingSubmitted !== key ? (
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => startEditSubmitted(v)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                  ) : (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-6 text-green-500" onClick={() => saveEditedSubmitted(v)}>
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 text-red-500" onClick={() => setEditingSubmitted(null)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
                
                {editingSubmitted === key ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Вся касса:</span>
                      <Input
                        type="number"
                        className="h-8 w-28 text-right"
                        value={editTotalCash}
                        onChange={e => setEditTotalCash(e.target.value)}
                      />
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Оставлено на размен:</span>
                      <Input
                        type="number"
                        className="h-8 w-28 text-right"
                        value={editChangeFundLeaving}
                        onChange={e => setEditChangeFundLeaving(e.target.value)}
                      />
                    </div>
                    <div className="flex justify-between text-sm pt-1 border-t border-border/50">
                      <span className="text-muted-foreground">= Сдано наличными:</span>
                      <span className="font-medium">₱{((parseInt(editTotalCash) || 0) - (parseInt(editChangeFundLeaving) || 0)).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">GCash:</span>
                      <Input
                        type="number"
                        className="h-8 w-28 text-right"
                        value={editGcashSubmitted}
                        onChange={e => setEditGcashSubmitted(e.target.value)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Вся касса:</span>
                      <span className="font-medium">₱{(v.cashSubmitted + v.changeFundLeaving).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Оставлено на размен:</span>
                      <span className="text-amber-600">₱{v.changeFundLeaving.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm pt-1 border-t border-border/50">
                      <span className="text-muted-foreground">= Сдано наличными:</span>
                      <span>₱{v.cashSubmitted.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">GCash:</span>
                      <span className="text-blue-500">₱{v.gcashSubmitted.toLocaleString()}</span>
                    </div>
                    {(v.expensesCash > 0 || v.expensesGcash > 0) && (
                      <div className="flex justify-between text-sm pt-1 border-t border-border/50">
                        <span className="text-muted-foreground">+ Расходы за смену:</span>
                        <span className="text-orange-500">₱{(v.expensesCash + v.expensesGcash).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="flex justify-between text-sm pt-2 border-t border-border font-bold">
                  <span>Итого учтено:</span>
                  <span>
                    ₱{editingSubmitted === key 
                      ? ((parseInt(editTotalCash) || 0) + (parseInt(editGcashSubmitted) || 0) + v.expensesCash + v.expensesGcash).toLocaleString()
                      : v.totalAccountedFor.toLocaleString()
                    }
                  </span>
                </div>
              </div>

              {/* SIMPLIFIED: Result */}
              <div className={cn(
                "p-3 rounded-lg border-2",
                isSurplus && "bg-green-500/10 border-green-500/50",
                isShortage && "bg-red-500/10 border-red-500/50",
                isMatch && "bg-blue-500/10 border-blue-500/50"
              )}>
                <div className="flex items-center justify-between">
                  <span className="font-medium flex items-center gap-2">
                    {isShortage && <TrendingDown className="w-5 h-5 text-red-500" />}
                    {isSurplus && <TrendingUp className="w-5 h-5 text-green-500" />}
                    {isMatch && <Check className="w-5 h-5 text-blue-500" />}
                    {isShortage ? 'НЕДОСТАЧА' : isSurplus ? 'ИЗЛИШЕК' : 'СХОДИТСЯ'}
                  </span>
                  <span className={cn(
                    "font-bold text-xl",
                    isShortage && "text-red-500",
                    isSurplus && "text-green-500",
                    isMatch && "text-blue-500"
                  )}>
                    {v.difference !== 0 && (v.difference > 0 ? '+' : '')}₱{Math.abs(v.difference).toLocaleString()}
                  </span>
                </div>
                
                <div className="mt-2 pt-2 border-t border-border/50 text-sm text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Должно быть:</span>
                    <span>₱{v.totalExpected.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Учтено:</span>
                    <span>₱{v.totalAccountedFor.toLocaleString()}</span>
                  </div>
                </div>
              </div>

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
                  variant="outline"
                  size="sm"
                  onClick={() => sendToTelegram(v)}
                  disabled={processing === key + '-tg'}
                >
                  {processing === key + '-tg' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
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

      {/* Approved History - Simplified */}
      <Card>
        <CardHeader className="py-3 pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2 cursor-pointer" onClick={() => setShowHistory(!showHistory)}>
              <History className="w-4 h-4 text-muted-foreground" />
              История ({approvedHistory.length})
              {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                setShowAddHistoryDialog(true);
              }}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        {showHistory && (
          <CardContent className="space-y-1 pt-0">
            {approvedHistory.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Нет подтверждённых смен</p>
            )}
            {approvedHistory.map(h => {
              const displayDiff = h.difference;
              const isPositive = displayDiff > 0;
              const isNegative = displayDiff < 0;
              const isMatch = displayDiff === 0;
              
              return (
                <div 
                  key={`${h.date}-${h.shift}`} 
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg border",
                    isPositive && "bg-green-500/5 border-green-500/20",
                    isNegative && "bg-red-500/5 border-red-500/20",
                    isMatch && "bg-blue-500/5 border-blue-500/20"
                  )}
                >
                  {/* Left: Date & Shift */}
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{h.shift === 'day' ? '☀️' : '🌙'}</span>
                    <div>
                      <p className="font-medium">{h.date}</p>
                      <p className="text-xs text-muted-foreground">{h.employees.join(', ')}</p>
                    </div>
                  </div>
                  
                  {/* Center: Key numbers */}
                  <div className="flex items-center gap-4 text-sm">
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground">Получили</p>
                      <p className="font-medium">₱{h.carryoverCash.toLocaleString()}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground">Оставили</p>
                      <p className="font-medium">₱{h.changeFundLeft.toLocaleString()}</p>
                    </div>
                  </div>
                  
                  {/* Right: Result & Actions */}
                  <div className="flex items-center gap-2">
                    <Badge className={cn(
                      "text-xs font-bold min-w-16 justify-center",
                      isPositive && "bg-green-500",
                      isNegative && "bg-red-500",
                      isMatch && "bg-blue-500"
                    )}>
                      {isMatch ? '✓ OK' : `${displayDiff > 0 ? '+' : ''}₱${displayDiff.toLocaleString()}`}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => sendHistoryToTelegram(h)}
                      disabled={processing === `${h.date}-${h.shift}-tg`}
                    >
                      {processing === `${h.date}-${h.shift}-tg` ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Send className="w-3 h-3" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-500"
                      onClick={() => {
                        if (confirm('Удалить?')) {
                          deleteHistoryEntry(h);
                        }
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
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

      {/* Add Manual History Dialog */}
      <Dialog open={showAddHistoryDialog} onOpenChange={setShowAddHistoryDialog}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add History Entry
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Date</label>
              <Input
                type="date"
                value={addHistoryDate}
                onChange={e => setAddHistoryDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Shift</label>
              <Select value={addHistoryShift} onValueChange={(v: 'day' | 'night') => setAddHistoryShift(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">☀️ Day</SelectItem>
                  <SelectItem value="night">🌙 Night</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Employee</label>
              <Select value={addHistoryEmployee} onValueChange={setAddHistoryEmployee}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                  <Banknote className="w-3 h-3 text-green-500" /> Cash
                </label>
                <Input
                  type="number"
                  placeholder="0"
                  value={addHistoryCash}
                  onChange={e => setAddHistoryCash(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                  <Smartphone className="w-3 h-3 text-blue-500" /> GCash
                </label>
                <Input
                  type="number"
                  placeholder="0"
                  value={addHistoryGcash}
                  onChange={e => setAddHistoryGcash(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Change Fund Left</label>
              <Input
                type="number"
                placeholder="2000"
                value={addHistoryChangeFund}
                onChange={e => setAddHistoryChangeFund(e.target.value)}
              />
            </div>
            <Button 
              className="w-full" 
              onClick={addManualHistoryEntry}
              disabled={processing === 'add-history'}
            >
              {processing === 'add-history' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Add Entry
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
