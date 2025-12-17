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
  shift_type: string;
  status: string;
}

interface ShiftExpense {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  created_at: string;
  payment_source: string;
  date: string | null;
  responsible_employee_id: string | null;
  responsible_name?: string;
}

const EXPENSE_CATEGORIES = [
  { value: 'employee_food', label: 'Employee Food' },
  { value: 'food_hunters', label: 'Food Hunters' },
  { value: 'purchases', label: 'Purchases' },
  { value: 'other', label: 'Other' }
];

const getCurrentShift = (): ShiftType => {
  const now = new Date();
  const manilaOffset = 8 * 60;
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const manilaTime = new Date(utcTime + (manilaOffset * 60000));
  const hour = manilaTime.getHours();
  return hour >= 5 && hour < 17 ? 'day' : 'night';
};

const getShiftDate = (): string => {
  const now = new Date();
  const manilaOffset = 8 * 60;
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const manilaTime = new Date(utcTime + (manilaOffset * 60000));
  const hour = manilaTime.getHours();
  
  // Night shift maps to the day it STARTED
  // So at 2 AM Dec 18, we're still in the Dec 17 night shift
  if (hour < 5) {
    manilaTime.setDate(manilaTime.getDate() - 1);
  }
  return format(manilaTime, 'yyyy-MM-dd');
};

interface CashSubmission {
  employeeName: string;
  cash: number;
  gcash: number;
}

export default function Shift() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [activeShifts, setActiveShifts] = useState<ActiveShift[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Cash submission section
  const [cashSubmissions, setCashSubmissions] = useState<CashSubmission[]>([]);
  const [cashEmployee, setCashEmployee] = useState<string>('');
  const [cashAmount, setCashAmount] = useState('');
  const [gcashAmount, setGcashAmount] = useState('');
  const [changeFundAmount, setChangeFundAmount] = useState('');
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

  // Confirmation dialog
  const [showEndShiftConfirm, setShowEndShiftConfirm] = useState(false);
  const [pendingEndShiftEmployee, setPendingEndShiftEmployee] = useState<string | null>(null);

  const currentShift = getCurrentShift();
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadData = async () => {
    try {
      const [{ data: empData }, { data: shiftsData }, { data: closedShifts }] = await Promise.all([
        supabase.from('employees').select('id, name').eq('active', true).order('name'),
        supabase
          .from('shifts')
          .select('id, employee_id, shift_start, shift_type, status, employees!inner(name)')
          .eq('status', 'open')
          .order('shift_start', { ascending: false }),
        supabase
          .from('shifts')
          .select('id, employee_id, cash_handed_over, gcash_handed_over, shift_type, employees!inner(name)')
          .eq('date', currentDate)
          .eq('status', 'closed')
          .or('cash_handed_over.gt.0,gcash_handed_over.gt.0')
      ]);

      setEmployees(empData || []);
      setActiveShifts((shiftsData || []).map((s: any) => ({
        id: s.id,
        employee_id: s.employee_id,
        employee_name: s.employees?.name || 'Unknown',
        shift_start: s.shift_start,
        shift_type: s.shift_type,
        status: s.status
      })));

      const currentShiftType = currentShift === 'day' ? 'Day (5AM-5PM)' : 'Night (5PM-5AM)';
      const shiftSubmissions = (closedShifts || [])
        .filter((s: any) => s.shift_type === currentShiftType)
        .map((s: any) => ({
          employeeName: s.employees?.name || 'Unknown',
          cash: s.cash_handed_over || 0,
          gcash: s.gcash_handed_over || 0
        }));
      
      setCashSubmissions(shiftSubmissions);
      
      await loadShiftExpenses();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadShiftExpenses = async () => {
    try {
      const { data: register } = await supabase
        .from('cash_register')
        .select('id')
        .eq('date', currentDate)
        .eq('shift', currentShift)
        .maybeSingle();

      if (register) {
        const { data: expenses } = await supabase
          .from('cash_expenses')
          .select('*, employees:responsible_employee_id(name)')
          .eq('cash_register_id', register.id)
          .eq('expense_type', 'shift')
          .eq('shift', currentShift)
          .eq('date', currentDate)
          .order('created_at', { ascending: false });

        setShiftExpenses((expenses || []).map((e: any) => ({
          ...e,
          responsible_name: e.employees?.name
        })));
      } else {
        setShiftExpenses([]);
      }
    } catch (e) {
      console.error(e);
      setShiftExpenses([]);
    }
  };

  const startShift = async (employeeId: string) => {
    const shiftType = currentShift === 'day' ? 'Day (5AM-5PM)' : 'Night (5PM-5AM)';
    const employeeName = employees.find(e => e.id === employeeId)?.name || 'Unknown';
    
    try {
      const { error } = await supabase.from('shifts').insert({
        employee_id: employeeId,
        date: currentDate,
        shift_start: new Date().toISOString(),
        shift_type: shiftType,
        status: 'open'
      });

      if (error) throw error;

      try {
        await supabase.functions.invoke('telegram-notify', {
          body: {
            action: 'shift_start',
            employeeName,
            time: new Date().toLocaleTimeString('en-PH', { 
              timeZone: 'Asia/Manila',
              hour: '2-digit', 
              minute: '2-digit' 
            })
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
    }
  };

  const confirmEndShift = (employeeId: string) => {
    setPendingEndShiftEmployee(employeeId);
    setShowEndShiftConfirm(true);
  };

  const handleConfirmEndShift = async () => {
    if (!pendingEndShiftEmployee) return;
    
    const activeShift = activeShifts.find(s => s.employee_id === pendingEndShiftEmployee);
    const employeeName = employees.find(e => e.id === pendingEndShiftEmployee)?.name || 'Unknown';
    
    if (activeShift) {
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

        try {
          await supabase.functions.invoke('telegram-notify', {
            body: {
              action: 'shift_end',
              employeeName,
              totalHours: totalHours.toFixed(1),
              cashHandedOver: 0,
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
      }
    }
    
    setShowEndShiftConfirm(false);
    setPendingEndShiftEmployee(null);
  };

  const submitCashHandover = async () => {
    if (!cashEmployee) {
      toast.error('Select employee');
      return;
    }

    const cash = parseInt(cashAmount) || 0;
    const gcash = parseInt(gcashAmount) || 0;
    const changeFund = parseInt(changeFundAmount) || 0;

    if (cash === 0 && gcash === 0) {
      toast.error('Enter cash or GCash amount');
      return;
    }

    setSubmittingCash(true);
    try {
      const employeeName = employees.find(e => e.id === cashEmployee)?.name || 'Unknown';
      const shiftType = currentShift === 'day' ? 'Day (5AM-5PM)' : 'Night (5PM-5AM)';
      
      // Check if employee has an active shift
      const activeShift = activeShifts.find(s => s.employee_id === cashEmployee);
      
      if (activeShift) {
        const totalHours = calculateTotalHours(activeShift.shift_start);
        
        const { error } = await supabase
          .from('shifts')
          .update({
            cash_handed_over: cash,
            gcash_handed_over: gcash,
            shift_end: new Date().toISOString(),
            total_hours: totalHours,
            status: 'closed'
          })
          .eq('id', activeShift.id);

        if (error) throw error;
      } else {
        // Create a new closed shift for cash submission only
        const { error } = await supabase.from('shifts').insert({
          employee_id: cashEmployee,
          date: currentDate,
          shift_start: new Date().toISOString(),
          shift_end: new Date().toISOString(),
          shift_type: shiftType,
          cash_handed_over: cash,
          gcash_handed_over: gcash,
          total_hours: 0,
          status: 'closed'
        });

        if (error) throw error;
      }

      // Save change fund if entered
      if (changeFund > 0) {
        let { data: register } = await supabase
          .from('cash_register')
          .select('id')
          .eq('date', currentDate)
          .eq('shift', currentShift)
          .single();

        if (!register) {
          const { data: newRegister, error: createError } = await supabase
            .from('cash_register')
            .insert({ date: currentDate, shift: currentShift })
            .select('id')
            .single();
          
          if (createError) throw createError;
          register = newRegister;
        }

        await supabase
          .from('cash_register')
          .update({ opening_balance: changeFund })
          .eq('id', register!.id);
      }

      // Send Telegram notification
      try {
        await supabase.functions.invoke('telegram-notify', {
          body: {
            action: 'cash_handover',
            employeeName,
            cash,
            gcash,
            changeFund,
            shiftType: currentShift === 'day' ? 'Day' : 'Night'
          }
        });
      } catch (e) {
        console.log('Telegram notification failed:', e);
      }

      toast.success('Cash submitted');
      setCashEmployee('');
      setCashAmount('');
      setGcashAmount('');
      setChangeFundAmount('');
      loadData();
    } catch (e) {
      console.error(e);
      toast.error('Failed to submit');
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

    setAddingExpense(true);
    try {
      let { data: register } = await supabase
        .from('cash_register')
        .select('id')
        .eq('date', currentDate)
        .eq('shift', currentShift)
        .single();

      if (!register) {
        const { data: newRegister, error: createError } = await supabase
          .from('cash_register')
          .insert({ date: currentDate, shift: currentShift })
          .select('id')
          .single();
        
        if (createError) throw createError;
        register = newRegister;
      }

      const { error } = await supabase.from('cash_expenses').insert({
        cash_register_id: register!.id,
        amount,
        category: expenseCategory,
        description: expenseDescription || null,
        payment_source: expensePaymentSource,
        expense_type: 'shift',
        shift: currentShift,
        date: currentDate,
        responsible_employee_id: expenseResponsible
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

  const totalShiftExpenses = shiftExpenses.reduce((sum, e) => sum + e.amount, 0);
  const cashExpenses = shiftExpenses.filter(e => e.payment_source === 'cash').reduce((sum, e) => sum + e.amount, 0);
  const gcashExpenses = shiftExpenses.filter(e => e.payment_source === 'gcash').reduce((sum, e) => sum + e.amount, 0);

  const totalSubmittedCash = cashSubmissions.reduce((sum, s) => sum + s.cash, 0);
  const totalSubmittedGCash = cashSubmissions.reduce((sum, s) => sum + s.gcash, 0);

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
            currentShift === 'day' ? 'bg-amber-500/15' : 'bg-indigo-500/15'
          )}>
            {currentShift === 'day' ? <Sun className="w-5 h-5 text-amber-500" /> : <Moon className="w-5 h-5 text-indigo-500" />}
          </div>
          <div>
            <h1 className="text-lg font-bold">{currentShift === 'day' ? 'Day Shift' : 'Night Shift'}</h1>
            <span className="text-xs text-muted-foreground">{currentDate}</span>
          </div>
        </div>
        
        {/* Add Employee Button */}
        <Select onValueChange={startShift}>
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
                    <div className="font-medium">{shift.employee_name}</div>
                    <div className="text-xs text-green-600 font-mono flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDuration(shift.shift_start)}
                    </div>
                  </div>
                </div>
                <Button 
                  size="sm" 
                  variant="ghost"
                  onClick={() => confirmEndShift(shift.employee_id)}
                  className="h-8 px-3 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10"
                >
                  <Square className="w-3 h-3 mr-1.5" />
                  End
                </Button>
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
                      <span>{expense.date || format(new Date(expense.created_at), 'dd.MM')}</span>
                      {expense.responsible_name && (
                        <>
                          <span>•</span>
                          <span className="truncate">{expense.responsible_name}</span>
                        </>
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
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive/70 hover:text-destructive shrink-0"
                  onClick={() => deleteExpense(expense.id)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Cash Handover - Compact */}
      <Card className="border-border/50">
        <CardHeader className="py-2.5 px-3">
          <CardTitle className="text-xs flex items-center gap-2 text-muted-foreground">
            <Banknote className="w-3.5 h-3.5" />
            Cash Handover
            {(totalSubmittedCash > 0 || totalSubmittedGCash > 0) && (
              <Badge className="ml-auto bg-green-500/20 text-green-500 border-0 text-[10px]">
                ₱{(totalSubmittedCash + totalSubmittedGCash).toLocaleString()}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0 space-y-3">
          {/* Already submitted */}
          {cashSubmissions.length > 0 && (
            <div className="text-xs space-y-1 p-2 bg-green-500/5 rounded-lg border border-green-500/20">
              {cashSubmissions.map((sub, i) => (
                <div key={i} className="flex justify-between">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    {sub.employeeName}
                  </span>
                  <span className="font-medium">
                    {sub.cash > 0 && <span className="text-green-500">₱{sub.cash.toLocaleString()}</span>}
                    {sub.cash > 0 && sub.gcash > 0 && <span className="text-muted-foreground mx-1">+</span>}
                    {sub.gcash > 0 && <span className="text-blue-500">₱{sub.gcash.toLocaleString()}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Submit form */}
          <div className="space-y-2">
            <Select value={cashEmployee} onValueChange={setCashEmployee}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select employee" />
              </SelectTrigger>
              <SelectContent>
                {employees.map(emp => (
                  <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="grid grid-cols-3 gap-2">
              <Input type="number" value={cashAmount} onChange={e => setCashAmount(e.target.value)} placeholder="Cash" className="h-9 text-sm" />
              <Input type="number" value={gcashAmount} onChange={e => setGcashAmount(e.target.value)} placeholder="GCash" className="h-9 text-sm" />
              <Input type="number" value={changeFundAmount} onChange={e => setChangeFundAmount(e.target.value)} placeholder="Change" className="h-9 text-sm" />
            </div>

            <Button onClick={submitCashHandover} disabled={submittingCash || !cashEmployee} className="w-full h-9 text-sm" size="sm">
              <Send className="w-3.5 h-3.5 mr-1.5" />
              {submittingCash ? 'Submitting...' : 'Submit'}
            </Button>
          </div>
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
              Add expense for current shift (deducted from shift cash)
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
      <AlertDialog open={showEndShiftConfirm} onOpenChange={setShowEndShiftConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              End Shift?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to end this shift? A notification will be sent to Telegram.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingEndShiftEmployee(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmEndShift}>
              Yes, End Shift
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
