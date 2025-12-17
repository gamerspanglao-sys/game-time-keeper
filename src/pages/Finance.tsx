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
  Wallet, History, Download, CircleDollarSign, ArrowDownCircle, Package, Send, X
} from 'lucide-react';
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
  cash_handed_over: number | null;
  gcash_handed_over: number | null;
  employee_id: string;
}

interface InvestorContribution {
  id: string;
  date: string;
  category: string;
  amount: number;
  description: string | null;
  contribution_type: string;
}

interface SalesItem {
  name: string;
  totalQuantity: number;
  avgPerDay: number;
  recommendedQty: number;
  inStock: number;
  toOrder: number;
  caseSize: number;
  casesToOrder: number;
  category: string;
  supplier: string;
  note?: string;
}

interface PurchaseData {
  recommendations: SalesItem[];
  analysisDays: number;
  bufferDays: number;
  analysisPeriod: { start: string; end: string };
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
  if (hours >= 17) manilaTime.setDate(manilaTime.getDate() + 1);
  return format(manilaTime, 'yyyy-MM-dd');
};

export default function Finance() {
  const [records, setRecords] = useState<CashRecord[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [shifts, setShifts] = useState<ShiftHandover[]>([]);
  const [investorExpenses, setInvestorExpenses] = useState<InvestorContribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pinInput, setPinInput] = useState('');
  
  const [selectedDate, setSelectedDate] = useState(getShiftDate());
  const [selectedShift, setSelectedShift] = useState<ShiftType>(getCurrentShift());
  
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

  // Purchase Order state
  const [purchaseData, setPurchaseData] = useState<PurchaseData | null>(null);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [showOnlyToOrder, setShowOnlyToOrder] = useState(true);
  const [excludedItems, setExcludedItems] = useState<Set<string>>(new Set());
  const [sendingTelegram, setSendingTelegram] = useState(false);

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
  
  const balanceCashExp = currentExpenses.filter(e => e.expense_type === 'balance' && e.payment_source === 'cash').reduce((s, e) => s + e.amount, 0);
  const balanceGcashExp = currentExpenses.filter(e => e.expense_type === 'balance' && e.payment_source === 'gcash').reduce((s, e) => s + e.amount, 0);
  
  const storageCash = (currentRecord?.cash_actual || 0) - balanceCashExp;
  const storageGcash = (currentRecord?.gcash_actual || 0) - balanceGcashExp;
  
  const cashDiscrepancy = (currentRecord?.cash_actual || 0) - employeeCashSubmitted;
  const gcashDiscrepancy = (currentRecord?.gcash_actual || 0) - employeeGcashSubmitted;
  
  const currentRegisterCash = (currentRecord?.cash_expected || 0) - shiftCashExp;
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
      const [{ data: cashData }, { data: expData }, { data: shiftsData }, { data: investorData }] = await Promise.all([
        supabase.from('cash_register').select('id, date, shift, cash_expected, gcash_expected, cash_actual, gcash_actual').order('date', { ascending: false }),
        supabase.from('cash_expenses').select('*').order('created_at', { ascending: false }),
        supabase.from('shifts').select('id, date, shift_type, cash_handed_over, gcash_handed_over, employee_id').order('date', { ascending: false }),
        supabase.from('investor_contributions').select('*').order('created_at', { ascending: false })
      ]);
      setRecords((cashData || []) as CashRecord[]);
      setExpenses((expData || []) as Expense[]);
      setShifts((shiftsData || []) as ShiftHandover[]);
      setInvestorExpenses((investorData || []) as InvestorContribution[]);
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
          shift: selectedShift, date: selectedDate, payment_source: expSource, expense_type: expType
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

  // Purchase Order functions
  const generatePurchaseOrder = async () => {
    setPurchaseLoading(true);
    setExcludedItems(new Set());
    try {
      const { data, error } = await supabase.functions.invoke('loyverse-purchase-request');
      if (error) throw error;
      setPurchaseData(data);
      toast.success('Purchase order generated');
    } catch (e) {
      console.error(e);
      toast.error('Failed to generate order');
    } finally {
      setPurchaseLoading(false);
    }
  };

  const sendPurchaseToTelegram = async () => {
    setSendingTelegram(true);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-notify', {
        body: { action: 'purchase' }
      });
      if (error) throw error;
      toast.success('Purchase order sent to Telegram');
    } catch (e) {
      console.error(e);
      toast.error('Failed to send to Telegram');
    } finally {
      setSendingTelegram(false);
    }
  };

  const getFilteredPurchaseItems = () => {
    if (!purchaseData?.recommendations) return [];
    let items = purchaseData.recommendations.filter(item => !excludedItems.has(item.name));
    if (showOnlyToOrder) {
      items = items.filter(item => item.toOrder > 0);
    }
    return items;
  };

  const groupedPurchaseItems = () => {
    const items = getFilteredPurchaseItems();
    const groups: Record<string, SalesItem[]> = {};
    items.forEach(item => {
      const supplier = item.supplier || 'Others';
      if (!groups[supplier]) groups[supplier] = [];
      groups[supplier].push(item);
    });
    return groups;
  };

  const exportPurchaseCSV = () => {
    const items = getFilteredPurchaseItems();
    const csv = [
      ['Supplier', 'Item', 'In Stock', 'Avg/Day', 'Recommended', 'To Order', 'Cases', 'Case Size'].join(','),
      ...items.map(item => [
        `"${item.supplier || 'Others'}"`,
        `"${item.name}"`,
        item.inStock,
        item.avgPerDay.toFixed(1),
        item.recommendedQty,
        item.toOrder,
        item.casesToOrder,
        item.caseSize
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `purchase_order_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  const supplierStyles: Record<string, { emoji: string; color: string; bg: string }> = {
    'San Miguel': { emoji: '🍺', color: 'text-amber-500', bg: 'bg-amber-500/10' },
    'Tanduay': { emoji: '🥃', color: 'text-orange-500', bg: 'bg-orange-500/10' },
    'Soft Drinks': { emoji: '🥤', color: 'text-blue-500', bg: 'bg-blue-500/10' },
    'Snacks': { emoji: '🍿', color: 'text-purple-500', bg: 'bg-purple-500/10' },
    'Others': { emoji: '📦', color: 'text-muted-foreground', bg: 'bg-muted/30' }
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

  if (!isAdmin) {
    return (
      <div className="p-4 max-w-md mx-auto">
        <Card className="mt-10 border-border/50">
          <CardContent className="py-10 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto">
              <Lock className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-bold">Finance</h2>
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
      <Tabs defaultValue="balance" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="balance" className="flex-1 gap-2">
            <Wallet className="w-4 h-4" />
            Balance
          </TabsTrigger>
          <TabsTrigger value="orders" className="flex-1 gap-2">
            <Package className="w-4 h-4" />
            Orders
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1 gap-2">
            <History className="w-4 h-4" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="balance" className="space-y-4 mt-4">
          <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-2">
              {selectedShift === 'day' ? <Sun className="w-4 h-4 text-muted-foreground" /> : <Moon className="w-4 h-4 text-muted-foreground" />}
              <span className="text-sm text-muted-foreground">{selectedDate} • {selectedShift === 'day' ? 'Day' : 'Night'}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" className="text-purple-500 hover:bg-purple-500/10" onClick={() => openExpenseDialog('cash', 'balance', true)}>
                <Wallet className="w-4 h-4" /><span className="text-xs">Investor</span>
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditCash((currentRecord?.cash_actual || 0).toString()); setEditGcash((currentRecord?.gcash_actual || 0).toString()); setShowCashDialog(true); }}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Card className="border-green-500/20 bg-green-500/5">
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2"><Banknote className="w-4 h-4 text-green-500" /><span className="text-xs text-muted-foreground">Storage</span></div>
                  <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-green-500/20" onClick={() => openExpenseDialog('cash', 'balance')}><ArrowDownCircle className="w-4 h-4 text-green-500" /></Button>
                </div>
                <p className="text-xl font-bold text-green-500">₱{storageCash.toLocaleString()}</p>
                <div className="text-[10px] text-muted-foreground space-y-0.5 mt-1">
                  <div className="flex justify-between"><span>Staff:</span><span>₱{employeeCashSubmitted.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span>Received:</span><span>₱{(currentRecord?.cash_actual || 0).toLocaleString()}</span></div>
                  {cashDiscrepancy !== 0 && <div className={cn("flex justify-between font-medium", cashDiscrepancy > 0 ? "text-green-600" : "text-red-500")}><span>Diff:</span><span>{cashDiscrepancy > 0 ? '+' : ''}₱{cashDiscrepancy.toLocaleString()}</span></div>}
                  {balanceCashExp > 0 && <div className="flex justify-between text-orange-500"><span>Expenses:</span><span>-₱{balanceCashExp.toLocaleString()}</span></div>}
                </div>
              </CardContent>
            </Card>

            <Card className="border-blue-500/20 bg-blue-500/5">
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2"><Smartphone className="w-4 h-4 text-blue-500" /><span className="text-xs text-muted-foreground">GCash</span></div>
                  <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-blue-500/20" onClick={() => openExpenseDialog('gcash', 'balance')}><ArrowDownCircle className="w-4 h-4 text-blue-500" /></Button>
                </div>
                <p className="text-xl font-bold text-blue-500">₱{storageGcash.toLocaleString()}</p>
                <div className="text-[10px] text-muted-foreground space-y-0.5 mt-1">
                  <div className="flex justify-between"><span>Staff:</span><span>₱{employeeGcashSubmitted.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span>Received:</span><span>₱{(currentRecord?.gcash_actual || 0).toLocaleString()}</span></div>
                  {gcashDiscrepancy !== 0 && <div className={cn("flex justify-between font-medium", gcashDiscrepancy > 0 ? "text-green-600" : "text-red-500")}><span>Diff:</span><span>{gcashDiscrepancy > 0 ? '+' : ''}₱{gcashDiscrepancy.toLocaleString()}</span></div>}
                  {balanceGcashExp > 0 && <div className="flex justify-between text-orange-500"><span>Expenses:</span><span>-₱{balanceGcashExp.toLocaleString()}</span></div>}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-primary/20">
            <CardHeader className="py-3 pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><CircleDollarSign className="w-4 h-4 text-primary" />Current Register<Badge variant="secondary" className="ml-auto">₱{currentRegisterTotal.toLocaleString()}</Badge></CardTitle>
            </CardHeader>
            <CardContent className="py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-green-500/10">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2"><Banknote className="w-3 h-3 text-green-500" /><span className="text-xs text-muted-foreground">Cash</span></div>
                    <Button size="icon" variant="ghost" className="h-5 w-5 hover:bg-green-500/20" onClick={() => openExpenseDialog('cash', 'shift')}><ArrowDownCircle className="w-3.5 h-3.5 text-green-500" /></Button>
                  </div>
                  <p className="text-lg font-bold text-green-500">₱{currentRegisterCash.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">₱{(currentRecord?.cash_expected || 0).toLocaleString()} - ₱{shiftCashExp.toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-lg bg-blue-500/10">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2"><Smartphone className="w-3 h-3 text-blue-500" /><span className="text-xs text-muted-foreground">GCash</span></div>
                    <Button size="icon" variant="ghost" className="h-5 w-5 hover:bg-blue-500/20" onClick={() => openExpenseDialog('gcash', 'shift')}><ArrowDownCircle className="w-3.5 h-3.5 text-blue-500" /></Button>
                  </div>
                  <p className="text-lg font-bold text-blue-500">₱{currentRegisterGcash.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">₱{(currentRecord?.gcash_expected || 0).toLocaleString()} - ₱{shiftGcashExp.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 pb-2"><CardTitle className="text-sm flex items-center justify-between"><span>Shift Expenses</span><Badge variant="secondary">₱{totalShiftExpenses.toLocaleString()}</Badge></CardTitle></CardHeader>
            <CardContent className="py-2">
              {currentExpenses.length > 0 ? (
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {currentExpenses.map(exp => (
                    <div key={exp.id} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className={cn("w-6 h-6 rounded-full flex items-center justify-center", exp.expense_type === 'shift' ? "bg-primary/20" : exp.payment_source === 'gcash' ? "bg-blue-500/20" : "bg-green-500/20")}>
                          {exp.expense_type === 'shift' ? <CircleDollarSign className="w-3 h-3 text-primary" /> : exp.payment_source === 'gcash' ? <Smartphone className="w-3 h-3 text-blue-500" /> : <Banknote className="w-3 h-3 text-green-500" />}
                        </span>
                        <div>
                          <div className="text-sm font-medium">{getCategoryLabel(exp.category)}</div>
                          {exp.description && <div className="text-[10px] text-muted-foreground">{exp.description}</div>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge variant={exp.payment_source === 'gcash' ? 'outline' : 'secondary'} className="text-[10px] px-1.5">{exp.payment_source === 'gcash' ? 'GC' : '₱'}</Badge>
                        <span className="font-semibold text-sm">₱{exp.amount.toLocaleString()}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive/70 hover:text-destructive" onClick={() => deleteExpense(exp.id)}><Trash2 className="w-3 h-3" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-muted-foreground text-center py-4">No expenses this shift</p>}
            </CardContent>
          </Card>

          {currentInvestorExpenses.length > 0 && (
            <Card className="border-purple-500/20">
              <CardHeader className="py-2 pb-1">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2 text-purple-500"><Wallet className="w-4 h-4" />Investor</span>
                  <Badge variant="secondary" className="bg-purple-500/20 text-purple-500">₱{currentInvestorExpenses.reduce((s, e) => s + e.amount, 0).toLocaleString()}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <div className="space-y-1">
                  {currentInvestorExpenses.map(exp => (
                    <div key={exp.id} className="flex items-center justify-between text-xs p-1.5 bg-purple-500/5 rounded">
                      <div className="flex-1"><span className="text-muted-foreground">{getCategoryLabel(exp.category)}</span>{exp.description && <span className="text-muted-foreground/60 ml-1">• {exp.description}</span>}</div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-purple-500">₱{exp.amount.toLocaleString()}</span>
                        <Button size="icon" variant="ghost" className="h-5 w-5 hover:bg-destructive/20" onClick={() => deleteInvestorExpense(exp.id)}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
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

        <TabsContent value="orders" className="space-y-4 mt-4">
          {/* Generate Button & Controls */}
          <div className="flex items-center justify-between gap-3">
            <Button 
              onClick={generatePurchaseOrder} 
              disabled={purchaseLoading}
              className="flex-1"
            >
              {purchaseLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Generate Order
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">To order only</span>
              <Switch checked={showOnlyToOrder} onCheckedChange={setShowOnlyToOrder} />
            </div>
          </div>

          {/* Analysis Info */}
          {purchaseData && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-3">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-primary" />
                    <span className="text-muted-foreground">Analysis: {purchaseData.analysisDays} days + {purchaseData.bufferDays} days buffer</span>
                  </div>
                  <Badge variant="secondary">{getFilteredPurchaseItems().length} items</Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Purchase Items by Supplier */}
          {purchaseData ? (
            <div className="space-y-4">
              {Object.entries(groupedPurchaseItems()).map(([supplier, items]) => {
                const style = supplierStyles[supplier] || supplierStyles['Others'];
                return (
                  <Card key={supplier} className={cn("border-border/50", style.bg)}>
                    <CardHeader className="py-2 pb-1">
                      <CardTitle className={cn("text-sm flex items-center gap-2", style.color)}>
                        <span>{style.emoji}</span>
                        {supplier}
                        <Badge variant="secondary" className="ml-auto">{items.length}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="py-2">
                      <div className="space-y-1.5">
                        {items.map(item => (
                          <div key={item.name} className="flex items-center justify-between p-2 bg-background/50 rounded-lg">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{item.name}</p>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                <span>Stock: {item.inStock}</span>
                                <span>•</span>
                                <span>Avg: {item.avgPerDay.toFixed(1)}/day</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {item.toOrder > 0 ? (
                                <div className="text-right">
                                  <p className={cn("text-sm font-bold", style.color)}>+{item.toOrder}</p>
                                  {item.casesToOrder > 0 && (
                                    <p className="text-[10px] text-muted-foreground">{item.casesToOrder} cases × {item.caseSize}</p>
                                  )}
                                </div>
                              ) : (
                                <Badge variant="outline" className="text-[10px] text-green-500 border-green-500/30">OK</Badge>
                              )}
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setExcludedItems(prev => new Set([...prev, item.name]))}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {/* Action Buttons */}
              {getFilteredPurchaseItems().length > 0 && (
                <div className="flex gap-2">
                  <Button 
                    variant="default"
                    className="flex-1"
                    onClick={sendPurchaseToTelegram}
                    disabled={sendingTelegram}
                  >
                    {sendingTelegram ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                    Send to Telegram
                  </Button>
                  <Button variant="outline" onClick={exportPurchaseCSV}>
                    <Download className="w-4 h-4 mr-2" />
                    CSV
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <Card className="border-dashed border-2">
              <CardContent className="py-12 text-center">
                <Package className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">Click "Generate Order" to analyze inventory</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Uses 3-day sales average + 2-day delivery buffer</p>
              </CardContent>
            </Card>
          )}
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
