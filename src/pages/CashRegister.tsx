import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { 
  RefreshCw,
  Lock,
  Wallet,
  Loader2,
  Sun,
  Moon,
  Pencil,
  Plus,
  Trash2,
  Banknote,
  Smartphone
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// ============= TYPES =============

type ShiftType = 'day' | 'night';
type PaymentSource = 'cash' | 'gcash';

interface CashRecord {
  id: string;
  date: string;
  shift: ShiftType;
  opening_balance: number;
  expected_sales: number;
  cash_expected: number | null;
  gcash_expected: number | null;
  cost: number;
  actual_cash: number | null;
  cash_actual: number | null;
  gcash_actual: number | null;
  discrepancy: number | null;
  purchases: number;
  salaries: number;
  other_expenses: number;
  notes: string | null;
}

interface Expense {
  id: string;
  cash_register_id: string;
  category: string;
  amount: number;
  description: string | null;
  shift: string;
  date: string;
  payment_source: PaymentSource;
  created_at: string;
}

interface ShiftHandover {
  employee_name: string;
  cash_handed_over: number | null;
  gcash_handed_over: number | null;
}

// ============= CONSTANTS =============

const ADMIN_PIN = '8808';

const EXPENSE_CATEGORIES = [
  { value: 'purchases', label: 'Закупки товара' },
  { value: 'salaries', label: 'Зарплаты' },
  { value: 'equipment', label: 'Оборудование' },
  { value: 'inventory', label: 'Инвентарь' },
  { value: 'employee_food', label: 'Еда сотрудников' },
  { value: 'food_hunters', label: 'Food Hunters' },
  { value: 'other', label: 'Прочее' }
];

const getCategoryLabel = (value: string) => {
  return EXPENSE_CATEGORIES.find(c => c.value === value)?.label || value;
};

// Get current shift based on Manila time
const getCurrentShift = (): ShiftType => {
  const now = new Date();
  const manilaOffset = 8 * 60;
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const manilaTime = new Date(utcTime + (manilaOffset * 60000));
  const hour = manilaTime.getHours();
  return hour >= 5 && hour < 17 ? 'day' : 'night';
};

// Get current date for the shift
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

export default function CashRegister() {
  const [records, setRecords] = useState<CashRecord[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [currentShiftHandovers, setCurrentShiftHandovers] = useState<ShiftHandover[]>([]);
  
  // Admin mode
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  
  // Edit cash dialog
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingRecord, setEditingRecord] = useState<CashRecord | null>(null);
  const [editCashActual, setEditCashActual] = useState('');
  const [editGcashActual, setEditGcashActual] = useState('');

  // Add expense dialog
  const [showAddExpenseDialog, setShowAddExpenseDialog] = useState(false);
  const [newExpenseAmount, setNewExpenseAmount] = useState('');
  const [newExpenseCategory, setNewExpenseCategory] = useState('purchases');
  const [newExpenseDescription, setNewExpenseDescription] = useState('');
  const [newExpenseSource, setNewExpenseSource] = useState<PaymentSource>('cash');

  // Selected shift for viewing
  const [selectedDate, setSelectedDate] = useState<string>(getShiftDate());
  const [selectedShift, setSelectedShift] = useState<ShiftType>(getCurrentShift());

  // Calculate totals
  const totalEmployeeCash = currentShiftHandovers.reduce((sum, h) => sum + (h.cash_handed_over || 0), 0);
  const totalEmployeeGcash = currentShiftHandovers.reduce((sum, h) => sum + (h.gcash_handed_over || 0), 0);

  // Get current shift record
  const currentRecord = records.find(r => r.date === selectedDate && r.shift === selectedShift);

  // Get expenses for current shift
  const currentShiftExpenses = expenses.filter(e => e.date === selectedDate && e.shift === selectedShift);
  const cashExpenses = currentShiftExpenses.filter(e => e.payment_source === 'cash').reduce((s, e) => s + e.amount, 0);
  const gcashExpenses = currentShiftExpenses.filter(e => e.payment_source === 'gcash').reduce((s, e) => s + e.amount, 0);

  // Calculate balance on hand
  const cashOnHand = (currentRecord?.cash_actual || 0) - cashExpenses;
  const gcashOnHand = (currentRecord?.gcash_actual || 0) - gcashExpenses;

  // Load data
  const loadData = async () => {
    try {
      const { data, error } = await supabase
        .from('cash_register')
        .select('*')
        .order('date', { ascending: false })
        .order('shift', { ascending: true });

      if (error) throw error;
      setRecords((data || []) as CashRecord[]);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadExpenses = async () => {
    try {
      const { data, error } = await supabase
        .from('cash_expenses')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setExpenses((data || []) as Expense[]);
    } catch (error) {
      console.error('Error loading expenses:', error);
    }
  };

  const loadCurrentShiftHandovers = async () => {
    const shiftTypeFilter = selectedShift === 'day' ? 'Day (5AM-5PM)' : 'Night (5PM-5AM)';
    
    const { data } = await supabase
      .from('shifts')
      .select(`
        cash_handed_over,
        gcash_handed_over,
        employees!inner(name)
      `)
      .eq('date', selectedDate)
      .eq('shift_type', shiftTypeFilter)
      .not('cash_handed_over', 'is', null);
    
    if (data) {
      const handovers: ShiftHandover[] = data.map((s: any) => ({
        employee_name: s.employees?.name || 'Unknown',
        cash_handed_over: s.cash_handed_over,
        gcash_handed_over: s.gcash_handed_over || 0
      }));
      setCurrentShiftHandovers(handovers);
    }
  };

  useEffect(() => {
    loadData();
    loadExpenses();
  }, []);

  useEffect(() => {
    loadCurrentShiftHandovers();
  }, [selectedDate, selectedShift]);

  useEffect(() => {
    const channel = supabase
      .channel('cash-register-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_register' }, () => {
        loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => {
        loadCurrentShiftHandovers();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_expenses' }, () => {
        loadExpenses();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedDate, selectedShift]);

  const handleAdminLogin = () => {
    if (pinInput === ADMIN_PIN) {
      setIsAdminMode(true);
      setShowPinDialog(false);
      setPinInput('');
      setPinError('');
    } else {
      setPinError('Wrong PIN');
    }
  };

  const syncFromLoyverse = async () => {
    setSyncing(true);
    try {
      toast.info('Syncing sales data from Loyverse...');
      
      const { data, error } = await supabase.functions.invoke('loyverse-history-sync', {
        body: { days: 7 }
      });

      if (error) throw error;

      if (data?.success) {
        await loadData();
        toast.success(`Synced ${data.message}`);
      } else {
        throw new Error(data?.error || 'Sync failed');
      }
    } catch (error) {
      console.error('Error syncing from Loyverse:', error);
      toast.error('Failed to sync from Loyverse');
    } finally {
      setSyncing(false);
    }
  };

  const openEditDialog = (record: CashRecord) => {
    setEditingRecord(record);
    setEditCashActual(record.cash_actual?.toString() || '');
    setEditGcashActual(record.gcash_actual?.toString() || '');
    setShowEditDialog(true);
  };

  const saveEdit = async () => {
    if (!editingRecord) return;
    
    const cashActual = parseInt(editCashActual) || 0;
    const gcashActual = parseInt(editGcashActual) || 0;
    const totalActual = cashActual + gcashActual;
    const expectedTotal = (editingRecord.cash_expected || 0) + (editingRecord.gcash_expected || 0);
    const discrepancy = totalActual - expectedTotal;
    
    try {
      const { error } = await supabase
        .from('cash_register')
        .update({
          cash_actual: cashActual,
          gcash_actual: gcashActual,
          actual_cash: totalActual,
          discrepancy
        })
        .eq('id', editingRecord.id);

      if (error) throw error;
      
      toast.success('Updated successfully');
      setShowEditDialog(false);
      loadData();
    } catch (error) {
      console.error('Error updating:', error);
      toast.error('Failed to update');
    }
  };

  const addExpense = async () => {
    const amount = parseInt(newExpenseAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Введите корректную сумму');
      return;
    }

    try {
      let cashRegisterId = currentRecord?.id;

      // Create cash_register record if doesn't exist
      if (!cashRegisterId) {
        const { data: created, error: createError } = await supabase
          .from('cash_register')
          .insert({ date: selectedDate, shift: selectedShift })
          .select('id')
          .single();
        if (createError) throw createError;
        cashRegisterId = created.id;
      }

      const { error } = await supabase
        .from('cash_expenses')
        .insert({
          cash_register_id: cashRegisterId,
          category: newExpenseCategory,
          amount,
          description: newExpenseDescription || null,
          shift: selectedShift,
          date: selectedDate,
          payment_source: newExpenseSource
        });

      if (error) throw error;

      toast.success('Расход добавлен');
      setShowAddExpenseDialog(false);
      setNewExpenseAmount('');
      setNewExpenseDescription('');
      loadExpenses();
      loadData();
    } catch (error) {
      console.error('Error adding expense:', error);
      toast.error('Ошибка добавления');
    }
  };

  const deleteExpense = async (expenseId: string) => {
    if (!confirm('Удалить этот расход?')) return;
    
    try {
      await supabase.from('cash_expenses').delete().eq('id', expenseId);
      toast.success('Удалено');
      loadExpenses();
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast.error('Ошибка удаления');
    }
  };

  // Get unique dates for selector
  const uniqueDates = [...new Set(records.map(r => r.date))].slice(0, 7);

  // Get recent records (last 7 days)
  const recentRecords = records.slice(0, 14);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Non-admin view - just show login prompt
  if (!isAdminMode) {
    return (
      <div className="p-4 max-w-md mx-auto">
        <Card className="mt-10">
          <CardContent className="py-8 text-center space-y-4">
            <Lock className="w-12 h-12 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-semibold">Cash Register</h2>
            <p className="text-muted-foreground">Admin access required</p>
            <Button onClick={() => setShowPinDialog(true)}>
              <Lock className="w-4 h-4 mr-2" />
              Enter PIN
            </Button>
          </CardContent>
        </Card>

        {/* PIN Dialog */}
        <Dialog open={showPinDialog} onOpenChange={setShowPinDialog}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle>Admin Access</DialogTitle>
              <DialogDescription>Enter PIN to access cash register</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                type="password"
                placeholder="Enter PIN"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
              />
              {pinError && <p className="text-sm text-red-500">{pinError}</p>}
              <Button onClick={handleAdminLogin} className="w-full">Login</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">💰 Cash Register</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={syncFromLoyverse}
            disabled={syncing}
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span className="ml-2 hidden sm:inline">Sync</span>
          </Button>
        </div>
      </div>

      {/* Shift Selector */}
      <Card>
        <CardContent className="py-3">
          <div className="flex gap-2 items-center">
            <Select value={selectedDate} onValueChange={setSelectedDate}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {uniqueDates.map(date => (
                  <SelectItem key={date} value={date}>{date}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex border rounded-md overflow-hidden">
              <Button
                variant={selectedShift === 'day' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-none"
                onClick={() => setSelectedShift('day')}
              >
                <Sun className="w-4 h-4 mr-1" /> Day
              </Button>
              <Button
                variant={selectedShift === 'night' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-none"
                onClick={() => setSelectedShift('night')}
              >
                <Moon className="w-4 h-4 mr-1" /> Night
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Balance Tracker - Main Feature */}
      <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/10 to-transparent">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {selectedShift === 'day' ? '☀️ Day' : '🌙 Night'} {selectedDate}
              </Badge>
              <span className="text-muted-foreground text-sm">Balance Tracker</span>
            </div>
            <Button 
              variant="default" 
              size="sm"
              onClick={() => currentRecord && openEditDialog(currentRecord)}
            >
              <Pencil className="w-4 h-4 mr-1" />
              Set Actual
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Cash On Hand */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Banknote className="w-5 h-5 text-green-600" />
                <span className="text-xs text-green-600 font-semibold uppercase">Cash на руках</span>
              </div>
              <div className="text-3xl font-bold text-green-600">
                ₱{cashOnHand.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground mt-2 space-y-1">
                <div className="flex justify-between">
                  <span>Получено:</span>
                  <span>₱{(currentRecord?.cash_actual || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-red-500">
                  <span>Расходы:</span>
                  <span>-₱{cashExpenses.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Smartphone className="w-5 h-5 text-blue-600" />
                <span className="text-xs text-blue-600 font-semibold uppercase">GCash на руках</span>
              </div>
              <div className="text-3xl font-bold text-blue-600">
                ₱{gcashOnHand.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground mt-2 space-y-1">
                <div className="flex justify-between">
                  <span>Получено:</span>
                  <span>₱{(currentRecord?.gcash_actual || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-red-500">
                  <span>Расходы:</span>
                  <span>-₱{gcashExpenses.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Resortitsa Detection */}
          {currentRecord && ((currentRecord.cash_actual || 0) + (currentRecord.gcash_actual || 0)) > 0 && (() => {
            const cashDiff = (currentRecord.cash_actual || 0) - (currentRecord.cash_expected || 0);
            const gcashDiff = (currentRecord.gcash_actual || 0) - (currentRecord.gcash_expected || 0);
            const isResortitsa = (cashDiff > 0 && gcashDiff < 0) || (cashDiff < 0 && gcashDiff > 0);
            const resortitsaAmount = Math.min(Math.abs(cashDiff), Math.abs(gcashDiff));
            
            if (isResortitsa && resortitsaAmount >= 50) {
              return (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <div className="text-[10px] text-amber-600 uppercase tracking-wider font-semibold mb-1">
                    ⚠️ Пересортица обнаружена!
                  </div>
                  <div className="text-sm text-amber-700">
                    {cashDiff > 0 
                      ? `GCash в Loyverse записан как Cash: ~₱${resortitsaAmount.toLocaleString()}`
                      : `Cash в Loyverse записан как GCash: ~₱${resortitsaAmount.toLocaleString()}`
                    }
                  </div>
                </div>
              );
            }
            return null;
          })()}

          {/* Expected vs Actual Comparison */}
          {currentRecord && (
            <div className="p-3 bg-muted/30 border rounded-lg">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">
                Loyverse Expected vs Actual
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div></div>
                <div className="text-center font-medium">Expected</div>
                <div className="text-center font-medium">Actual</div>
                
                <div>💵 Cash</div>
                <div className="text-center">₱{(currentRecord.cash_expected || 0).toLocaleString()}</div>
                <div className={cn(
                  "text-center",
                  (currentRecord.cash_actual || 0) - (currentRecord.cash_expected || 0) >= 0 ? "text-green-600" : "text-red-600"
                )}>
                  ₱{(currentRecord.cash_actual || 0).toLocaleString()}
                </div>
                
                <div>📱 GCash</div>
                <div className="text-center">₱{(currentRecord.gcash_expected || 0).toLocaleString()}</div>
                <div className={cn(
                  "text-center",
                  (currentRecord.gcash_actual || 0) - (currentRecord.gcash_expected || 0) >= 0 ? "text-green-600" : "text-red-600"
                )}>
                  ₱{(currentRecord.gcash_actual || 0).toLocaleString()}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Expenses for Current Shift */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span>📝 Расходы за смену</span>
            <Button size="sm" onClick={() => setShowAddExpenseDialog(true)}>
              <Plus className="w-4 h-4 mr-1" /> Добавить
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {currentShiftExpenses.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Нет расходов за эту смену</p>
          ) : (
            <div className="space-y-2">
              {currentShiftExpenses.map(expense => (
                <div key={expense.id} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-xs",
                        expense.payment_source === 'cash' 
                          ? "bg-green-500/10 text-green-600 border-green-500/30" 
                          : "bg-blue-500/10 text-blue-600 border-blue-500/30"
                      )}
                    >
                      {expense.payment_source === 'cash' ? '💵' : '📱'}
                    </Badge>
                    <div>
                      <div className="text-sm font-medium">{getCategoryLabel(expense.category)}</div>
                      {expense.description && (
                        <div className="text-xs text-muted-foreground">{expense.description}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">₱{expense.amount.toLocaleString()}</span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 text-destructive"
                      onClick={() => deleteExpense(expense.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="pt-2 border-t flex justify-between text-sm font-semibold">
                <span>Итого расходы:</span>
                <span>₱{(cashExpenses + gcashExpenses).toLocaleString()}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Staff Handovers */}
      {currentShiftHandovers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">👥 Staff Handovers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {currentShiftHandovers.map((h, i) => (
                <div key={i} className="flex justify-between text-sm bg-muted/30 p-2 rounded">
                  <span className="font-medium">{h.employee_name}</span>
                  <span>
                    💵 ₱{(h.cash_handed_over || 0).toLocaleString()}
                    {(h.gcash_handed_over || 0) > 0 && (
                      <span className="ml-2">📱 ₱{h.gcash_handed_over?.toLocaleString()}</span>
                    )}
                  </span>
                </div>
              ))}
              <div className="flex justify-between text-sm font-bold pt-1 border-t">
                <span>Total from Staff</span>
                <span>
                  💵 ₱{totalEmployeeCash.toLocaleString()}
                  {totalEmployeeGcash > 0 && (
                    <span className="ml-2">📱 ₱{totalEmployeeGcash.toLocaleString()}</span>
                  )}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent History */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">📊 Recent History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left py-2 px-2">Date</th>
                  <th className="text-left py-2 px-2">Shift</th>
                  <th className="text-right py-2 px-2">Expected</th>
                  <th className="text-right py-2 px-2">Actual</th>
                  <th className="text-right py-2 px-2">Diff</th>
                  <th className="py-2 px-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {recentRecords.map((record) => {
                  const expectedTotal = (record.cash_expected || 0) + (record.gcash_expected || 0);
                  const actualTotal = (record.cash_actual || 0) + (record.gcash_actual || 0);
                  const diff = actualTotal - expectedTotal;
                  return (
                    <tr 
                      key={record.id} 
                      className={cn(
                        "border-b hover:bg-muted/50 cursor-pointer",
                        record.date === selectedDate && record.shift === selectedShift && "bg-primary/10"
                      )}
                      onClick={() => {
                        setSelectedDate(record.date);
                        setSelectedShift(record.shift);
                      }}
                    >
                      <td className="py-2 px-2 whitespace-nowrap">{record.date}</td>
                      <td className="py-2 px-2">
                        <Badge variant={record.shift === 'day' ? 'default' : 'secondary'} className="text-xs">
                          {record.shift === 'day' ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
                        </Badge>
                      </td>
                      <td className="text-right py-2 px-2 text-green-600">₱{expectedTotal.toLocaleString()}</td>
                      <td className="text-right py-2 px-2 text-blue-600">
                        {actualTotal > 0 ? `₱${actualTotal.toLocaleString()}` : '—'}
                      </td>
                      <td className={cn(
                        "text-right py-2 px-2 font-medium",
                        actualTotal === 0 ? "text-muted-foreground" :
                        diff === 0 ? "text-green-600" :
                        diff > 0 ? "text-green-600" : "text-red-600"
                      )}>
                        {actualTotal === 0 ? '—' : (
                          diff === 0 ? '✓' : `${diff > 0 ? '+' : ''}₱${diff.toLocaleString()}`
                        )}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditDialog(record);
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Cash Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Enter Cash Received</DialogTitle>
            <DialogDescription>
              {editingRecord?.date} {editingRecord?.shift === 'day' ? '☀️ Day' : '🌙 Night'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground">Expected Cash: ₱{(editingRecord?.cash_expected || 0).toLocaleString()}</label>
              <div className="flex items-center gap-2 mt-1">
                <Wallet className="w-4 h-4 text-green-600" />
                <Input
                  type="number"
                  placeholder="Cash Actual"
                  value={editCashActual}
                  onChange={(e) => setEditCashActual(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Expected GCash: ₱{(editingRecord?.gcash_expected || 0).toLocaleString()}</label>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-blue-600">📱</span>
                <Input
                  type="number"
                  placeholder="GCash Actual"
                  value={editGcashActual}
                  onChange={(e) => setEditGcashActual(e.target.value)}
                />
              </div>
            </div>
            <Button onClick={saveEdit} className="w-full">Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Expense Dialog */}
      <Dialog open={showAddExpenseDialog} onOpenChange={setShowAddExpenseDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Добавить расход</DialogTitle>
            <DialogDescription>
              {selectedDate} {selectedShift === 'day' ? '☀️ Day' : '🌙 Night'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Источник оплаты</label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={newExpenseSource === 'cash' ? 'default' : 'outline'}
                  className={cn(
                    "flex-1",
                    newExpenseSource === 'cash' && "bg-green-600 hover:bg-green-700"
                  )}
                  onClick={() => setNewExpenseSource('cash')}
                >
                  <Banknote className="w-4 h-4 mr-2" />
                  Cash
                </Button>
                <Button
                  type="button"
                  variant={newExpenseSource === 'gcash' ? 'default' : 'outline'}
                  className={cn(
                    "flex-1",
                    newExpenseSource === 'gcash' && "bg-blue-600 hover:bg-blue-700"
                  )}
                  onClick={() => setNewExpenseSource('gcash')}
                >
                  <Smartphone className="w-4 h-4 mr-2" />
                  GCash
                </Button>
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-1 block">Категория</label>
              <Select value={newExpenseCategory} onValueChange={setNewExpenseCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-1 block">Сумма</label>
              <Input
                type="number"
                placeholder="0"
                value={newExpenseAmount}
                onChange={(e) => setNewExpenseAmount(e.target.value)}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-1 block">Описание (опционально)</label>
              <Input
                placeholder="Описание расхода..."
                value={newExpenseDescription}
                onChange={(e) => setNewExpenseDescription(e.target.value)}
              />
            </div>
            
            <Button onClick={addExpense} className="w-full">Добавить</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
