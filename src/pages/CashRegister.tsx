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
  Calendar, Wallet, Receipt, History, UserCircle, Download
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
  
  // Add expense form state
  const [expAmount, setExpAmount] = useState('');
  const [expCategory, setExpCategory] = useState('purchases');
  const [expDescription, setExpDescription] = useState('');
  const [expSource, setExpSource] = useState<PaymentSource>('cash');
  const [expType, setExpType] = useState<ExpenseType>('shift');
  const [expDate, setExpDate] = useState(getShiftDate());
  const [expShift, setExpShift] = useState<ShiftType>(getCurrentShift());
  
  // History filters
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [filterExpType, setFilterExpType] = useState<string>('all');

  const currentRecord = records.find(r => r.date === selectedDate && r.shift === selectedShift);
  const currentExpenses = expenses.filter(e => e.date === selectedDate && e.shift === selectedShift);
  
  // Calculate balances by expense type
  // Shift expenses = from current shift revenue (reduces what staff hands over)
  // Balance expenses = from saved cash/gcash (reduces accumulated balance)
  const shiftCashExp = currentExpenses.filter(e => e.expense_type === 'shift' && e.payment_source === 'cash').reduce((s, e) => s + e.amount, 0);
  const shiftGcashExp = currentExpenses.filter(e => e.expense_type === 'shift' && e.payment_source === 'gcash').reduce((s, e) => s + e.amount, 0);
  const balanceCashExp = currentExpenses.filter(e => e.expense_type === 'balance' && e.payment_source === 'cash').reduce((s, e) => s + e.amount, 0);
  const balanceGcashExp = currentExpenses.filter(e => e.expense_type === 'balance' && e.payment_source === 'gcash').reduce((s, e) => s + e.amount, 0);
  
  const totalCashExp = shiftCashExp + balanceCashExp;
  const totalGcashExp = shiftGcashExp + balanceGcashExp;
  const cashOnHand = (currentRecord?.cash_actual || 0) - balanceCashExp;
  const gcashOnHand = (currentRecord?.gcash_actual || 0) - balanceGcashExp;

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
  const historyShiftTotal = historyExpenses.filter(e => e.expense_type === 'shift').reduce((s, e) => s + e.amount, 0);
  const historyBalanceTotal = historyExpenses.filter(e => e.expense_type === 'balance').reduce((s, e) => s + e.amount, 0);

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
        toast.success('Synced successfully');
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

  const addExpense = async () => {
    const amount = parseInt(expAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter valid amount');
      return;
    }
    
    try {
      // Find or create cash register entry for the expense date/shift
      let existingRecord = records.find(r => r.date === expDate && r.shift === expShift);
      let regId = existingRecord?.id;
      
      if (!regId) {
        const { data } = await supabase.from('cash_register').insert({ date: expDate, shift: expShift }).select('id').single();
        regId = data?.id;
      }
      
      await supabase.from('cash_expenses').insert({
        cash_register_id: regId,
        category: expCategory,
        amount,
        description: expDescription || null,
        shift: expShift,
        date: expDate,
        payment_source: expSource,
        expense_type: expType
      });
      
      toast.success('Expense added');
      setExpAmount('');
      setExpDescription('');
      loadData();
    } catch (e) {
      toast.error('Failed to add expense');
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
        <Card className="mt-10">
          <CardContent className="py-8 text-center space-y-4">
            <Lock className="w-12 h-12 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-semibold">Cash Register</h2>
            <p className="text-muted-foreground">Admin access required</p>
            <Button onClick={() => setShowPinDialog(true)}><Lock className="w-4 h-4 mr-2" />Login</Button>
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
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Wallet className="w-5 h-5" /> Cash Register
        </h1>
        <Button variant="outline" size="sm" onClick={syncLoyverse} disabled={syncing}>
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          <span className="ml-1">Sync</span>
        </Button>
      </div>

      {/* Shift Selector */}
      <div className="flex gap-2 items-center">
        <Select value={selectedDate} onValueChange={setSelectedDate}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {uniqueDates.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex border rounded-md">
          <Button variant={selectedShift === 'day' ? 'default' : 'ghost'} size="sm" className="rounded-r-none" onClick={() => setSelectedShift('day')}>
            <Sun className="w-4 h-4 mr-1" />Day
          </Button>
          <Button variant={selectedShift === 'night' ? 'default' : 'ghost'} size="sm" className="rounded-l-none" onClick={() => setSelectedShift('night')}>
            <Moon className="w-4 h-4 mr-1" />Night
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="balance" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="balance" className="gap-1"><Wallet className="w-4 h-4" />Balance</TabsTrigger>
          <TabsTrigger value="expenses" className="gap-1"><Receipt className="w-4 h-4" />Expenses</TabsTrigger>
          <TabsTrigger value="history" className="gap-1"><History className="w-4 h-4" />History</TabsTrigger>
        </TabsList>

        {/* Balance Tab */}
        <TabsContent value="balance" className="space-y-4 mt-4">
          {/* Balance Cards */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="bg-green-500/10 border-green-500/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Banknote className="w-5 h-5 text-green-600" />
                  <span className="text-xs text-green-600 font-semibold">CASH ON HAND</span>
                </div>
                <div className="text-2xl font-bold text-green-600">₱{cashOnHand.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Received: ₱{(currentRecord?.cash_actual || 0).toLocaleString()} − Balance Exp: ₱{balanceCashExp.toLocaleString()}
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-blue-500/10 border-blue-500/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Smartphone className="w-5 h-5 text-blue-600" />
                  <span className="text-xs text-blue-600 font-semibold">GCASH ON HAND</span>
                </div>
                <div className="text-2xl font-bold text-blue-600">₱{gcashOnHand.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Received: ₱{(currentRecord?.gcash_actual || 0).toLocaleString()} − Balance Exp: ₱{balanceGcashExp.toLocaleString()}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Enter Cash Button */}
          <Button className="w-full" onClick={() => {
            setEditCash((currentRecord?.cash_actual || 0).toString());
            setEditGcash((currentRecord?.gcash_actual || 0).toString());
            setShowCashDialog(true);
          }}>
            <Banknote className="w-4 h-4 mr-2" />Enter Actual Cash
          </Button>

          {/* Expected vs Actual */}
          {currentRecord && (
            <Card>
              <CardHeader className="py-3 pb-2">
                <CardTitle className="text-sm">Expected vs Received</CardTitle>
              </CardHeader>
              <CardContent className="py-3">
                <div className="grid grid-cols-3 text-sm gap-2">
                  <div></div>
                  <div className="text-center font-medium text-muted-foreground">Expected</div>
                  <div className="text-center font-medium text-muted-foreground">Received</div>
                  
                  <div className="font-medium flex items-center gap-1"><Banknote className="w-4 h-4" /> Cash</div>
                  <div className="text-center">₱{(currentRecord.cash_expected || 0).toLocaleString()}</div>
                  <div className={cn("text-center font-medium", (currentRecord.cash_actual || 0) >= (currentRecord.cash_expected || 0) ? "text-green-600" : "text-red-600")}>
                    ₱{(currentRecord.cash_actual || 0).toLocaleString()}
                  </div>
                  
                  <div className="font-medium flex items-center gap-1"><Smartphone className="w-4 h-4" /> GCash</div>
                  <div className="text-center">₱{(currentRecord.gcash_expected || 0).toLocaleString()}</div>
                  <div className={cn("text-center font-medium", (currentRecord.gcash_actual || 0) >= (currentRecord.gcash_expected || 0) ? "text-green-600" : "text-red-600")}>
                    ₱{(currentRecord.gcash_actual || 0).toLocaleString()}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Shift Expenses Summary */}
          <Card>
            <CardHeader className="py-3 pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Shift Expenses</span>
                <Badge variant="secondary">₱{(totalCashExp + totalGcashExp).toLocaleString()}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="py-3 space-y-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-1 text-green-600"><Banknote className="w-4 h-4" /> Cash: ₱{totalCashExp.toLocaleString()}</div>
                <div className="flex items-center gap-1 text-blue-600"><Smartphone className="w-4 h-4" /> GCash: ₱{totalGcashExp.toLocaleString()}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground border-t pt-2">
                <div>From Shift: ₱{(shiftCashExp + shiftGcashExp).toLocaleString()}</div>
                <div>From Balance: ₱{(balanceCashExp + balanceGcashExp).toLocaleString()}</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Expenses Tab */}
        <TabsContent value="expenses" className="space-y-4 mt-4">
          {/* Add Expense Form */}
          <Card>
            <CardHeader className="py-3 pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Plus className="w-4 h-4" /> Add Expense</CardTitle>
            </CardHeader>
            <CardContent className="py-3 space-y-3">
              {/* Expense Type */}
              <div className="flex gap-1">
                <Button 
                  variant={expType === 'shift' ? 'default' : 'outline'} 
                  size="sm" 
                  className={cn("flex-1", expType === 'shift' && "bg-orange-600 hover:bg-orange-700")}
                  onClick={() => setExpType('shift')}
                >
                  From Shift
                </Button>
                <Button 
                  variant={expType === 'balance' ? 'default' : 'outline'} 
                  size="sm" 
                  className={cn("flex-1", expType === 'balance' && "bg-purple-600 hover:bg-purple-700")}
                  onClick={() => setExpType('balance')}
                >
                  From Balance
                </Button>
              </div>

              {/* Payment Source */}
              <div className="flex gap-1">
                <Button 
                  variant={expSource === 'cash' ? 'default' : 'outline'} 
                  size="sm" 
                  className={cn("flex-1", expSource === 'cash' && "bg-green-600 hover:bg-green-700")}
                  onClick={() => setExpSource('cash')}
                >
                  <Banknote className="w-4 h-4 mr-1" />Cash
                </Button>
                <Button 
                  variant={expSource === 'gcash' ? 'default' : 'outline'} 
                  size="sm" 
                  className={cn("flex-1", expSource === 'gcash' && "bg-blue-600 hover:bg-blue-700")}
                  onClick={() => setExpSource('gcash')}
                >
                  <Smartphone className="w-4 h-4 mr-1" />GCash
                </Button>
              </div>

              {/* Category & Amount */}
              <div className="grid grid-cols-2 gap-2">
                <Select value={expCategory} onValueChange={setExpCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input 
                  type="number" 
                  placeholder="Amount" 
                  value={expAmount} 
                  onChange={e => setExpAmount(e.target.value)} 
                />
              </div>

              {/* Date & Shift */}
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" value={expDate} onChange={e => setExpDate(e.target.value)} />
                <Select value={expShift} onValueChange={(v: ShiftType) => setExpShift(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day"><Sun className="w-4 h-4 inline mr-1" />Day</SelectItem>
                    <SelectItem value="night"><Moon className="w-4 h-4 inline mr-1" />Night</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Description */}
              <Input 
                placeholder="Description (optional)" 
                value={expDescription} 
                onChange={e => setExpDescription(e.target.value)} 
              />

              <Button className="w-full" onClick={addExpense}>
                <Plus className="w-4 h-4 mr-2" />Add Expense
              </Button>
            </CardContent>
          </Card>

          {/* Current Shift Expenses List */}
          <Card>
            <CardHeader className="py-3 pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Expenses ({selectedDate} / {selectedShift === 'day' ? 'Day' : 'Night'})</span>
                <Badge variant="secondary">{currentExpenses.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2">
              {currentExpenses.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No expenses</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {currentExpenses.map(exp => (
                    <div key={exp.id} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-sm",
                          exp.payment_source === 'gcash' ? "text-blue-600" : "text-green-600"
                        )}>
                          {exp.payment_source === 'gcash' ? <Smartphone className="w-4 h-4" /> : <Banknote className="w-4 h-4" />}
                        </span>
                        <Badge variant="outline" className="text-[10px]">{exp.expense_type === 'shift' ? 'Shift' : 'Bal'}</Badge>
                        <div>
                          <div className="text-sm font-medium">{getCategoryLabel(exp.category)}</div>
                          {exp.description && <div className="text-xs text-muted-foreground">{exp.description}</div>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">₱{exp.amount.toLocaleString()}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteExpense(exp.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4 mt-4">
          {/* Filters */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex gap-2 items-center">
                <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="flex-1" />
                <span className="text-muted-foreground">to</span>
                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="flex-1" />
              </div>
              
              <div className="grid grid-cols-3 gap-2">
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger><SelectValue placeholder="All Categories" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterSource} onValueChange={setFilterSource}>
                  <SelectTrigger><SelectValue placeholder="All Sources" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="gcash">GCash</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterExpType} onValueChange={setFilterExpType}>
                  <SelectTrigger><SelectValue placeholder="All Types" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="shift">From Shift</SelectItem>
                    <SelectItem value="balance">From Balance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Totals */}
          <div className="grid grid-cols-4 gap-2">
            <Card className="bg-green-500/10 border-green-500/30">
              <CardContent className="p-3 text-center">
                <Banknote className="w-4 h-4 mx-auto text-green-600 mb-1" />
                <div className="text-xs text-muted-foreground">Cash</div>
                <div className="font-bold text-green-600">₱{historyTotalCash.toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card className="bg-blue-500/10 border-blue-500/30">
              <CardContent className="p-3 text-center">
                <Smartphone className="w-4 h-4 mx-auto text-blue-600 mb-1" />
                <div className="text-xs text-muted-foreground">GCash</div>
                <div className="font-bold text-blue-600">₱{historyTotalGcash.toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card className="bg-orange-500/10 border-orange-500/30">
              <CardContent className="p-3 text-center">
                <Receipt className="w-4 h-4 mx-auto text-orange-600 mb-1" />
                <div className="text-xs text-muted-foreground">Shift</div>
                <div className="font-bold text-orange-600">₱{historyShiftTotal.toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card className="bg-purple-500/10 border-purple-500/30">
              <CardContent className="p-3 text-center">
                <Wallet className="w-4 h-4 mx-auto text-purple-600 mb-1" />
                <div className="text-xs text-muted-foreground">Balance</div>
                <div className="font-bold text-purple-600">₱{historyBalanceTotal.toLocaleString()}</div>
              </CardContent>
            </Card>
          </div>

          {/* Export Button */}
          <Button variant="outline" className="w-full" onClick={exportHistory}>
            <Download className="w-4 h-4 mr-2" />Export CSV
          </Button>

          {/* History List */}
          <Card>
            <CardHeader className="py-3 pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Expense History</span>
                <Badge variant="secondary">{historyExpenses.length} items</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2">
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {historyExpenses.slice(0, 100).map(exp => (
                  <div key={exp.id} className="flex items-center justify-between text-xs p-2 bg-muted/20 rounded">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        exp.payment_source === 'gcash' ? "text-blue-600" : "text-green-600"
                      )}>
                        {exp.payment_source === 'gcash' ? <Smartphone className="w-3 h-3" /> : <Banknote className="w-3 h-3" />}
                      </span>
                      <span className="text-muted-foreground">{exp.date}</span>
                      <Badge variant="outline" className="text-[10px] px-1">{exp.shift === 'day' ? 'D' : 'N'}</Badge>
                      <Badge variant={exp.expense_type === 'shift' ? 'default' : 'secondary'} className="text-[10px] px-1">{exp.expense_type === 'shift' ? 'S' : 'B'}</Badge>
                      <span>{getCategoryLabel(exp.category)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">₱{exp.amount.toLocaleString()}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteExpense(exp.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Enter Cash Dialog */}
      <Dialog open={showCashDialog} onOpenChange={setShowCashDialog}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Enter Actual Cash</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground flex items-center gap-1 mb-1">
                <Banknote className="w-4 h-4" /> Cash Received
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
                <Smartphone className="w-4 h-4" /> GCash Received
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
