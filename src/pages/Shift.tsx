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
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Clock, Play, Banknote, User, Sun, Moon, Plus, Receipt, Trash2, Square, AlertTriangle, CheckCircle2, Send } from 'lucide-react';

type ShiftType = 'day' | 'night';

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
  status: string;
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

// Get previous shift type and date for handover lookup
const getPreviousShiftInfo = (): { shiftType: ShiftType; shiftDate: string } => {
  const currentType = getCurrentShiftType();
  const manilaTime = getManilaTime();
  const hour = manilaTime.getHours();
  
  if (currentType === 'day') {
    // Current is day -> show last night handover (from yesterday or earlier)
    const prevDate = new Date(manilaTime);
    prevDate.setDate(prevDate.getDate() - 1);
    return { shiftType: 'night', shiftDate: format(prevDate, 'yyyy-MM-dd') };
  } else {
    // Current is night -> show today's day handover
    let shiftDate: Date;
    if (hour < 5) {
      // After midnight, day shift was from previous calendar day
      shiftDate = new Date(manilaTime);
      shiftDate.setDate(shiftDate.getDate() - 1);
    } else {
      // After 17:00, day shift was from today
      shiftDate = new Date(manilaTime);
    }
    return { shiftType: 'day', shiftDate: format(shiftDate, 'yyyy-MM-dd') };
  }
};

export default function Shift() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [activeShifts, setActiveShifts] = useState<ActiveShift[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Current handover for this shift type/date
  const [currentHandover, setCurrentHandover] = useState<CashHandover | null>(null);
  
  // Cash submission section
  const [cashEmployee, setCashEmployee] = useState<string>('');
  const [cashAmount, setCashAmount] = useState('');
  const [gcashAmount, setGcashAmount] = useState('');
  const [changeFundAmount, setChangeFundAmount] = useState('2000');
  const [handoverComment, setHandoverComment] = useState('');
  const [submittingCash, setSubmittingCash] = useState(false);

  // Expense tracking
  const [shiftExpenses, setShiftExpenses] = useState<ShiftExpense[]>([]);
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expensePaymentSource, setExpensePaymentSource] = useState<'cash' | 'gcash'>('cash');
  const [expenseResponsible, setExpenseResponsible] = useState('');
  const [addingExpense, setAddingExpense] = useState(false);

  // End shift dialog
  const [showEndShiftDialog, setShowEndShiftDialog] = useState(false);
  const [pendingEndShiftEmployee, setPendingEndShiftEmployee] = useState<string | null>(null);
  const [endingShift, setEndingShift] = useState(false);

  // Start shift confirmation dialog
  const [showStartShiftDialog, setShowStartShiftDialog] = useState(false);
  const [pendingStartEmployee, setPendingStartEmployee] = useState<string | null>(null);
  const [previousHandover, setPreviousHandover] = useState<CashHandover | null>(null);
  const [startingShift, setStartingShift] = useState(false);
  const [cashVerified, setCashVerified] = useState(false);

  const currentShiftType = getCurrentShiftType();
  const currentDate = getShiftDate();

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
          .eq('status', 'open')
          .order('shift_start', { ascending: false })
      ]);

      setEmployees(empData || []);
      
      const mappedShifts = (shiftsData || []).map((s: any) => ({
        id: s.id,
        employee_id: s.employee_id,
        employee_name: s.employees?.name || 'Unknown',
        shift_start: s.shift_start,
        type: s.type || 'day',
        status: s.status
      }));
      
      setActiveShifts(mappedShifts);

      // Load expenses with the fresh shifts data
      await loadShiftExpensesWithShifts(mappedShifts);
      await loadCurrentHandover();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadCurrentHandover = async () => {
    try {
      const { data } = await supabase
        .from('cash_handovers')
        .select('*, employees:handed_by_employee_id(name)')
        .eq('shift_type', currentShiftType)
        .eq('shift_date', currentDate)
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

  const loadShiftExpensesWithShifts = async (shifts: ActiveShift[]) => {
    try {
      let expenses: any[] = [];
      
      if (shifts.length > 0) {
        // Load expenses linked to active shifts
        const shiftIds = shifts.map(s => s.id);
        const { data, error } = await supabase
          .from('cash_expenses')
          .select('*')
          .in('shift_id', shiftIds)
          .eq('expense_type', 'shift')
          .order('created_at', { ascending: false });
        
        if (error) {
          console.error('Error loading expenses:', error);
        } else {
          expenses = data || [];
        }
      } else {
        // No active shifts - load expenses by date/shift that have shift_id (linked to closed shifts)
        const { data, error } = await supabase
          .from('cash_expenses')
          .select('*')
          .eq('date', currentDate)
          .eq('shift', currentShiftType)
          .eq('expense_type', 'shift')
          .not('shift_id', 'is', null)
          .order('created_at', { ascending: false });
        
        if (error) {
          console.error('Error loading expenses:', error);
        } else {
          expenses = data || [];
        }
      }

      // Load employee names separately
      const expensesWithNames = await Promise.all(expenses.map(async (e: any) => {
        let responsibleName = null;
        if (e.responsible_employee_id) {
          const { data: emp } = await supabase
            .from('employees')
            .select('name')
            .eq('id', e.responsible_employee_id)
            .maybeSingle();
          responsibleName = emp?.name;
        }
        return { ...e, responsible_name: responsibleName };
      }));

      setShiftExpenses(expensesWithNames);
    } catch (e) {
      console.error(e);
      setShiftExpenses([]);
    }
  };

  const loadShiftExpenses = () => loadShiftExpensesWithShifts(activeShifts);

  const confirmStartShift = async (employeeId: string) => {
    // Check if employee already has an open shift
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
      } else {
        setPreviousHandover(null);
      }
    } catch (e) {
      console.error(e);
      setPreviousHandover(null);
    }
    
    setShowStartShiftDialog(true);
  };

  const handleStartShift = async () => {
    if (!pendingStartEmployee) return;
    if (!cashVerified) {
      toast.error('Please verify cash amounts first');
      return;
    }
    
    const employeeName = employees.find(e => e.id === pendingStartEmployee)?.name || 'Unknown';
    
    setStartingShift(true);
    try {
      const { error } = await supabase.from('shifts').insert({
        employee_id: pendingStartEmployee,
        date: currentDate,
        shift_start: new Date().toISOString(),
        type: currentShiftType,
        status: 'open'
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

  const confirmEndShift = (employeeId: string) => {
    // Check if this is the last active shift and cash not submitted
    const isLastShift = activeShifts.length === 1;
    if (isLastShift && !currentHandover) {
      toast.error('Submit cash handover before ending the last shift');
      return;
    }
    
    setPendingEndShiftEmployee(employeeId);
    setShowEndShiftDialog(true);
  };

  const handleEndShift = async () => {
    if (!pendingEndShiftEmployee) return;
    
    const activeShift = activeShifts.find(s => s.employee_id === pendingEndShiftEmployee);
    const employeeName = employees.find(e => e.id === pendingEndShiftEmployee)?.name || 'Unknown';
    
    if (!activeShift) return;

    setEndingShift(true);
    try {
      const totalHours = calculateTotalHours(activeShift.shift_start);
      
      const { error } = await supabase
        .from('shifts')
        .update({
          shift_end: new Date().toISOString(),
          total_hours: totalHours,
          status: 'closed'
        })
        .eq('id', activeShift.id);

      if (error) throw error;

      // Send Telegram notification
      try {
        await supabase.functions.invoke('telegram-notify', {
          body: {
            action: 'shift_end',
            employeeName,
            totalHours: totalHours.toFixed(1),
            baseSalary: 500
          }
        });
      } catch (e) {
        console.log('Telegram notification failed:', e);
      }

      toast.success('Shift ended');
      loadData();
    } catch (e) {
      console.error(e);
      toast.error('Failed to end shift');
    } finally {
      setEndingShift(false);
      setShowEndShiftDialog(false);
      setPendingEndShiftEmployee(null);
    }
  };

  const submitCashHandover = async () => {
    if (!cashEmployee) {
      toast.error('Select employee');
      return;
    }

    // Check if employee has active shift
    const employeeShift = activeShifts.find(s => s.employee_id === cashEmployee);
    if (!employeeShift) {
      toast.error('Employee must have an open shift to submit cash');
      return;
    }

    // Check if handover already exists for current shift
    if (currentHandover) {
      toast.error(`Cash already submitted by ${currentHandover.employee_name}`);
      return;
    }

    const cash = parseInt(cashAmount) || 0;
    const gcash = parseInt(gcashAmount) || 0;
    const changeFund = parseInt(changeFundAmount) || 0;

    if (cash === 0 && gcash === 0) {
      toast.error('Enter cash or GCash amount');
      return;
    }

    if (changeFund <= 0) {
      toast.error('Change fund is required');
      return;
    }

    setSubmittingCash(true);
    try {
      const employeeName = employees.find(e => e.id === cashEmployee)?.name || 'Unknown';
      
      // Insert into cash_handovers table
      const { error } = await supabase.from('cash_handovers').insert({
        shift_type: currentShiftType,
        shift_date: currentDate,
        cash_amount: cash,
        gcash_amount: gcash,
        change_fund_amount: changeFund,
        handed_by_employee_id: cashEmployee,
        handover_time: new Date().toISOString(),
        comment: handoverComment || null,
        approved: false
      });

      if (error) throw error;

      // Send Telegram notification
      try {
        await supabase.functions.invoke('telegram-notify', {
          body: {
            action: 'cash_handover',
            employeeName,
            cash,
            gcash,
            changeFund,
            shiftType: currentShiftType === 'day' ? 'Day' : 'Night'
          }
        });
      } catch (e) {
        console.log('Telegram notification failed:', e);
      }

      toast.success('Cash handover submitted');
      setCashEmployee('');
      setCashAmount('');
      setGcashAmount('');
      setChangeFundAmount('2000');
      setHandoverComment('');
      loadCurrentHandover();
    } catch (e: any) {
      console.error(e);
      if (e.code === '23505') {
        toast.error('Cash already submitted for this shift');
      } else {
        toast.error('Failed to submit');
      }
    } finally {
      setSubmittingCash(false);
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

    // Get the responsible employee's active shift
    const employeeShift = activeShifts.find(s => s.employee_id === expenseResponsible);
    if (!employeeShift) {
      toast.error('Employee has no active shift');
      return;
    }

    setAddingExpense(true);
    try {
      // Use shift date from when employee started their shift
      const shiftStartDate = format(new Date(employeeShift.shift_start), 'yyyy-MM-dd');
      const shiftType = employeeShift.type;

      // Get or create cash register for that shift date/type
      let { data: register } = await supabase
        .from('cash_register')
        .select('id')
        .eq('date', shiftStartDate)
        .eq('shift', shiftType)
        .maybeSingle();

      if (!register) {
        const { data: newRegister, error: createError } = await supabase
          .from('cash_register')
          .insert({ date: shiftStartDate, shift: shiftType })
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
        date: shiftStartDate,
        responsible_employee_id: expenseResponsible,
        approved: false
      });

      if (error) throw error;

      toast.success('Expense added');
      setShowExpenseDialog(false);
      loadShiftExpenses();
    } catch (e) {
      console.error(e);
      toast.error('Failed to add expense');
    } finally {
      setAddingExpense(false);
    }
  };

  const deleteExpense = async (id: string) => {
    try {
      const { error } = await supabase.from('cash_expenses').delete().eq('id', id);
      if (error) throw error;
      toast.success('Expense deleted');
      loadShiftExpenses();
    } catch (e) {
      console.error(e);
      toast.error('Failed to delete');
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
            currentShiftType === 'day' ? 'bg-amber-500/15' : 'bg-indigo-500/15'
          )}>
            {currentShiftType === 'day' ? <Sun className="w-5 h-5 text-amber-500" /> : <Moon className="w-5 h-5 text-indigo-500" />}
          </div>
          <div>
            <h1 className="text-lg font-bold">{currentShiftType === 'day' ? 'Day Shift' : 'Night Shift'}</h1>
            <span className="text-xs text-muted-foreground">{currentDate}</span>
          </div>
        </div>
        
        {/* Start Shift Button */}
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
      </div>

      {/* Working Staff */}
      {activeShifts.length > 0 ? (
        <div className="space-y-2">
          {activeShifts.map(shift => (
            <Card key={shift.id} className="border-green-500/20 bg-green-500/5">
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-green-500/20 flex items-center justify-center text-sm font-bold text-green-500">
                    {shift.employee_name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{shift.employee_name}</span>
                      <Badge className="bg-green-500/20 text-green-600 border-0 text-[10px] px-1.5 py-0">
                        Open
                      </Badge>
                    </div>
                    <div className="text-xs text-green-600 font-mono flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDuration(shift.shift_start)}
                    </div>
                  </div>
                </div>
                {activeShifts.length === 1 && !currentHandover ? (
                  <div className="flex items-center gap-1.5 text-xs text-amber-500">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Submit cash first</span>
                  </div>
                ) : (
                  <Button 
                    size="sm" 
                    variant="ghost"
                    onClick={() => confirmEndShift(shift.employee_id)}
                    className="h-8 px-3 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10"
                  >
                    <Square className="w-3 h-3 mr-1.5" />
                    End
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

      {/* Expense Button - Only when staff working */}
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
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Cash Handover */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader className="py-2.5 px-3">
          <CardTitle className="text-xs flex items-center gap-2">
            <Banknote className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-amber-600">Cash Handover</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0 space-y-3">
          {/* Already submitted indicator */}
          {currentHandover ? (
            <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-sm font-medium text-green-600">
                  Cash submitted by {currentHandover.employee_name}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mb-2">
                at {formatHandoverTime(currentHandover.handover_time)}
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
              {currentHandover.comment && (
                <div className="mt-2 text-xs text-muted-foreground border-t border-border/50 pt-2">
                  Note: {currentHandover.comment}
                </div>
              )}
            </div>
          ) : activeShifts.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-4">
              <AlertTriangle className="w-5 h-5 mx-auto mb-2 text-amber-500" />
              No active shifts. Only working staff can submit cash.
            </div>
          ) : (
            <div className="space-y-3">
              <Select value={cashEmployee} onValueChange={setCashEmployee}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Who is submitting? (working only)" />
                </SelectTrigger>
                <SelectContent>
                  {activeShifts.map(shift => (
                    <SelectItem key={shift.employee_id} value={shift.employee_id}>
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        {shift.employee_name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">Cash ₱</label>
                  <Input type="number" value={cashAmount} onChange={e => setCashAmount(e.target.value)} placeholder="0" className="h-9 text-sm font-mono" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-blue-500">GCash ₱</label>
                  <Input type="number" value={gcashAmount} onChange={e => setGcashAmount(e.target.value)} placeholder="0" className="h-9 text-sm font-mono" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-amber-500">Change Fund *</label>
                  <Input type="number" value={changeFundAmount} onChange={e => setChangeFundAmount(e.target.value)} placeholder="2000" className="h-9 text-sm font-mono border-amber-500/30" />
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

              <Button 
                onClick={submitCashHandover} 
                disabled={submittingCash || !cashEmployee || !changeFundAmount} 
                className="w-full h-9 text-sm bg-amber-500 hover:bg-amber-600" 
                size="sm"
              >
                <Send className="w-3.5 h-3.5 mr-1.5" />
                {submittingCash ? 'Submitting...' : 'Submit Cash Handover'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Expense Dialog */}
      <Dialog open={showExpenseDialog} onOpenChange={setShowExpenseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5" />
              Add Expense
            </DialogTitle>
            <DialogDescription>
              Expense will be tied to employee's open shift
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
              <label className="text-sm text-muted-foreground">Responsible Person (Working)</label>
              <Select value={expenseResponsible} onValueChange={setExpenseResponsible}>
                <SelectTrigger>
                  <SelectValue placeholder="Select working employee" />
                </SelectTrigger>
                <SelectContent>
                  {activeShifts.map(shift => (
                    <SelectItem key={shift.employee_id} value={shift.employee_id}>
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
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
              <Button variant="outline" onClick={() => setShowExpenseDialog(false)}>Cancel</Button>
              <Button onClick={addExpense} disabled={addingExpense}>
                {addingExpense ? 'Adding...' : 'Add'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* End Shift Confirmation Dialog */}
      <AlertDialog open={showEndShiftDialog} onOpenChange={(open) => {
        if (!open) {
          setShowEndShiftDialog(false);
          setPendingEndShiftEmployee(null);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Square className="w-5 h-5 text-red-500" />
              End Shift?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingEndShiftEmployee && (
                <>
                  <span className="font-medium text-foreground">
                    {activeShifts.find(s => s.employee_id === pendingEndShiftEmployee)?.employee_name}
                  </span>
                  {' '}— shift will be closed. Use "Cash Handover" section to submit cash (anyone working can do it once per shift).
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleEndShift} disabled={endingShift}>
              {endingShift ? 'Ending...' : 'End Shift'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                disabled={startingShift || !cashVerified}
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
