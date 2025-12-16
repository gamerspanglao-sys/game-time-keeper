import React, { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { 
  RefreshCw, Lock, Loader2, Sun, Moon, Plus, Trash2, Banknote, Smartphone, 
  Wallet, History, Download, CircleDollarSign, ArrowDownCircle
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type ShiftType = 'day' | 'night';
type PaymentSource = 'cash' | 'gcash';
type ExpenseType = 'shift' | 'balance';

interface CashRecord {
  id: string;
  date: string;
  shift: ShiftType;
  cash_expected: number | null;
  gcash_expected: number | null;
  cash_actual: number | null;
  gcash_actual: number | null;
}

interface Expense {
  id: string;
  category: string;
  amount: number;
  description: string | null;
  shift: string;
  date: string;
  payment_source: PaymentSource;
  expense_type: ExpenseType;
}

const ADMIN_PIN = '8808';

const CATEGORIES = [
  { value: 'purchases', label: 'Purchases' },
  { value: 'salaries', label: 'Salaries' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'employee_food', label: 'Employee Food' },
  { value: 'food_hunters', label: 'Food Hunters' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'other', label: 'Other' }
];

const getCategoryLabel = (v: string) => CATEGORIES.find(c => c.value === v)?.label || v;

const getCurrentShift = (): ShiftType => {
  const now = new Date();
  const manilaTime = new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000);
  return manilaTime.getHours() >= 5 && manilaTime.getHours() < 17 ? 'day' : 'night';
};

const getShiftDate = (): string => {
  const now = new Date();
  const manilaTime = new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000);
  if (manilaTime.getHours() < 5) manilaTime.setDate(manilaTime.getDate() - 1);
  return format(manilaTime, 'yyyy-MM-dd');
};

export default function CashRegister() {
  const [records, setRecords] = useState<CashRecord[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pinInput, setPinInput] = useState('');
  
  const [selectedDate, setSelectedDate] = useState(getShiftDate());
  const [selectedShift, setSelectedShift] = useState<ShiftType>(getCurrentShift());
  
  // Edit cash dialog
  const [showCashDialog, setShowCashDialog] = useState(false);
  const [editCash, setEditCash] = useState('');
  const [editGcash, setEditGcash] = useState('');
  
  // Add expense dialog
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [expAmount, setExpAmount] = useState('');
  const [expCategory, setExpCategory] = useState('purchases');
  const [expDescription, setExpDescription] = useState('');
  const [expSource, setExpSource] = useState<PaymentSource>('cash');
  const [expType, setExpType] = useState<ExpenseType>('balance');
  
  // History filters
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [filterExpType, setFilterExpType] = useState<string>('all');

  const currentRecord = records.find(r => r.date === selectedDate && r.shift === selectedShift);
  const currentExpenses = expenses.filter(e => e.date === selectedDate && e.shift === selectedShift);
  
  // Balance calculations
  const balanceCashExp = currentExpenses.filter(e => e.expense_type === 'balance' && e.payment_source === 'cash').reduce((s, e) => s + e.amount, 0);
  const balanceGcashExp = currentExpenses.filter(e => e.expense_type === 'balance' && e.payment_source === 'gcash').reduce((s, e) => s + e.amount, 0);
  const shiftCashExp = currentExpenses.filter(e => e.expense_type === 'shift' && e.payment_source === 'cash').reduce((s, e) => s + e.amount, 0);
  const shiftGcashExp = currentExpenses.filter(e => e.expense_type === 'shift' && e.payment_source === 'gcash').reduce((s, e) => s + e.amount, 0);
  
  const cashOnHand = (currentRecord?.cash_actual || 0) - balanceCashExp;
  const gcashOnHand = (currentRecord?.gcash_actual || 0) - balanceGcashExp;
  const totalOnHand = cashOnHand + gcashOnHand;

  // History expenses with filters
  const historyExpenses = expenses.filter(e => {
    if (e.date < dateFrom || e.date > dateTo) return false;
    if (filterCategory !== 'all' && e.category !== filterCategory) return false;
    if (filterSource !== 'all' && e.payment_source !== filterSource) return false;
    if (filterExpType !== 'all' && e.expense_type !== filterExpType) return false;
    return true;
  });
  
  const historyTotalCash = historyExpenses.filter(e => e.payment_source === 'cash').reduce((s, e) => s + e.amount, 0);
  const historyTotalGcash = historyExpenses.filter(e => e.payment_source === 'gcash').reduce((s, e) => s + e.amount, 0);

  const loadData = async () => {
    try {
      const [{ data: cashData }, { data: expData }] = await Promise.all([
        supabase.from('cash_register').select('id, date, shift, cash_expected, gcash_expected, cash_actual, gcash_actual').order('date', { ascending: false }),
        supabase.from('cash_expenses').select('*').order('created_at', { ascending: false })
      ]);
      setRecords((cashData || []) as CashRecord[]);
      setExpenses((expData || []) as Expense[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const channel = supabase.channel('cash-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_register' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_expenses' }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleLogin = () => {
    if (pinInput === ADMIN_PIN) {
      setIsAdmin(true);
      setShowPinDialog(false);
      setPinInput('');
    } else {
      toast.error('Invalid PIN');
    }
  };

  const syncLoyverse = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('loyverse-history-sync', { body: { days: 7 } });
      if (error) throw error;
      if (data?.success) {
        await loadData();
        toast.success('Synced');
      }
    } catch (e) {
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const saveCash = async () => {
    const cash = parseInt(editCash) || 0;
    const gcash = parseInt(editGcash) || 0;
    
    try {
      if (currentRecord) {
        await supabase.from('cash_register').update({
          cash_actual: cash,
          gcash_actual: gcash,
          actual_cash: cash + gcash,
          discrepancy: (cash + gcash) - ((currentRecord.cash_expected || 0) + (currentRecord.gcash_expected || 0))
        }).eq('id', currentRecord.id);
      } else {
        await supabase.from('cash_register').insert({
          date: selectedDate,
          shift: selectedShift,
          cash_actual: cash,
          gcash_actual: gcash,
          actual_cash: cash + gcash
        });
      }
      toast.success('Saved');
      setShowCashDialog(false);
      loadData();
    } catch (e) {
      toast.error('Save failed');
    }
  };

  const openExpenseDialog = (source: PaymentSource, type: ExpenseType) => {
    setExpSource(source);
    setExpType(type);
    setExpAmount('');
    setExpCategory('purchases');
    setExpDescription('');
    setShowExpenseDialog(true);
  };

  const addExpense = async () => {
    const amount = parseInt(expAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter valid amount');
      return;
    }
    
    try {
      let existingRecord = records.find(r => r.date === selectedDate && r.shift === selectedShift);
      let regId = existingRecord?.id;
      
      if (!regId) {
        const { data } = await supabase.from('cash_register').insert({ date: selectedDate, shift: selectedShift }).select('id').single();
        regId = data?.id;
      }
      
      await supabase.from('cash_expenses').insert({
        cash_register_id: regId,
        category: expCategory,
        amount,
        description: expDescription || null,
        shift: selectedShift,
        date: selectedDate,
        payment_source: expSource,
        expense_type: expType
      });
      
      toast.success('Expense added');
      setShowExpenseDialog(false);
      loadData();
    } catch (e) {
      toast.error('Failed to add');
    }
  };

  const deleteExpense = async (id: string) => {
    await supabase.from('cash_expenses').delete().eq('id', id);
    toast.success('Deleted');
    loadData();
  };

  const exportHistory = () => {
    const csv = [
      ['Date', 'Shift', 'Type', 'Category', 'Source', 'Amount', 'Description'].join(','),
      ...historyExpenses.map(e => [
        e.date,
        e.shift,
        e.expense_type === 'shift' ? 'Shift' : 'Balance',
        getCategoryLabel(e.category),
        e.payment_source.toUpperCase(),
        e.amount,
        `"${e.description || ''}"`
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses_${dateFrom}_${dateTo}.csv`;
    a.click();
  };

  const uniqueDates = [...new Set(records.map(r => r.date))].slice(0, 14);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!isAdmin) {
    return (
      <div className="p-4 max-w-md mx-auto">
        <Card className="mt-10 border-border/50">
          <CardContent className="py-10 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto">
              <Lock className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-bold">Cash Register</h2>
            <p className="text-muted-foreground text-sm">Admin access required</p>
            <Button size="lg" onClick={() => setShowPinDialog(true)} className="mt-4">
              <Lock className="w-4 h-4 mr-2" />Enter PIN
            </Button>
          </CardContent>
        </Card>
        <Dialog open={showPinDialog} onOpenChange={setShowPinDialog}>
          <DialogContent className="max-w-xs">
            <DialogHeader><DialogTitle>Enter PIN</DialogTitle></DialogHeader>
            <Input type="password" value={pinInput} onChange={e => setPinInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} placeholder="PIN" autoFocus />
            <Button onClick={handleLogin} className="w-full">Login</Button>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" /> Cash Register
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Manage cash & expenses</p>
        </div>
        <Button variant="outline" size="sm" onClick={syncLoyverse} disabled={syncing}>
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </Button>
      </div>

      {/* Shift Selector */}
      <div className="flex gap-2 items-center">
        <Select value={selectedDate} onValueChange={setSelectedDate}>
          <SelectTrigger className="w-32 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {uniqueDates.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex border border-border rounded-lg overflow-hidden">
          <button 
            className={cn(
              "px-3 py-1.5 text-sm font-medium transition-colors flex items-center gap-1",
              selectedShift === 'day' ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            )} 
            onClick={() => setSelectedShift('day')}
          >
            <Sun className="w-3.5 h-3.5" />Day
          </button>
          <button 
            className={cn(
              "px-3 py-1.5 text-sm font-medium transition-colors flex items-center gap-1",
              selectedShift === 'night' ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            )} 
            onClick={() => setSelectedShift('night')}
          >
            <Moon className="w-3.5 h-3.5" />Night
          </button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="balance" className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-11">
          <TabsTrigger value="balance" className="gap-1.5 text-sm"><Wallet className="w-4 h-4" />Balance</TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5 text-sm"><History className="w-4 h-4" />History</TabsTrigger>
          <TabsTrigger value="register" className="gap-1.5 text-sm"><CircleDollarSign className="w-4 h-4" />Register</TabsTrigger>
        </TabsList>

        {/* Balance Tab */}
        <TabsContent value="balance" className="space-y-4 mt-4">
          {/* Current Session Header */}
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <div>
              <p className="text-xs text-muted-foreground">Current Session</p>
              <p className="font-semibold">{selectedDate} • {selectedShift === 'day' ? '☀️ Day' : '🌙 Night'}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Received</p>
              <p className="font-bold text-primary">₱{((currentRecord?.cash_actual || 0) + (currentRecord?.gcash_actual || 0)).toLocaleString()}</p>
            </div>
          </div>

          {/* Cash & GCash Cards - Tappable */}
          <div className="grid grid-cols-2 gap-3">
            {/* Cash Card */}
            <Card 
              className="cursor-pointer hover:border-green-500/50 transition-all active:scale-[0.98] border-green-500/20 bg-green-500/5"
              onClick={() => openExpenseDialog('cash', 'balance')}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                    <Banknote className="w-5 h-5 text-green-500" />
                  </div>
                  <ArrowDownCircle className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">Cash</p>
                <p className="text-2xl font-bold text-green-500">₱{cashOnHand.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Tap to spend from cash
                </p>
              </CardContent>
            </Card>
            
            {/* GCash Card */}
            <Card 
              className="cursor-pointer hover:border-blue-500/50 transition-all active:scale-[0.98] border-blue-500/20 bg-blue-500/5"
              onClick={() => openExpenseDialog('gcash', 'balance')}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <Smartphone className="w-5 h-5 text-blue-500" />
                  </div>
                  <ArrowDownCircle className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">GCash</p>
                <p className="text-2xl font-bold text-blue-500">₱{gcashOnHand.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Tap to spend from GCash
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Quick Add Shift Expense */}
          <Card className="border-orange-500/20">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center">
                    <Plus className="w-4 h-4 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Shift Expense</p>
                    <p className="text-[10px] text-muted-foreground">Deduct from revenue</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="h-8 text-xs border-green-500/30 text-green-600 hover:bg-green-500/10"
                    onClick={() => openExpenseDialog('cash', 'shift')}
                  >
                    <Banknote className="w-3.5 h-3.5 mr-1" />Cash
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="h-8 text-xs border-blue-500/30 text-blue-600 hover:bg-blue-500/10"
                    onClick={() => openExpenseDialog('gcash', 'shift')}
                  >
                    <Smartphone className="w-3.5 h-3.5 mr-1" />GCash
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Today's Expenses */}
          {currentExpenses.length > 0 && (
            <Card>
              <CardHeader className="py-3 pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>Today's Expenses</span>
                  <Badge variant="secondary" className="text-xs">{currentExpenses.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {currentExpenses.map(exp => (
                    <div key={exp.id} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center",
                          exp.payment_source === 'gcash' ? "bg-blue-500/20" : "bg-green-500/20"
                        )}>
                          {exp.payment_source === 'gcash' 
                            ? <Smartphone className="w-3 h-3 text-blue-500" /> 
                            : <Banknote className="w-3 h-3 text-green-500" />
                          }
                        </span>
                        <div>
                          <div className="text-sm font-medium flex items-center gap-1">
                            {getCategoryLabel(exp.category)}
                            <Badge variant={exp.expense_type === 'shift' ? 'outline' : 'secondary'} className="text-[9px] h-4 px-1">
                              {exp.expense_type === 'shift' ? 'shift' : 'bal'}
                            </Badge>
                          </div>
                          {exp.description && <div className="text-[10px] text-muted-foreground">{exp.description}</div>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-semibold text-sm">₱{exp.amount.toLocaleString()}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive/70 hover:text-destructive" onClick={() => deleteExpense(exp.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Summary */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="p-3 bg-muted/30 rounded-lg">
              <p className="text-xs text-muted-foreground">Shift Expenses</p>
              <p className="font-semibold">₱{(shiftCashExp + shiftGcashExp).toLocaleString()}</p>
            </div>
            <div className="p-3 bg-muted/30 rounded-lg">
              <p className="text-xs text-muted-foreground">Balance Expenses</p>
              <p className="font-semibold">₱{(balanceCashExp + balanceGcashExp).toLocaleString()}</p>
            </div>
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4 mt-4">
          {/* Filters */}
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="flex gap-2 items-center">
                <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="flex-1 h-9 text-sm" />
                <span className="text-muted-foreground text-sm">—</span>
                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="flex-1 h-9 text-sm" />
              </div>
              
              <div className="grid grid-cols-3 gap-2">
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterSource} onValueChange={setFilterSource}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Source" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="gcash">GCash</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterExpType} onValueChange={setFilterExpType}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="shift">Shift</SelectItem>
                    <SelectItem value="balance">Balance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Totals */}
          <div className="grid grid-cols-2 gap-2">
            <Card className="border-green-500/20 bg-green-500/5">
              <CardContent className="p-3 flex items-center gap-3">
                <Banknote className="w-5 h-5 text-green-500" />
                <div>
                  <p className="text-[10px] text-muted-foreground">Cash</p>
                  <p className="font-bold text-green-500">₱{historyTotalCash.toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-blue-500/20 bg-blue-500/5">
              <CardContent className="p-3 flex items-center gap-3">
                <Smartphone className="w-5 h-5 text-blue-500" />
                <div>
                  <p className="text-[10px] text-muted-foreground">GCash</p>
                  <p className="font-bold text-blue-500">₱{historyTotalGcash.toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Button variant="outline" size="sm" className="w-full" onClick={exportHistory}>
            <Download className="w-4 h-4 mr-2" />Export CSV
          </Button>

          {/* History List */}
          <Card>
            <CardHeader className="py-3 pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Expenses</span>
                <Badge variant="secondary" className="text-xs">{historyExpenses.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2">
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {historyExpenses.slice(0, 100).map(exp => (
                  <div key={exp.id} className="flex items-center justify-between text-xs p-2 bg-muted/20 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "w-5 h-5 rounded-full flex items-center justify-center",
                        exp.payment_source === 'gcash' ? "bg-blue-500/20" : "bg-green-500/20"
                      )}>
                        {exp.payment_source === 'gcash' ? <Smartphone className="w-2.5 h-2.5 text-blue-500" /> : <Banknote className="w-2.5 h-2.5 text-green-500" />}
                      </span>
                      <span className="text-muted-foreground">{exp.date}</span>
                      <Badge variant="outline" className="text-[9px] px-1 h-4">{exp.shift === 'day' ? '☀' : '🌙'}</Badge>
                      <span>{getCategoryLabel(exp.category)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-semibold">₱{exp.amount.toLocaleString()}</span>
                      <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive/70" onClick={() => deleteExpense(exp.id)}>
                        <Trash2 className="w-2.5 h-2.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Register Tab */}
        <TabsContent value="register" className="space-y-4 mt-4">
          {/* Current Values */}
          <Card>
            <CardHeader className="py-3 pb-2">
              <CardTitle className="text-sm">Actual Amounts Received</CardTitle>
            </CardHeader>
            <CardContent className="py-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center gap-2 mb-1">
                    <Banknote className="w-4 h-4 text-green-500" />
                    <span className="text-xs text-muted-foreground">Cash</span>
                  </div>
                  <p className="text-2xl font-bold text-green-500">
                    ₱{(currentRecord?.cash_actual || 0).toLocaleString()}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <div className="flex items-center gap-2 mb-1">
                    <Smartphone className="w-4 h-4 text-blue-500" />
                    <span className="text-xs text-muted-foreground">GCash</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-500">
                    ₱{(currentRecord?.gcash_actual || 0).toLocaleString()}
                  </p>
                </div>
              </div>

              <Button className="w-full" onClick={() => {
                setEditCash((currentRecord?.cash_actual || 0).toString());
                setEditGcash((currentRecord?.gcash_actual || 0).toString());
                setShowCashDialog(true);
              }}>
                <Plus className="w-4 h-4 mr-2" />Update Amounts
              </Button>
            </CardContent>
          </Card>

          {/* Expected vs Actual */}
          {currentRecord && (
            <Card>
              <CardHeader className="py-3 pb-2">
                <CardTitle className="text-sm">Expected vs Actual</CardTitle>
              </CardHeader>
              <CardContent className="py-3">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Banknote className="w-4 h-4 text-green-500" />
                      <span className="text-sm">Cash</span>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">
                        Expected: ₱{(currentRecord.cash_expected || 0).toLocaleString()}
                      </div>
                      <div className={cn(
                        "font-semibold",
                        (currentRecord.cash_actual || 0) >= (currentRecord.cash_expected || 0) ? "text-green-500" : "text-destructive"
                      )}>
                        Actual: ₱{(currentRecord.cash_actual || 0).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-blue-500" />
                      <span className="text-sm">GCash</span>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">
                        Expected: ₱{(currentRecord.gcash_expected || 0).toLocaleString()}
                      </div>
                      <div className={cn(
                        "font-semibold",
                        (currentRecord.gcash_actual || 0) >= (currentRecord.gcash_expected || 0) ? "text-green-500" : "text-destructive"
                      )}>
                        Actual: ₱{(currentRecord.gcash_actual || 0).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Total Discrepancy</span>
                      <span className={cn(
                        "font-bold",
                        ((currentRecord.cash_actual || 0) + (currentRecord.gcash_actual || 0)) >= 
                        ((currentRecord.cash_expected || 0) + (currentRecord.gcash_expected || 0)) 
                          ? "text-green-500" : "text-destructive"
                      )}>
                        ₱{(
                          ((currentRecord.cash_actual || 0) + (currentRecord.gcash_actual || 0)) -
                          ((currentRecord.cash_expected || 0) + (currentRecord.gcash_expected || 0))
                        ).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Expense Dialog */}
      <Dialog open={showExpenseDialog} onOpenChange={setShowExpenseDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {expSource === 'cash' 
                ? <Banknote className="w-5 h-5 text-green-500" /> 
                : <Smartphone className="w-5 h-5 text-blue-500" />
              }
              {expType === 'balance' ? 'Spend from ' : 'Shift Expense: '}
              {expSource === 'cash' ? 'Cash' : 'GCash'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Amount</label>
              <Input 
                type="number" 
                placeholder="0" 
                value={expAmount} 
                onChange={e => setExpAmount(e.target.value)}
                className="text-lg"
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Category</label>
              <Select value={expCategory} onValueChange={setExpCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Description (optional)</label>
              <Input 
                placeholder="What was it for?" 
                value={expDescription} 
                onChange={e => setExpDescription(e.target.value)} 
              />
            </div>
            <Button className="w-full" onClick={addExpense}>
              <Plus className="w-4 h-4 mr-2" />Add Expense
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Enter Cash Dialog */}
      <Dialog open={showCashDialog} onOpenChange={setShowCashDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Update Received Amounts</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground flex items-center gap-1 mb-1">
                <Banknote className="w-4 h-4 text-green-500" /> Cash Received
              </label>
              <Input 
                type="number" 
                value={editCash} 
                onChange={e => setEditCash(e.target.value)} 
                placeholder="0" 
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground flex items-center gap-1 mb-1">
                <Smartphone className="w-4 h-4 text-blue-500" /> GCash Received
              </label>
              <Input 
                type="number" 
                value={editGcash} 
                onChange={e => setEditGcash(e.target.value)} 
                placeholder="0" 
              />
            </div>
            <Button className="w-full" onClick={saveCash}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
