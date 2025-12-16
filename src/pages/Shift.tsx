import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Clock, Play, Banknote, User, Sun, Moon, Plus, Receipt, Trash2, Square } from 'lucide-react';

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
  if (hour < 5) {
    manilaTime.setDate(manilaTime.getDate() - 1);
  }
  return format(manilaTime, 'yyyy-MM-dd');
};

export default function Shift() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [activeShifts, setActiveShifts] = useState<ActiveShift[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Cash handover dialog
  const [showHandoverDialog, setShowHandoverDialog] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [cashAmount, setCashAmount] = useState('');
  const [gcashAmount, setGcashAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Expense tracking
  const [shiftExpenses, setShiftExpenses] = useState<ShiftExpense[]>([]);
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expensePaymentSource, setExpensePaymentSource] = useState<'cash' | 'gcash'>('cash');
  const [addingExpense, setAddingExpense] = useState(false);

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
      const [{ data: empData }, { data: shiftsData }] = await Promise.all([
        supabase.from('employees').select('id, name').eq('active', true).order('name'),
        supabase
          .from('shifts')
          .select('id, employee_id, shift_start, shift_type, status, employees!inner(name)')
          .eq('status', 'open')
          .order('shift_start', { ascending: false })
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
      
      await loadShiftExpenses();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadShiftExpenses = async () => {
    try {
      // Get cash register for current shift
      const { data: register } = await supabase
        .from('cash_register')
        .select('id')
        .eq('date', currentDate)
        .eq('shift', currentShift)
        .single();

      if (register) {
        const { data: expenses } = await supabase
          .from('cash_expenses')
          .select('*')
          .eq('cash_register_id', register.id)
          .eq('expense_type', 'shift')
          .order('created_at', { ascending: false });

        setShiftExpenses(expenses || []);
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
    
    try {
      const { error } = await supabase.from('shifts').insert({
        employee_id: employeeId,
        date: currentDate,
        shift_start: new Date().toISOString(),
        shift_type: shiftType,
        status: 'open'
      });

      if (error) throw error;
      toast.success('Shift started');
      loadData();
    } catch (e) {
      console.error(e);
      toast.error('Failed to start shift');
    }
  };

  const openHandoverDialog = (employeeId?: string) => {
    setSelectedEmployee(employeeId || '');
    setCashAmount('');
    setGcashAmount('');
    setShowHandoverDialog(true);
  };

  const submitCashHandover = async () => {
    if (!selectedEmployee) {
      toast.error('Select employee');
      return;
    }

    const cash = parseInt(cashAmount) || 0;
    const gcash = parseInt(gcashAmount) || 0;

    if (cash === 0 && gcash === 0) {
      toast.error('Enter amount');
      return;
    }

    setSubmitting(true);
    try {
      const activeShift = activeShifts.find(s => s.employee_id === selectedEmployee);

      if (activeShift) {
        const { error } = await supabase
          .from('shifts')
          .update({
            cash_handed_over: cash,
            gcash_handed_over: gcash,
            shift_end: new Date().toISOString(),
            status: 'closed'
          })
          .eq('id', activeShift.id);

        if (error) throw error;
      } else {
        const shiftType = currentShift === 'day' ? 'Day (5AM-5PM)' : 'Night (5PM-5AM)';
        
        const { error } = await supabase.from('shifts').insert({
          employee_id: selectedEmployee,
          date: currentDate,
          shift_start: new Date().toISOString(),
          shift_end: new Date().toISOString(),
          shift_type: shiftType,
          cash_handed_over: cash,
          gcash_handed_over: gcash,
          status: 'closed'
        });

        if (error) throw error;
      }

      try {
        const employeeName = employees.find(e => e.id === selectedEmployee)?.name || 'Unknown';
        await supabase.functions.invoke('telegram-notify', {
          body: {
            message: `💰 Cash Handover\n\nEmployee: ${employeeName}\nCash: ₱${cash.toLocaleString()}\nGCash: ₱${gcash.toLocaleString()}\nTotal: ₱${(cash + gcash).toLocaleString()}\n\nPending admin verification in Cash page.`
          }
        });
      } catch (e) {
        console.log('Telegram notification failed:', e);
      }

      toast.success('Cash submitted for verification');
      setShowHandoverDialog(false);
      loadData();
    } catch (e) {
      console.error(e);
      toast.error('Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  const openExpenseDialog = () => {
    setExpenseAmount('');
    setExpenseCategory('');
    setExpenseDescription('');
    setExpensePaymentSource('cash');
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

    setAddingExpense(true);
    try {
      // Get or create cash register for current shift
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
        date: currentDate
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5 max-w-2xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            Shift
          </h1>
          <div className="flex items-center gap-2 mt-1.5">
            <Badge className={currentShift === 'day' ? 'bg-amber-500/20 text-amber-500 border-amber-500/30' : 'bg-indigo-500/20 text-indigo-500 border-indigo-500/30'}>
              {currentShift === 'day' ? <Sun className="w-3 h-3 mr-1" /> : <Moon className="w-3 h-3 mr-1" />}
              {currentShift === 'day' ? 'Day Shift' : 'Night Shift'}
            </Badge>
            <span className="text-xs text-muted-foreground">{currentDate}</span>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={openExpenseDialog} className="gap-1.5 h-9 border-border/50 hover:bg-secondary">
            <Plus className="w-4 h-4" />
            Expense
          </Button>
          <Button size="sm" onClick={() => openHandoverDialog()} className="gap-1.5 h-9 shadow-lg shadow-primary/20">
            <Banknote className="w-4 h-4" />
            Cash
          </Button>
        </div>
      </div>

      {/* Active Shifts */}
      {activeShifts.length > 0 && (
        <Card className="border-green-500/30 bg-gradient-to-br from-green-500/5 to-transparent overflow-hidden">
          <CardHeader className="py-3 border-b border-green-500/10">
            <CardTitle className="text-sm flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                <Play className="w-3 h-3 text-green-500" />
              </div>
              Active Shifts
              <Badge variant="secondary" className="ml-auto bg-green-500/20 text-green-500 text-xs">
                {activeShifts.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="py-3 space-y-2">
            {activeShifts.map(shift => (
              <div key={shift.id} className="flex items-center justify-between p-3 bg-green-500/10 rounded-xl border border-green-500/20 transition-all hover:border-green-500/40">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                    <User className="w-4 h-4 text-green-500" />
                  </div>
                  <div>
                    <span className="font-medium">{shift.employee_name}</span>
                    <div className="text-xs text-muted-foreground font-mono">
                      {formatDuration(shift.shift_start)}
                    </div>
                  </div>
                </div>
                <Button 
                  size="sm" 
                  variant="destructive"
                  onClick={() => openHandoverDialog(shift.employee_id)}
                  className="gap-1.5 h-8"
                >
                  <Square className="w-3 h-3" />
                  End Shift
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Shift Expenses */}
      <Card className="border-border/50 overflow-hidden">
        <CardHeader className="py-3 border-b border-border/50 bg-secondary/20">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                <Receipt className="w-3 h-3 text-primary" />
              </div>
              Shift Expenses
            </CardTitle>
            {totalShiftExpenses > 0 && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="flex items-center gap-1 text-green-500">
                    <Banknote className="w-3 h-3" />₱{cashExpenses.toLocaleString()}
                  </span>
                  <span className="text-muted-foreground">•</span>
                  <span className="flex items-center gap-1 text-blue-500">
                    <span className="text-[10px]">GC</span>₱{gcashExpenses.toLocaleString()}
                  </span>
                </div>
                <Badge className="bg-primary/20 text-primary border-primary/30 font-semibold">
                  ₱{totalShiftExpenses.toLocaleString()}
                </Badge>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="py-3">
          {shiftExpenses.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
                <Receipt className="w-6 h-6 text-muted-foreground/50" />
              </div>
              <p className="text-sm text-muted-foreground">No expenses this shift</p>
            </div>
          ) : (
            <div className="space-y-2">
              {shiftExpenses.map(expense => (
                <div key={expense.id} className="flex items-center justify-between p-3 bg-secondary/30 rounded-xl border border-border/30 transition-all hover:border-border/50 group">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center",
                      expense.payment_source === 'cash' ? "bg-green-500/20" : "bg-blue-500/20"
                    )}>
                      {expense.payment_source === 'cash' 
                        ? <Banknote className="w-4 h-4 text-green-500" />
                        : <span className="text-xs font-bold text-blue-500">GC</span>
                      }
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">₱{expense.amount.toLocaleString()}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 h-5">
                          {EXPENSE_CATEGORIES.find(c => c.value === expense.category)?.label || expense.category}
                        </Badge>
                      </div>
                      {expense.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{expense.description}</p>
                      )}
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => deleteExpense(expense.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Employees */}
      <Card className="border-border/50 overflow-hidden">
        <CardHeader className="py-3 border-b border-border/50 bg-secondary/20">
          <CardTitle className="text-sm flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center">
              <User className="w-3 h-3 text-muted-foreground" />
            </div>
            Employees
            <Badge variant="secondary" className="ml-auto text-xs">{employees.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="py-3 space-y-2">
          {employees.map(emp => {
            const activeShift = getEmployeeShift(emp.id);
            return (
              <div key={emp.id} className="flex items-center justify-between p-3 bg-secondary/30 rounded-xl border border-border/30 transition-all hover:border-border/50">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center",
                    activeShift ? "bg-green-500/20" : "bg-muted"
                  )}>
                    <User className={cn("w-4 h-4", activeShift ? "text-green-500" : "text-muted-foreground")} />
                  </div>
                  <span className="font-medium">{emp.name}</span>
                </div>
                {activeShift ? (
                  <Badge className="bg-green-500/20 text-green-500 border-green-500/30">
                    Working
                  </Badge>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => startShift(emp.id)} className="h-8 gap-1.5 border-border/50">
                    <Play className="w-3 h-3" />
                    Start
                  </Button>
                )}
              </div>
            );
          })}
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

      {/* Cash Handover Dialog */}
      <Dialog open={showHandoverDialog} onOpenChange={setShowHandoverDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="w-5 h-5" />
              Cash Handover
            </DialogTitle>
            <DialogDescription>
              Submit cash collected during shift for admin verification
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Employee</label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Cash ₱</label>
                <Input
                  type="number"
                  value={cashAmount}
                  onChange={e => setCashAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">GCash ₱</label>
                <Input
                  type="number"
                  value={gcashAmount}
                  onChange={e => setGcashAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowHandoverDialog(false)}>Cancel</Button>
              <Button onClick={submitCashHandover} disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}