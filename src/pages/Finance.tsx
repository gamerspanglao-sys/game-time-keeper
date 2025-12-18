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
  RefreshCw, Loader2, Sun, Moon, Plus, Trash2, Banknote, Smartphone, 
  Wallet, History, Download, CircleDollarSign, Minus, ShoppingCart, Receipt,
  ClipboardCheck
} from 'lucide-react';
import { CashVerification } from '@/components/CashVerification';
import { ActivityLogger } from '@/lib/activityLogger';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

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

interface ShiftHandover {
  id: string;
  date: string;
  shift_type: string | null;
  type?: string | null;
  cash_handed_over: number | null;
  gcash_handed_over: number | null;
  employee_id: string;
  change_fund_received?: number | null;
}

interface CashHandover {
  id: string;
  shift_date: string;
  shift_type: string;
  change_fund_amount: number;
  approved: boolean;
}

interface InvestorContribution {
  id: string;
  date: string;
  category: string;
  amount: number;
  description: string | null;
  contribution_type: string;
}




const CATEGORIES = [
  { value: 'purchases', label: 'Purchases' },
  { value: 'salaries', label: 'Salaries' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'employee_food', label: 'Employee Food' },
  { value: 'food_hunters', label: 'Food Hunters' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'other', label: 'Other' }
];

const INVESTOR_CATEGORIES = [
  { value: 'investor_purchases', label: 'Purchases' },
  { value: 'investor_equipment', label: 'Equipment' },
  { value: 'investor_inventory', label: 'Inventory' },
  { value: 'investor_other', label: 'Other' }
];

const getCategoryLabel = (v: string) => 
  CATEGORIES.find(c => c.value === v)?.label || 
  INVESTOR_CATEGORIES.find(c => c.value === v)?.label || 
  v;

const getCurrentShift = (): ShiftType => {
  const now = new Date();
  const manilaTime = new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000);
  return manilaTime.getHours() >= 5 && manilaTime.getHours() < 17 ? 'day' : 'night';
};

const getShiftDate = (): string => {
  const now = new Date();
  const manilaTime = new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000);
  const hours = manilaTime.getHours();
  // Night shift after midnight belongs to previous day
  if (hours < 5) {
    manilaTime.setDate(manilaTime.getDate() - 1);
  }
  return format(manilaTime, 'yyyy-MM-dd');
};

export default function Finance() {
  const [records, setRecords] = useState<CashRecord[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [shifts, setShifts] = useState<ShiftHandover[]>([]);
  const [cashHandovers, setCashHandovers] = useState<CashHandover[]>([]);
  const [investorExpenses, setInvestorExpenses] = useState<InvestorContribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [initialShiftLoaded, setInitialShiftLoaded] = useState(false);
  
  const [selectedDate, setSelectedDate] = useState(getShiftDate());
  const [selectedShift, setSelectedShift] = useState<ShiftType>(getCurrentShift());

  // Load active shifts to determine correct default date/shift
  useEffect(() => {
    const loadActiveShift = async () => {
      const { data } = await supabase
        .from('shifts')
        .select('type, shift_start')
        .in('status', ['open', 'ended'])
        .order('shift_start', { ascending: false })
        .limit(1);
      
      if (data && data.length > 0) {
        const activeShift = data[0];
        setSelectedShift(activeShift.type as ShiftType);
        setSelectedDate(format(new Date(activeShift.shift_start), 'yyyy-MM-dd'));
      }
      setInitialShiftLoaded(true);
    };
    loadActiveShift();
  }, []);
  
  const [showCashDialog, setShowCashDialog] = useState(false);
  const [editCash, setEditCash] = useState('');
  const [editGcash, setEditGcash] = useState('');
  
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [expAmount, setExpAmount] = useState('');
  const [expCategory, setExpCategory] = useState('purchases');
  const [expDescription, setExpDescription] = useState('');
  const [expSource, setExpSource] = useState<PaymentSource>('cash');
  const [expType, setExpType] = useState<ExpenseType>('balance');
  const [isInvestorExpense, setIsInvestorExpense] = useState(false);
  
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [filterExpType, setFilterExpType] = useState<string>('all');


  const currentRecord = records.find(r => r.date === selectedDate && r.shift === selectedShift);
  const currentExpenses = expenses.filter(e => e.date === selectedDate && e.shift === selectedShift);
  const currentInvestorExpenses = investorExpenses.filter(e => e.date === selectedDate);
  
  const currentShifts = shifts.filter(s => {
    if (s.date !== selectedDate) return false;
    const shiftType = s.shift_type?.includes('Night') || s.shift_type === '12 hours' ? 'night' : 'day';
    return shiftType === selectedShift || (!s.shift_type && selectedShift === 'day');
  });
  
  const employeeCashSubmitted = currentShifts.reduce((sum, s) => sum + (s.cash_handed_over || 0), 0);
  const employeeGcashSubmitted = currentShifts.reduce((sum, s) => sum + (s.gcash_handed_over || 0), 0);
  
  const shiftCashExp = currentExpenses.filter(e => e.expense_type === 'shift' && e.payment_source === 'cash').reduce((s, e) => s + e.amount, 0);
  const shiftGcashExp = currentExpenses.filter(e => e.expense_type === 'shift' && e.payment_source === 'gcash').reduce((s, e) => s + e.amount, 0);
  const totalShiftExpenses = shiftCashExp + shiftGcashExp;
  
  // Current shift balance expenses (for display)
  const balanceCashExp = currentExpenses.filter(e => e.expense_type === 'balance' && e.payment_source === 'cash').reduce((s, e) => s + e.amount, 0);
  const balanceGcashExp = currentExpenses.filter(e => e.expense_type === 'balance' && e.payment_source === 'gcash').reduce((s, e) => s + e.amount, 0);
  
  // CUMULATIVE Storage: ALL received cash - ALL balance expenses (persists across shifts)
  const totalCashReceived = records.reduce((sum, r) => sum + (r.cash_actual || 0), 0);
  const totalGcashReceived = records.reduce((sum, r) => sum + (r.gcash_actual || 0), 0);
  const totalBalanceCashExp = expenses.filter(e => e.expense_type === 'balance' && e.payment_source === 'cash').reduce((s, e) => s + e.amount, 0);
  const totalBalanceGcashExp = expenses.filter(e => e.expense_type === 'balance' && e.payment_source === 'gcash').reduce((s, e) => s + e.amount, 0);
  
  const storageCash = totalCashReceived - totalBalanceCashExp;
  const storageGcash = totalGcashReceived - totalBalanceGcashExp;
  
  const cashDiscrepancy = (currentRecord?.cash_actual || 0) - employeeCashSubmitted;
  const gcashDiscrepancy = (currentRecord?.gcash_actual || 0) - employeeGcashSubmitted;
  
  // Get carryover (change fund) from PREVIOUS shift's approved handover
  // Previous shift: if current is day -> previous is night of previous day
  //                 if current is night -> previous is day of same day
  const getPreviousShiftInfo = (date: string, shift: string): { date: string; shift: string } => {
    if (shift === 'day') {
      const prevDate = new Date(date);
      prevDate.setDate(prevDate.getDate() - 1);
      return { date: prevDate.toISOString().split('T')[0], shift: 'night' };
    } else {
      return { date, shift: 'day' };
    }
  };
  
  const prevShiftInfo = getPreviousShiftInfo(selectedDate, selectedShift);
  const previousHandover = cashHandovers.find(h => {
    const handoverShift = h.shift_type?.toLowerCase().includes('night') ? 'night' : 'day';
    return h.shift_date === prevShiftInfo.date && handoverShift === prevShiftInfo.shift;
  });
  
  // First try handover from previous shift, then fallback to current shift's change_fund_received
  let carryoverCash = previousHandover?.change_fund_amount || 0;
  if (carryoverCash === 0) {
    const currentShiftData = shifts.find(s => {
      const shiftType = s.type?.toLowerCase() === 'night' || s.shift_type?.toLowerCase().includes('night') ? 'night' : 'day';
      return s.date === selectedDate && shiftType === selectedShift;
    });
    carryoverCash = currentShiftData?.change_fund_received || 0;
  }
  
  // Current Register = Carryover (from previous shift) + Loyverse Sales - Shift Expenses
  const currentRegisterCash = carryoverCash + (currentRecord?.cash_expected || 0) - shiftCashExp;
  const currentRegisterGcash = (currentRecord?.gcash_expected || 0) - shiftGcashExp;
  const currentRegisterTotal = currentRegisterCash + currentRegisterGcash;

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
      const [{ data: cashData }, { data: expData }, { data: shiftsData }, { data: investorData }, { data: handoversData }] = await Promise.all([
        supabase.from('cash_register').select('id, date, shift, cash_expected, gcash_expected, cash_actual, gcash_actual').order('date', { ascending: false }),
        supabase.from('cash_expenses').select('*').order('created_at', { ascending: false }),
        supabase.from('shifts').select('id, date, shift_type, type, cash_handed_over, gcash_handed_over, employee_id, change_fund_received').order('date', { ascending: false }),
        supabase.from('investor_contributions').select('*').order('created_at', { ascending: false }),
        supabase.from('cash_handovers').select('id, shift_date, shift_type, change_fund_amount, approved').order('shift_date', { ascending: false })
      ]);
      setRecords((cashData || []) as CashRecord[]);
      setExpenses((expData || []) as Expense[]);
      setShifts((shiftsData || []) as ShiftHandover[]);
      setInvestorExpenses((investorData || []) as InvestorContribution[]);
      setCashHandovers((handoversData || []) as CashHandover[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const channel = supabase.channel('finance-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_register' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_expenses' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_handovers' }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    const autoSync = async () => {
      setSyncing(true);
      try {
        await supabase.functions.invoke('loyverse-history-sync', { body: { days: 3 } });
        await loadData();
      } catch (e) {
        console.error('Auto-sync failed:', e);
      } finally {
        setSyncing(false);
      }
    };
    autoSync();
  }, []);


  const syncLoyverse = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('loyverse-history-sync', { body: { days: 7 } });
      if (error) throw error;
      if (data?.success) {
        await loadData();
        toast.success('Synced');
        ActivityLogger.syncLoyverse('success');
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
          cash_actual: cash, gcash_actual: gcash, actual_cash: cash + gcash,
          discrepancy: (cash + gcash) - ((currentRecord.cash_expected || 0) + (currentRecord.gcash_expected || 0))
        }).eq('id', currentRecord.id);
      } else {
        await supabase.from('cash_register').insert({
          date: selectedDate, shift: selectedShift, cash_actual: cash, gcash_actual: gcash, actual_cash: cash + gcash
        });
      }
      toast.success('Saved');
      setShowCashDialog(false);
      loadData();
    } catch (e) {
      toast.error('Save failed');
    }
  };

  const openExpenseDialog = (source: PaymentSource, type: ExpenseType, investor: boolean = false) => {
    setExpSource(source);
    setExpType(type);
    setIsInvestorExpense(investor);
    setExpAmount('');
    setExpCategory(investor ? 'investor_purchases' : 'purchases');
    setExpDescription('');
    setShowExpenseDialog(true);
  };

  const addExpense = async () => {
    const amount = parseInt(expAmount);
    if (!amount || amount <= 0) { toast.error('Enter valid amount'); return; }
    try {
      if (isInvestorExpense) {
        const contributionType = expCategory === 'investor_purchases' ? 'returnable' : 'non-returnable';
        await supabase.from('investor_contributions').insert({
          category: expCategory, amount, description: expDescription || null, date: selectedDate, contribution_type: contributionType
        });
      } else {
        let existingRecord = records.find(r => r.date === selectedDate && r.shift === selectedShift);
        let regId = existingRecord?.id;
        if (!regId) {
          const { data } = await supabase.from('cash_register').insert({ date: selectedDate, shift: selectedShift }).select('id').single();
          regId = data?.id;
        }
        await supabase.from('cash_expenses').insert({
          cash_register_id: regId, category: expCategory, amount, description: expDescription || null,
          shift: selectedShift, date: selectedDate, payment_source: expSource, expense_type: expType,
          approved: true  // Admin-added expenses are auto-approved
        });
      }
      toast.success(isInvestorExpense ? 'Investor expense added' : 'Expense added');
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

  const deleteInvestorExpense = async (id: string) => {
    await supabase.from('investor_contributions').delete().eq('id', id);
    toast.success('Deleted');
    loadData();
  };

  const exportHistory = () => {
    const csv = [
      ['Date', 'Shift', 'Type', 'Category', 'Source', 'Amount', 'Description'].join(','),
      ...historyExpenses.map(e => [e.date, e.shift, e.expense_type === 'shift' ? 'Shift' : 'Balance', getCategoryLabel(e.category), e.payment_source.toUpperCase(), e.amount, `"${e.description || ''}"`].join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `expenses_${dateFrom}_${dateTo}.csv`;
    a.click();
  };

  const uniqueDates = [...new Set(records.map(r => r.date))].slice(0, 14);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-4 space-y-5 max-w-2xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-primary" />
            </div>
            Finance
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Cash & expense management</p>
        </div>
        <Button variant="outline" size="icon" onClick={syncLoyverse} disabled={syncing} className="h-10 w-10 border-border/50">
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </Button>
      </div>

      {/* Date & Shift Selector */}
      <div className="flex gap-3 items-center p-3 bg-secondary/30 rounded-xl border border-border/50">
        <Select value={selectedDate} onValueChange={setSelectedDate}>
          <SelectTrigger className="w-36 h-9 text-sm bg-background border-border/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {uniqueDates.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex bg-background border border-border/50 rounded-lg overflow-hidden">
          <button 
            className={cn(
              "px-4 py-2 text-sm font-medium transition-all flex items-center gap-1.5",
              selectedShift === 'day' 
                ? "bg-amber-500/20 text-amber-500" 
                : "hover:bg-muted text-muted-foreground"
            )} 
            onClick={() => setSelectedShift('day')}
          >
            <Sun className="w-4 h-4" />Day
          </button>
          <button 
            className={cn(
              "px-4 py-2 text-sm font-medium transition-all flex items-center gap-1.5",
              selectedShift === 'night' 
                ? "bg-indigo-500/20 text-indigo-500" 
                : "hover:bg-muted text-muted-foreground"
            )} 
            onClick={() => setSelectedShift('night')}
          >
            <Moon className="w-4 h-4" />Night
          </button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="pending" className="gap-1.5 text-xs">
            <ClipboardCheck className="w-3.5 h-3.5" />
            Pending
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5 text-xs">
            <History className="w-3.5 h-3.5" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4 mt-4">
          <CashVerification />
        </TabsContent>

        <TabsContent value="history" className="space-y-4 mt-4">
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
                  <SelectContent><SelectItem value="all">All</SelectItem>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={filterSource} onValueChange={setFilterSource}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Source" /></SelectTrigger>
                  <SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="cash">Cash</SelectItem><SelectItem value="gcash">GCash</SelectItem></SelectContent>
                </Select>
                <Select value={filterExpType} onValueChange={setFilterExpType}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
                  <SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="shift">Shift</SelectItem><SelectItem value="balance">Balance</SelectItem></SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-2">
            <Card className="border-green-500/20 bg-green-500/5"><CardContent className="p-3 flex items-center gap-3"><Banknote className="w-5 h-5 text-green-500" /><div><p className="text-[10px] text-muted-foreground">Cash</p><p className="font-bold text-green-500">₱{historyTotalCash.toLocaleString()}</p></div></CardContent></Card>
            <Card className="border-blue-500/20 bg-blue-500/5"><CardContent className="p-3 flex items-center gap-3"><Smartphone className="w-5 h-5 text-blue-500" /><div><p className="text-[10px] text-muted-foreground">GCash</p><p className="font-bold text-blue-500">₱{historyTotalGcash.toLocaleString()}</p></div></CardContent></Card>
          </div>

          <Button variant="outline" size="sm" className="w-full" onClick={exportHistory}><Download className="w-4 h-4 mr-2" />Export CSV</Button>

          <Card>
            <CardHeader className="py-3 pb-2"><CardTitle className="text-sm flex items-center justify-between"><span>Expenses</span><Badge variant="secondary" className="text-xs">{historyExpenses.length}</Badge></CardTitle></CardHeader>
            <CardContent className="py-2">
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {historyExpenses.slice(0, 100).map(exp => (
                  <div key={exp.id} className="flex items-center justify-between text-xs p-2 bg-muted/20 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className={cn("w-5 h-5 rounded-full flex items-center justify-center", exp.payment_source === 'gcash' ? "bg-blue-500/20" : "bg-green-500/20")}>
                        {exp.payment_source === 'gcash' ? <Smartphone className="w-2.5 h-2.5 text-blue-500" /> : <Banknote className="w-2.5 h-2.5 text-green-500" />}
                      </span>
                      <span className="text-muted-foreground">{exp.date}</span>
                      <Badge variant="outline" className="text-[9px] px-1 h-4">{exp.shift === 'day' ? '☀' : '🌙'}</Badge>
                      <span>{getCategoryLabel(exp.category)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-semibold">₱{exp.amount.toLocaleString()}</span>
                      <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive/70" onClick={() => deleteExpense(exp.id)}><Trash2 className="w-2.5 h-2.5" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      <Dialog open={showExpenseDialog} onOpenChange={setShowExpenseDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isInvestorExpense ? <Wallet className="w-5 h-5 text-purple-500" /> : expSource === 'cash' ? <Banknote className="w-5 h-5 text-green-500" /> : <Smartphone className="w-5 h-5 text-blue-500" />}
              {isInvestorExpense ? 'Investor Expense' : `${expType === 'balance' ? 'Spend from ' : 'Shift Expense: '}${expSource === 'cash' ? 'Cash' : 'GCash'}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div><label className="text-sm text-muted-foreground mb-1 block">Amount</label><Input type="number" placeholder="0" value={expAmount} onChange={e => setExpAmount(e.target.value)} className="text-lg" autoFocus /></div>
            <div><label className="text-sm text-muted-foreground mb-1 block">Category</label>
              <Select value={expCategory} onValueChange={setExpCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(isInvestorExpense ? INVESTOR_CATEGORIES : CATEGORIES).map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><label className="text-sm text-muted-foreground mb-1 block">Description (optional)</label><Input placeholder="What was it for?" value={expDescription} onChange={e => setExpDescription(e.target.value)} /></div>
            <Button className="w-full" onClick={addExpense}><Plus className="w-4 h-4 mr-2" />Add Expense</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCashDialog} onOpenChange={setShowCashDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Update Received Amounts</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><label className="text-sm text-muted-foreground flex items-center gap-1 mb-1"><Banknote className="w-4 h-4 text-green-500" /> Cash Received</label><Input type="number" value={editCash} onChange={e => setEditCash(e.target.value)} placeholder="0" /></div>
            <div><label className="text-sm text-muted-foreground flex items-center gap-1 mb-1"><Smartphone className="w-4 h-4 text-blue-500" /> GCash Received</label><Input type="number" value={editGcash} onChange={e => setEditGcash(e.target.value)} placeholder="0" /></div>
            <Button className="w-full" onClick={saveCash}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
