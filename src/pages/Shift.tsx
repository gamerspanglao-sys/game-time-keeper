// Shift page - employee shift management
import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Clock, Play, Banknote, User, Sun, Moon, Plus, Receipt, Square, AlertTriangle, CheckCircle2, Send, Lock, Pencil, Trash2, Users, BarChart3 } from 'lucide-react';
import { ActivityLogger } from '@/lib/activityLogger';
import { ShiftDashboard } from '@/components/staff/ShiftDashboard';

type ShiftType = 'day' | 'night';
type ShiftStatus = 'open' | 'ended' | 'closed';

interface Employee {
  id: string;
  name: string;
}

interface ActiveShift {
  id: string;
  employee_id: string;
  employee_name: string;
  shift_start: string;
  type: ShiftType;
  status: ShiftStatus;
}

interface ShiftExpense {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  created_at: string;
  payment_source: string;
  shift_id: string | null;
  responsible_employee_id: string | null;
  responsible_name?: string;
}

interface CashHandover {
  id: string;
  shift_type: ShiftType;
  shift_date: string;
  cash_amount: number;
  gcash_amount: number;
  change_fund_amount: number;
  handed_by_employee_id: string;
  employee_name?: string;
  handover_time: string;
  comment: string | null;
}

const EXPENSE_CATEGORIES = [
  { value: 'employee_food', label: 'Employee Food' },
  { value: 'food_hunters', label: 'Food Hunters' },
  { value: 'purchases', label: 'Purchases' },
  { value: 'other', label: 'Other' }
];

// Get Manila time
const getManilaTime = (): Date => {
  const now = new Date();
  const manilaOffset = 8 * 60;
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utcTime + (manilaOffset * 60000));
};

// Determine shift type based on Manila hour
// Day: 05:00 - 16:59, Night: 17:00 - 04:59
const getCurrentShiftType = (): ShiftType => {
  const manilaTime = getManilaTime();
  const hour = manilaTime.getHours();
  return hour >= 5 && hour < 17 ? 'day' : 'night';
};

// Get shift date (for night shift after midnight, use previous day)
const getShiftDate = (): string => {
  const manilaTime = getManilaTime();
  const hour = manilaTime.getHours();
  
  // Night shift maps to the day it STARTED
  // At 2 AM Dec 18, we're still in the Dec 17 night shift
  if (hour < 5) {
    manilaTime.setDate(manilaTime.getDate() - 1);
  }
  return format(manilaTime, 'yyyy-MM-dd');
};

// Get handover date from shift_start timestamp
// Night shifts that start after 5 PM belong to the NEXT day's date for handover
const getHandoverDateFromShiftStart = (shiftStart: string, shiftType: string): string => {
  const startUtc = new Date(shiftStart);
  // Convert to Manila time
  const manilaOffset = 8 * 60;
  const startManilaTime = new Date(startUtc.getTime() + (startUtc.getTimezoneOffset() + manilaOffset) * 60000);
  const startHour = startManilaTime.getHours();
  
  // Night shift that started after 5 PM - handover date is NEXT day
  if (shiftType === 'night' && startHour >= 17) {
    const nextDay = new Date(startManilaTime);
    nextDay.setDate(nextDay.getDate() + 1);
    return format(nextDay, 'yyyy-MM-dd');
  }
  
  return format(startManilaTime, 'yyyy-MM-dd');
};

// Get previous shift type and date for handover lookup
// Previous shift = who gave you change fund when you STARTED your shift
const getPreviousShiftInfo = (): { shiftType: ShiftType; shiftDate: string } => {
  const currentType = getCurrentShiftType();
  const manilaTime = getManilaTime();
  const hour = manilaTime.getHours();
  const today = format(manilaTime, 'yyyy-MM-dd');
  
  if (currentType === 'day') {
    // Day shift - previous was night shift
    // Night shift handover is recorded with TODAY's date (since it started yesterday evening)
    if (hour < 5) {
      // Before 5 AM, still night shift period - previous was yesterday's day shift
      const yesterday = new Date(manilaTime);
      yesterday.setDate(yesterday.getDate() - 1);
      return { shiftType: 'day', shiftDate: format(yesterday, 'yyyy-MM-dd') };
    } else {
      // After 5 AM, day shift - previous was night shift with TODAY's date
      return { shiftType: 'night', shiftDate: today };
    }
  } else {
    // Night shift started THIS evening - previous was day shift of TODAY
    // (day shift that ended this evening at 5PM gave you change fund)
    return { shiftType: 'day', shiftDate: today };
  }
};

export default function Shift() {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [activeShifts, setActiveShifts] = useState<ActiveShift[]>([]);
  const [currentHandover, setCurrentHandover] = useState<CashHandover | null>(null);

  // Cash handover for Close Shift - totalCashAmount = cash to hand over + change fund
  const [cashEmployee, setCashEmployee] = useState<string>('');
  const [totalCashAmount, setTotalCashAmount] = useState(''); // Full cash in register
  const [gcashAmount, setGcashAmount] = useState('');
  const [changeFundAmount, setChangeFundAmount] = useState('2000');
  const [handoverComment, setHandoverComment] = useState('');
  const [closingShift, setClosingShift] = useState(false);

  // Expense tracking
  const [shiftExpenses, setShiftExpenses] = useState<ShiftExpense[]>([]);
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expensePaymentSource, setExpensePaymentSource] = useState<'cash' | 'gcash'>('cash');
  const [expenseResponsible, setExpenseResponsible] = useState('');
  const [addingExpense, setAddingExpense] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  // End work dialog (individual)
  const [showEndWorkDialog, setShowEndWorkDialog] = useState(false);
  const [pendingEndWorkEmployee, setPendingEndWorkEmployee] = useState<string | null>(null);
  const [endingWork, setEndingWork] = useState(false);

  // Close shift dialog (all employees)
  const [showCloseShiftDialog, setShowCloseShiftDialog] = useState(false);

  // Start shift confirmation dialog
  const [showStartShiftDialog, setShowStartShiftDialog] = useState(false);
  const [pendingStartEmployee, setPendingStartEmployee] = useState<string | null>(null);
  const [previousHandover, setPreviousHandover] = useState<CashHandover | null>(null);
  const [startingShift, setStartingShift] = useState(false);
  const [cashVerified, setCashVerified] = useState(false);
  const [changeFundReceived, setChangeFundReceived] = useState('');

  // Effective shift type based on active shifts
  const effectiveShiftType = activeShifts.length > 0 ? activeShifts[0].type : getCurrentShiftType();
  const currentDate = activeShifts.length > 0 
    ? getHandoverDateFromShiftStart(activeShifts[0].shift_start, activeShifts[0].type)
    : getShiftDate();

  // Check if all employees have ended (but shift not closed)
  const allEnded = activeShifts.length > 0 && activeShifts.every(s => s.status === 'ended');
  const hasOpenShifts = activeShifts.some(s => s.status === 'open');
  const hasEndedShifts = activeShifts.some(s => s.status === 'ended');

  useEffect(() => {
    loadData();
    
    const channel = supabase
      .channel('shift-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => {
        loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_expenses' }, () => {
        loadShiftExpenses();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_handovers' }, () => {
        loadCurrentHandover();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadData = async () => {
    try {
      const [{ data: empData }, { data: shiftsData }] = await Promise.all([
        supabase.from('employees').select('id, name').eq('active', true).order('name'),
        supabase
          .from('shifts')
          .select('id, employee_id, shift_start, type, status, employees!inner(name)')
          .in('status', ['open', 'ended'])
          .order('shift_start', { ascending: false })
      ]);

      setEmployees(empData || []);
      
      const mappedShifts = (shiftsData || []).map((s: any) => ({
        id: s.id,
        employee_id: s.employee_id,
        employee_name: s.employees?.name || 'Unknown',
        shift_start: s.shift_start,
        type: s.type || 'day',
        status: s.status || 'open'
      }));
      
      setActiveShifts(mappedShifts);

      // Load expenses with the fresh shifts data
      await loadShiftExpensesWithShifts(mappedShifts);
      await loadCurrentHandoverWithShifts(mappedShifts);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadCurrentHandoverWithShifts = async (shifts: ActiveShift[]) => {
    try {
      // Use effective shift type from provided shifts
      const shiftType = shifts.length > 0 ? shifts[0].type : getCurrentShiftType();
      const shiftDate = shifts.length > 0 
        ? getHandoverDateFromShiftStart(shifts[0].shift_start, shifts[0].type)
        : getShiftDate();

      const { data } = await supabase
        .from('cash_handovers')
        .select('*, employees:handed_by_employee_id(name)')
        .eq('shift_type', shiftType)
        .eq('shift_date', shiftDate)
        .maybeSingle();

      if (data) {
        setCurrentHandover({
          id: data.id,
          shift_type: data.shift_type as ShiftType,
          shift_date: data.shift_date,
          cash_amount: data.cash_amount,
          gcash_amount: data.gcash_amount,
          change_fund_amount: data.change_fund_amount,
          handed_by_employee_id: data.handed_by_employee_id,
          handover_time: data.handover_time,
          comment: data.comment,
          employee_name: (data.employees as any)?.name
        });
      } else {
        setCurrentHandover(null);
      }
    } catch (e) {
      console.error(e);
      setCurrentHandover(null);
    }
  };

  const loadCurrentHandover = async () => {
    await loadCurrentHandoverWithShifts(activeShifts);
  };

  const loadShiftExpensesWithShifts = async (shifts: ActiveShift[]) => {
    try {
      // Use handover date from active shifts
      const shiftType = shifts.length > 0 ? shifts[0].type : getCurrentShiftType();
      const shiftDate = shifts.length > 0 
        ? getHandoverDateFromShiftStart(shifts[0].shift_start, shifts[0].type)
        : getShiftDate();
      
      const { data, error } = await supabase
        .from('cash_expenses')
        .select('*')
        .eq('date', shiftDate)
        .eq('shift', shiftType)
        .eq('expense_type', 'shift')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error loading expenses:', error);
        setShiftExpenses([]);
        return;
      }
      
      const expenses = data || [];

      // Load employee names separately
      const expensesWithNames = await Promise.all(expenses.map(async (e: any) => {
        let responsibleName = '';
        if (e.responsible_employee_id) {
          const { data: empData } = await supabase
            .from('employees')
            .select('name')
            .eq('id', e.responsible_employee_id)
            .maybeSingle();
          responsibleName = empData?.name || '';
        }
        return { ...e, responsible_name: responsibleName };
      }));

      setShiftExpenses(expensesWithNames);
    } catch (e) {
      console.error(e);
      setShiftExpenses([]);
    }
  };

  const loadShiftExpenses = () => {
    loadShiftExpensesWithShifts(activeShifts);
  };

  const confirmStartShift = async (employeeId: string) => {
    const existingShift = activeShifts.find(s => s.employee_id === employeeId);
    if (existingShift) {
      toast.error('You already have an open shift');
      return;
    }

    setPendingStartEmployee(employeeId);
    setCashVerified(false);
    
    // Get previous shift's handover
    try {
      const prevInfo = getPreviousShiftInfo();
      
      const { data: prevHandover } = await supabase
        .from('cash_handovers')
        .select('*, employees:handed_by_employee_id(name)')
        .eq('shift_type', prevInfo.shiftType)
        .eq('shift_date', prevInfo.shiftDate)
        .maybeSingle();

      if (prevHandover) {
        setPreviousHandover({
          id: prevHandover.id,
          shift_type: prevHandover.shift_type as ShiftType,
          shift_date: prevHandover.shift_date,
          cash_amount: prevHandover.cash_amount,
          gcash_amount: prevHandover.gcash_amount,
          change_fund_amount: prevHandover.change_fund_amount,
          handed_by_employee_id: prevHandover.handed_by_employee_id,
          handover_time: prevHandover.handover_time,
          comment: prevHandover.comment,
          employee_name: (prevHandover.employees as any)?.name
        });
        // Pre-fill with expected amount
        setChangeFundReceived(prevHandover.change_fund_amount?.toString() || '2000');
      } else {
        setPreviousHandover(null);
        setChangeFundReceived('2000'); // Default
      }
    } catch (e) {
      console.error(e);
      setPreviousHandover(null);
      setChangeFundReceived('2000');
    }
    
    setShowStartShiftDialog(true);
  };

  const handleStartShift = async () => {
    if (!pendingStartEmployee) return;
    if (!cashVerified) {
      toast.error('Please verify cash amounts first');
      return;
    }
    
    const receivedAmount = parseInt(changeFundReceived) || 0;
    if (receivedAmount <= 0) {
      toast.error('Enter valid change fund received amount');
      return;
    }
    
    const employeeName = employees.find(e => e.id === pendingStartEmployee)?.name || 'Unknown';
    // Use calculated shift type for new shifts (no active shifts)
    const newShiftType = activeShifts.length > 0 ? activeShifts[0].type : getCurrentShiftType();
    const newShiftDate = activeShifts.length > 0 
      ? getHandoverDateFromShiftStart(activeShifts[0].shift_start, activeShifts[0].type)
      : getShiftDate();
    
    setStartingShift(true);
    try {
      const { error } = await supabase.from('shifts').insert({
        employee_id: pendingStartEmployee,
        date: newShiftDate,
        shift_start: new Date().toISOString(),
        type: newShiftType,
        status: 'open',
        change_fund_received: receivedAmount
      });

      if (error) throw error;

      // Send Telegram notification
      try {
        await supabase.functions.invoke('telegram-notify', {
          body: {
            action: 'shift_start',
            employeeName,
            time: getManilaTime().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
            previousCash: previousHandover?.cash_amount || 0,
            previousGcash: previousHandover?.gcash_amount || 0,
            changeFund: previousHandover?.change_fund_amount || 2000,
            previousEmployee: previousHandover?.employee_name || null
          }
        });
      } catch (e) {
        console.log('Telegram notification failed:', e);
      }

      toast.success('Shift started');
      ActivityLogger.shiftStart(employeeName, newShiftType === 'day' ? 'Day' : 'Night');
      loadData();
    } catch (e) {
      console.error(e);
      toast.error('Failed to start shift');
    } finally {
      setStartingShift(false);
      setShowStartShiftDialog(false);
      setPendingStartEmployee(null);
      setCashVerified(false);
    }
  };

  // Individual: End Work (not close shift)
  const confirmEndWork = (employeeId: string) => {
    setPendingEndWorkEmployee(employeeId);
    setShowEndWorkDialog(true);
  };

  const handleEndWork = async () => {
    if (!pendingEndWorkEmployee) return;
    
    const activeShift = activeShifts.find(s => s.employee_id === pendingEndWorkEmployee);
    const employeeName = employees.find(e => e.id === pendingEndWorkEmployee)?.name || 'Unknown';
    
    if (!activeShift) return;

    setEndingWork(true);
    try {
      const totalHours = calculateTotalHours(activeShift.shift_start);
      
      // Set status to 'ended' (not 'closed')
      const { error } = await supabase
        .from('shifts')
        .update({
          shift_end: new Date().toISOString(),
          total_hours: totalHours,
          status: 'ended'
        })
        .eq('id', activeShift.id);

      if (error) throw error;

      toast.success(`${employeeName} finished work`);
      ActivityLogger.shiftEnd(employeeName);
      loadData();
    } catch (e) {
      console.error(e);
      toast.error('Failed to end work');
    } finally {
      setEndingWork(false);
      setShowEndWorkDialog(false);
      setPendingEndWorkEmployee(null);
    }
  };

  // Close entire shift
  const openCloseShiftDialog = () => {
    setCashEmployee('');
    setTotalCashAmount('');
    setGcashAmount('');
    setChangeFundAmount('2000');
    setHandoverComment('');
    setShowCloseShiftDialog(true);
  };

  const handleCloseShift = async () => {
    if (!cashEmployee) {
      toast.error('Select who is submitting cash');
      return;
    }

    const totalCash = parseInt(totalCashAmount) || 0;
    const gcash = parseInt(gcashAmount) || 0;
    const changeFund = parseInt(changeFundAmount) || 0;
    // Cash handed over = total cash in register - change fund left
    const cash = totalCash - changeFund;

    if (totalCash === 0 && gcash === 0) {
      toast.error('Enter total cash or GCash amount');
      return;
    }

    if (changeFund <= 0) {
      toast.error('Change fund is required');
      return;
    }

    if (cash < 0) {
      toast.error('Change fund cannot be more than total cash');
      return;
    }

    setClosingShift(true);
    try {
      const employeeName = employees.find(e => e.id === cashEmployee)?.name || 'Unknown';
      
      // 1. Create cash handover record
      const { error: handoverError } = await supabase.from('cash_handovers').insert({
        shift_type: effectiveShiftType,
        shift_date: currentDate,
        cash_amount: cash,
        gcash_amount: gcash,
        change_fund_amount: changeFund,
        handed_by_employee_id: cashEmployee,
        handover_time: new Date().toISOString(),
        comment: handoverComment || null,
        approved: false
      });

      if (handoverError) throw handoverError;

      // 2. Close all 'ended' shifts
      const shiftIds = activeShifts.filter(s => s.status === 'ended').map(s => s.id);
      if (shiftIds.length > 0) {
        const { error: closeError } = await supabase
          .from('shifts')
          .update({ status: 'closed' })
          .in('id', shiftIds);
        
        if (closeError) throw closeError;
      }

      // Log activity
      ActivityLogger.shiftClose(effectiveShiftType === 'day' ? 'Day' : 'Night', cash, gcash);

      // 3. Send Telegram notifications
      try {
        // Cash handover notification
        await supabase.functions.invoke('telegram-notify', {
          body: {
            action: 'cash_handover',
            employeeName,
            cash,
            gcash,
            changeFund,
            shiftType: effectiveShiftType === 'day' ? 'Day' : 'Night'
          }
        });

        // Send shift end notifications for all employees
        for (const shift of activeShifts) {
          const totalHours = shift.status === 'ended' 
            ? calculateTotalHours(shift.shift_start)
            : 0;
          
          await supabase.functions.invoke('telegram-notify', {
            body: {
              action: 'shift_end',
              employeeName: shift.employee_name,
              totalHours: totalHours.toFixed(1),
              baseSalary: 500
            }
          });
        }
      } catch (e) {
        console.log('Telegram notification failed:', e);
      }

      toast.success('Shift closed successfully');
      setShowCloseShiftDialog(false);
      loadData();
    } catch (e: any) {
      console.error(e);
      if (e.code === '23505') {
        toast.error('Cash already submitted for this shift');
      } else {
        toast.error('Failed to close shift');
      }
    } finally {
      setClosingShift(false);
    }
  };

  const calculateTotalHours = (startTime: string): number => {
    const start = new Date(startTime).getTime();
    const end = Date.now();
    return parseFloat(((end - start) / (1000 * 60 * 60)).toFixed(2));
  };

  const openExpenseDialog = () => {
    setExpenseAmount('');
    setExpenseCategory('');
    setExpenseDescription('');
    setExpensePaymentSource('cash');
    setExpenseResponsible('');
    setShowExpenseDialog(true);
  };

  const addExpense = async () => {
    const amount = parseInt(expenseAmount) || 0;
    if (amount <= 0) {
      toast.error('Enter valid amount');
      return;
    }
    if (!expenseCategory) {
      toast.error('Select category');
      return;
    }
    if (!expenseResponsible) {
      toast.error('Select responsible person');
      return;
    }

    // Get the responsible employee's shift (can be open or ended)
    const employeeShift = activeShifts.find(s => s.employee_id === expenseResponsible);
    if (!employeeShift) {
      toast.error('Employee has no active shift');
      return;
    }

    setAddingExpense(true);
    try {
      // Use current Manila date (when expense is actually made)
      const manilaTime = getManilaTime();
      const expenseDate = format(manilaTime, 'yyyy-MM-dd');
      const shiftType = employeeShift.type;

      // Get or create cash register for that date/shift
      let { data: register } = await supabase
        .from('cash_register')
        .select('id')
        .eq('date', expenseDate)
        .eq('shift', shiftType)
        .maybeSingle();

      if (!register) {
        const { data: newRegister, error: createError } = await supabase
          .from('cash_register')
          .insert({ date: expenseDate, shift: shiftType })
          .select('id')
          .single();
        
        if (createError) throw createError;
        register = newRegister;
      }

      const { error } = await supabase.from('cash_expenses').insert({
        cash_register_id: register!.id,
        shift_id: employeeShift.id,
        amount,
        category: expenseCategory,
        description: expenseDescription || null,
        payment_source: expensePaymentSource,
        expense_type: 'shift',
        shift: shiftType,
        date: expenseDate,
        responsible_employee_id: expenseResponsible,
        approved: false
      });

      if (error) throw error;

      toast.success('Expense added');
      ActivityLogger.expenseAdd(expenseCategory, amount, expenseDescription);
      setShowExpenseDialog(false);
      loadShiftExpenses();
    } catch (e) {
      console.error(e);
      toast.error('Failed to add expense');
    } finally {
      setAddingExpense(false);
    }
  };

  const deleteExpense = async (id: string, category?: string, amount?: number) => {
    try {
      const { error } = await supabase.from('cash_expenses').delete().eq('id', id);
      if (error) throw error;
      toast.success('Expense deleted');
      if (category && amount) ActivityLogger.expenseDelete(category, amount);
      loadShiftExpenses();
    } catch (e) {
      console.error(e);
      toast.error('Failed to delete');
    }
  };

  const editExpense = (expense: ShiftExpense) => {
    setEditingExpenseId(expense.id);
    setExpenseAmount(expense.amount.toString());
    setExpenseCategory(expense.category);
    setExpenseDescription(expense.description || '');
    setExpensePaymentSource(expense.payment_source as 'cash' | 'gcash');
    setExpenseResponsible(expense.responsible_employee_id || '');
    setShowExpenseDialog(true);
  };

  const updateExpense = async () => {
    if (!editingExpenseId) return;
    const amount = parseInt(expenseAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter valid amount');
      return;
    }
    if (!expenseCategory) {
      toast.error('Select category');
      return;
    }

    setAddingExpense(true);
    try {
      const { error } = await supabase
        .from('cash_expenses')
        .update({
          amount,
          category: expenseCategory,
          description: expenseDescription || null,
          payment_source: expensePaymentSource,
          responsible_employee_id: expenseResponsible || null,
        })
        .eq('id', editingExpenseId);

      if (error) throw error;

      toast.success('Expense updated');
      setShowExpenseDialog(false);
      setEditingExpenseId(null);
      loadShiftExpenses();
    } catch (e) {
      console.error(e);
      toast.error('Failed to update');
    } finally {
      setAddingExpense(false);
    }
  };

  const getEmployeeShift = (employeeId: string) => {
    return activeShifts.find(s => s.employee_id === employeeId);
  };

  const formatDuration = (start: string) => {
    const startTime = new Date(start).getTime();
    const now = Date.now();
    const diff = now - startTime;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins}m`;
  };

  const formatHandoverTime = (time: string) => {
    return new Date(time).toLocaleTimeString('en-PH', { 
      timeZone: 'Asia/Manila',
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const totalShiftExpenses = shiftExpenses.reduce((sum, e) => sum + e.amount, 0);
  const cashExpenses = shiftExpenses.filter(e => e.payment_source === 'cash').reduce((sum, e) => sum + e.amount, 0);
  const gcashExpenses = shiftExpenses.filter(e => e.payment_source === 'gcash').reduce((sum, e) => sum + e.amount, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center",
            effectiveShiftType === 'day' ? 'bg-amber-500/15' : 'bg-indigo-500/15'
          )}>
            {effectiveShiftType === 'day' ? <Sun className="w-5 h-5 text-amber-500" /> : <Moon className="w-5 h-5 text-indigo-500" />}
          </div>
          <div>
            <h1 className="text-lg font-bold">{effectiveShiftType === 'day' ? 'Day Shift' : 'Night Shift'}</h1>
            <span className="text-xs text-muted-foreground">{currentDate}</span>
          </div>
        </div>
        
        {/* Start Shift Button - only show if no one working or shift not in "all ended" state */}
        {!allEnded && (
          <Select onValueChange={confirmStartShift}>
            <SelectTrigger className="w-auto h-8 px-3 text-xs gap-1.5 border-green-500/30 text-green-600 hover:bg-green-500/10">
              <Plus className="w-3.5 h-3.5" />
              <span>Start Shift</span>
            </SelectTrigger>
            <SelectContent>
              {employees.filter(emp => !getEmployeeShift(emp.id)).map(emp => (
                <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="current" className="w-full">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="current" className="gap-1.5 text-xs">
            <Clock className="w-3.5 h-3.5" />
            Current Shift
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="gap-1.5 text-xs">
            <BarChart3 className="w-3.5 h-3.5" />
            Dashboard
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <ShiftDashboard />
        </TabsContent>

        <TabsContent value="current" className="space-y-4 mt-4">
          {/* Working Staff */}
          {activeShifts.length > 0 ? (
            <div className="space-y-2">
          {activeShifts.map(shift => (
            <Card key={shift.id} className={cn(
              shift.status === 'open' 
                ? "border-green-500/20 bg-green-500/5" 
                : "border-amber-500/20 bg-amber-500/5"
            )}>
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold",
                    shift.status === 'open' 
                      ? "bg-green-500/20 text-green-500" 
                      : "bg-amber-500/20 text-amber-500"
                  )}>
                    {shift.employee_name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{shift.employee_name}</span>
                      <Badge className={cn(
                        "border-0 text-[10px] px-1.5 py-0",
                        shift.status === 'open' 
                          ? "bg-green-500/20 text-green-600" 
                          : "bg-amber-500/20 text-amber-600"
                      )}>
                        {shift.status === 'open' ? 'Working' : 'Done'}
                      </Badge>
                    </div>
                    <div className={cn(
                      "text-xs font-mono flex items-center gap-1",
                      shift.status === 'open' ? "text-green-600" : "text-amber-600"
                    )}>
                      <Clock className="w-3 h-3" />
                      {formatDuration(shift.shift_start)}
                    </div>
                  </div>
                </div>
                {shift.status === 'open' && (
                  <Button 
                    size="sm" 
                    variant="ghost"
                    onClick={() => confirmEndWork(shift.employee_id)}
                    className="h-8 px-3 text-xs text-amber-500 hover:text-amber-600 hover:bg-amber-500/10"
                  >
                    <Square className="w-3 h-3 mr-1.5" />
                    End Work
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed border-muted-foreground/30">
          <CardContent className="p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
              <User className="w-6 h-6 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground">No one working yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Use "Start Shift" to add staff</p>
          </CardContent>
        </Card>
      )}

      {/* Close Shift Button - only show when ALL employees have ended */}
      {allEnded && (
        <Button 
          onClick={openCloseShiftDialog}
          className="w-full h-14 text-base bg-red-500 hover:bg-red-600"
        >
          <Lock className="w-5 h-5 mr-2" />
          Close Shift & Submit Cash
        </Button>
      )}

      {/* Expense Button - Only when staff working or ended (not closed) */}
      {activeShifts.length > 0 && (
        <Button 
          onClick={openExpenseDialog}
          variant="outline"
          className="w-full h-12 text-sm border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 text-amber-600"
        >
          <Receipt className="w-4 h-4 mr-2" />
          Add Expense
          {totalShiftExpenses > 0 && (
            <Badge className="ml-2 bg-amber-500/20 text-amber-600 border-0">
              ₱{totalShiftExpenses.toLocaleString()}
            </Badge>
          )}
        </Button>
      )}

      {/* Shift Expenses History */}
      {shiftExpenses.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="py-2.5 px-3">
            <CardTitle className="text-xs text-muted-foreground">Shift Expenses</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0 space-y-1.5">
            {shiftExpenses.map(expense => (
              <div key={expense.id} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg group">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                    expense.payment_source === 'cash' ? "bg-green-500/15 text-green-500" : "bg-blue-500/15 text-blue-500"
                  )}>
                    {expense.payment_source === 'cash' ? '₱' : 'G'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">₱{expense.amount.toLocaleString()}</span>
                      <span className="text-[10px] text-muted-foreground truncate">
                        {EXPENSE_CATEGORIES.find(c => c.value === expense.category)?.label}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground/70 flex items-center gap-1.5">
                      {expense.responsible_name && (
                        <span className="truncate">{expense.responsible_name}</span>
                      )}
                      {expense.description && (
                        <>
                          <span>•</span>
                          <span className="truncate">{expense.description}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => editExpense(expense)}
                  >
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => deleteExpense(expense.id, expense.category, expense.amount)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Previous Handover Info */}
      {currentHandover && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardHeader className="py-2.5 px-3">
            <CardTitle className="text-xs flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              <span className="text-green-600">Cash Submitted</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            <div className="text-xs text-muted-foreground mb-2">
              By {currentHandover.employee_name} at {formatHandoverTime(currentHandover.handover_time)}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-lg font-bold text-green-600">₱{currentHandover.cash_amount.toLocaleString()}</div>
                <div className="text-[10px] text-muted-foreground">Cash</div>
              </div>
              <div>
                <div className="text-lg font-bold text-blue-500">₱{currentHandover.gcash_amount.toLocaleString()}</div>
                <div className="text-[10px] text-muted-foreground">GCash</div>
              </div>
              <div>
                <div className="text-lg font-bold text-amber-500">₱{currentHandover.change_fund_amount.toLocaleString()}</div>
                <div className="text-[10px] text-muted-foreground">Change Fund</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Expense Dialog */}
      <Dialog open={showExpenseDialog} onOpenChange={(open) => {
        setShowExpenseDialog(open);
        if (!open) setEditingExpenseId(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5" />
              {editingExpenseId ? 'Edit Expense' : 'Add Expense'}
            </DialogTitle>
            <DialogDescription>
              {editingExpenseId ? 'Update expense details' : "Expense will be tied to employee's shift"}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Amount ₱</label>
              <Input
                type="number"
                value={expenseAmount}
                onChange={e => setExpenseAmount(e.target.value)}
                placeholder="0"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Category</label>
              <Select value={expenseCategory} onValueChange={setExpenseCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Responsible Person</label>
              <Select value={expenseResponsible} onValueChange={setExpenseResponsible}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {activeShifts.map(shift => (
                    <SelectItem key={shift.employee_id} value={shift.employee_id}>
                      <span className="flex items-center gap-2">
                        <span className={cn(
                          "w-2 h-2 rounded-full",
                          shift.status === 'open' ? "bg-green-500" : "bg-amber-500"
                        )}></span>
                        {shift.employee_name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Payment Source</label>
              <Select value={expensePaymentSource} onValueChange={(v) => setExpensePaymentSource(v as 'cash' | 'gcash')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="gcash">GCash</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Description (optional)</label>
              <Input
                value={expenseDescription}
                onChange={e => setExpenseDescription(e.target.value)}
                placeholder="What was it for?"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => {
                setShowExpenseDialog(false);
                setEditingExpenseId(null);
              }}>Cancel</Button>
              <Button 
                onClick={editingExpenseId ? updateExpense : addExpense} 
                disabled={addingExpense}
              >
                {addingExpense ? (editingExpenseId ? 'Saving...' : 'Adding...') : (editingExpenseId ? 'Save' : 'Add')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
        </TabsContent>
      </Tabs>

      {/* End Work Confirmation Dialog */}
      <AlertDialog open={showEndWorkDialog} onOpenChange={(open) => {
        if (!open) {
          setShowEndWorkDialog(false);
          setPendingEndWorkEmployee(null);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Square className="w-5 h-5 text-amber-500" />
              End Work?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingEndWorkEmployee && (
                <>
                  <span className="font-medium text-foreground">
                    {activeShifts.find(s => s.employee_id === pendingEndWorkEmployee)?.employee_name}
                  </span>
                  {' '}will be marked as done. When all employees finish, use "Close Shift" to submit cash and send reports.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleEndWork} disabled={endingWork} className="bg-amber-500 hover:bg-amber-600">
              {endingWork ? 'Ending...' : 'End Work'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Close Shift Dialog */}
      <Dialog open={showCloseShiftDialog} onOpenChange={setShowCloseShiftDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-red-500" />
              Close Shift
            </DialogTitle>
            <DialogDescription>
              Submit cash handover and close the {effectiveShiftType} shift. Reports will be sent to Telegram.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 pt-2">
            {/* Staff summary */}
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="text-xs text-muted-foreground mb-2">Staff closing:</div>
              <div className="flex flex-wrap gap-2">
                {activeShifts.map(shift => (
                  <Badge key={shift.id} className="bg-amber-500/20 text-amber-600 border-0">
                    {shift.employee_name}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Who is submitting cash?</label>
              <Select value={cashEmployee} onValueChange={setCashEmployee}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {activeShifts.map(shift => (
                    <SelectItem key={shift.employee_id} value={shift.employee_id}>
                      {shift.employee_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              {/* Total Cash and Change Fund */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">💵 Total Cash in Register ₱</label>
                  <Input 
                    type="number" 
                    value={totalCashAmount} 
                    onChange={e => setTotalCashAmount(e.target.value)} 
                    placeholder="Count all cash" 
                    className="h-9 text-sm font-mono" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-amber-500">− Change Fund to Leave ₱</label>
                  <Input 
                    type="number" 
                    value={changeFundAmount} 
                    onChange={e => setChangeFundAmount(e.target.value)} 
                    placeholder="2000" 
                    className="h-9 text-sm font-mono border-amber-500/30" 
                  />
                </div>
              </div>
              
              {/* Calculated Cash Handed Over */}
              {totalCashAmount && (
                <div className="p-2 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">= Cash Handed Over:</span>
                    <span className="font-bold text-green-600">
                      ₱{((parseInt(totalCashAmount) || 0) - (parseInt(changeFundAmount) || 0)).toLocaleString()}
                    </span>
                  </div>
                </div>
              )}
              
              {/* GCash */}
              <div className="space-y-1">
                <label className="text-[10px] text-blue-500">📱 GCash ₱</label>
                <Input 
                  type="number" 
                  value={gcashAmount} 
                  onChange={e => setGcashAmount(e.target.value)} 
                  placeholder="0" 
                  className="h-9 text-sm font-mono" 
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Comment (optional)</label>
              <Textarea 
                value={handoverComment} 
                onChange={e => setHandoverComment(e.target.value)} 
                placeholder="Any notes about the handover..."
                className="text-sm min-h-[60px] resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowCloseShiftDialog(false)}>Cancel</Button>
              <Button 
                onClick={handleCloseShift} 
                disabled={closingShift || !cashEmployee || !changeFundAmount}
                className="bg-red-500 hover:bg-red-600"
              >
                <Send className="w-4 h-4 mr-2" />
                {closingShift ? 'Closing...' : 'Close Shift'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Start Shift Confirmation Dialog */}
      <Dialog open={showStartShiftDialog} onOpenChange={(open) => {
        if (!open) {
          setShowStartShiftDialog(false);
          setPendingStartEmployee(null);
          setCashVerified(false);
        }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="w-5 h-5 text-green-500" />
              Start Shift
            </DialogTitle>
            <DialogDescription>
              {pendingStartEmployee && (
                <span className="font-medium text-foreground">
                  {employees.find(e => e.id === pendingStartEmployee)?.name}
                </span>
              )} — verify cash before starting
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 pt-2">
            {previousHandover ? (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-3">
                <div className="text-xs text-amber-600 font-medium">
                  Previous Handover ({previousHandover.shift_type === 'day' ? 'Day' : 'Night'} shift, {previousHandover.shift_date})
                </div>
                <div className="text-sm text-muted-foreground">
                  By: <span className="font-medium text-foreground">{previousHandover.employee_name}</span>
                  <span className="text-xs ml-2">at {formatHandoverTime(previousHandover.handover_time)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-lg font-bold text-green-600">₱{previousHandover.cash_amount.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground">Cash</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-blue-500">₱{previousHandover.gcash_amount.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground">GCash</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-amber-500">₱{previousHandover.change_fund_amount.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground">Change Fund</div>
                  </div>
                </div>
                {previousHandover.comment && (
                  <div className="text-xs text-muted-foreground border-t border-amber-500/20 pt-2">
                    Note: {previousHandover.comment}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
                <div className="flex items-center gap-2 text-orange-600">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm font-medium">No previous handover found</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Cash was not submitted for the previous shift. Verify manually before starting.
                </p>
              </div>
            )}

            {/* Change Fund Received Input */}
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/30 space-y-2">
              <label className="text-xs font-semibold text-primary flex items-center gap-2">
                💰 Change Fund Received (Размен получен)
              </label>
              <Input
                type="number"
                value={changeFundReceived}
                onChange={e => setChangeFundReceived(e.target.value)}
                placeholder="Enter amount received"
                className="text-lg font-bold h-12"
              />
              <p className="text-xs text-muted-foreground">
                Enter the actual change fund you received from the previous shift
              </p>
            </div>

            <div className="flex items-start space-x-3 p-3 bg-muted/50 rounded-lg">
              <Checkbox 
                id="verify-cash" 
                checked={cashVerified}
                onCheckedChange={(checked) => setCashVerified(checked === true)}
                className="mt-0.5"
              />
              <label htmlFor="verify-cash" className="text-sm leading-tight cursor-pointer">
                I have verified the cash amounts are correct
              </label>
            </div>

            <div className="flex flex-col gap-2">
              <Button 
                onClick={handleStartShift} 
                disabled={startingShift || !cashVerified || !changeFundReceived}
                className="w-full bg-green-500 hover:bg-green-600"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                {startingShift ? 'Starting...' : 'Start Shift'}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowStartShiftDialog(false);
                  setPendingStartEmployee(null);
                  setCashVerified(false);
                  setChangeFundReceived('');
                }}
                className="w-full text-muted-foreground"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
