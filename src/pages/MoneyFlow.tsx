import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
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
  Loader2, Sun, Moon, Plus, Trash2, Banknote, Smartphone, 
  Wallet, Minus, ShoppingCart, Receipt, TrendingUp, CircleDollarSign, Clock,
  ChevronLeft, ChevronRight
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
  expense_type: string;
}

interface CashHandover {
  id: string;
  shift_date: string;
  shift_type: string;
  change_fund_amount: number;
  gcash_amount?: number;
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

// Fallback functions for when no open shift is found
const getFallbackShift = (): ShiftType => {
  const now = new Date();
  const manilaTime = new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000);
  return manilaTime.getHours() >= 5 && manilaTime.getHours() < 17 ? 'day' : 'night';
};

const getFallbackDate = (): string => {
  const now = new Date();
  const manilaTime = new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000);
  const hours = manilaTime.getHours();
  if (hours < 5) {
    manilaTime.setDate(manilaTime.getDate() - 1);
  }
  return format(manilaTime, 'yyyy-MM-dd');
};

export default function MoneyFlow() {
  const [records, setRecords] = useState<CashRecord[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [cashHandovers, setCashHandovers] = useState<CashHandover[]>([]);
  const [investorExpenses, setInvestorExpenses] = useState<InvestorContribution[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedShift, setSelectedShift] = useState<ShiftType>('day');
  
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [expAmount, setExpAmount] = useState('');
  const [expCategory, setExpCategory] = useState('purchases');
  const [expDescription, setExpDescription] = useState('');
  const [expSource, setExpSource] = useState<PaymentSource>('cash');
  const [expType, setExpType] = useState<ExpenseType>('balance');
  const [isInvestorExpense, setIsInvestorExpense] = useState(false);
  // Current shift data
  const currentRecord = records.find(r => r.date === selectedDate && r.shift === selectedShift);
  const currentExpenses = expenses.filter(e => e.date === selectedDate && e.shift === selectedShift);
  const currentShiftExpenses = currentExpenses.filter(e => e.expense_type === 'shift');
  
  // Shift expenses
  const shiftCashExp = currentShiftExpenses.filter(e => e.payment_source === 'cash').reduce((s, e) => s + e.amount, 0);
  const shiftGcashExp = currentShiftExpenses.filter(e => e.payment_source === 'gcash').reduce((s, e) => s + e.amount, 0);
  const totalShiftExpenses = shiftCashExp + shiftGcashExp;
  
  // Get carryover from previous shift handover
  // Handover record: shift_date + shift_type = the shift that HANDED OVER the money
  // Night shift receives from day shift of SAME date (day shift hands over to night)
  // Day shift receives from night shift of SAME date (night shift hands over to day)
  const previousHandover = cashHandovers.find(h => {
    const handoverShift = h.shift_type?.toLowerCase().includes('night') ? 'night' : 'day';
    if (selectedShift === 'night') {
      // Night receives from day of same date
      return h.shift_date === selectedDate && handoverShift === 'day';
    } else {
      // Day receives from night of same date
      return h.shift_date === selectedDate && handoverShift === 'night';
    }
  });
  const carryoverCash = previousHandover?.change_fund_amount || 0;
  
  // Current Register = Carryover + Loyverse Sales - Shift Expenses
  // Cash includes carryover (change fund), GCash is only current shift sales
  const currentRegisterCash = carryoverCash + (currentRecord?.cash_expected || 0) - shiftCashExp;
  const currentRegisterGcash = (currentRecord?.gcash_expected || 0) - shiftGcashExp;
  const currentRegisterTotal = currentRegisterCash + currentRegisterGcash;
  
  // CUMULATIVE Storage: ALL received cash - ALL balance expenses
  const totalCashReceived = records.reduce((sum, r) => sum + (r.cash_actual || 0), 0);
  const totalGcashReceived = records.reduce((sum, r) => sum + (r.gcash_actual || 0), 0);
  const totalBalanceCashExp = expenses.filter(e => e.expense_type === 'balance' && e.payment_source === 'cash').reduce((s, e) => s + e.amount, 0);
  const totalBalanceGcashExp = expenses.filter(e => e.expense_type === 'balance' && e.payment_source === 'gcash').reduce((s, e) => s + e.amount, 0);
  
  const storageCash = totalCashReceived - totalBalanceCashExp;
  const storageGcash = totalGcashReceived - totalBalanceGcashExp;
  const totalStorage = storageCash + storageGcash;

  const loadData = async () => {
    try {
      const [{ data: cashData }, { data: expData }, { data: investorData }, { data: handoversData }, { data: openShift }] = await Promise.all([
        supabase.from('cash_register').select('id, date, shift, cash_expected, gcash_expected, cash_actual, gcash_actual').order('date', { ascending: false }),
        supabase.from('cash_expenses').select('*').order('created_at', { ascending: false }),
        supabase.from('investor_contributions').select('*').order('created_at', { ascending: false }),
        supabase.from('cash_handovers').select('id, shift_date, shift_type, change_fund_amount, gcash_amount').order('shift_date', { ascending: false }),
        supabase.from('shifts').select('date, type').eq('status', 'open').order('shift_start', { ascending: false }).limit(1).maybeSingle()
      ]);
      setRecords((cashData || []) as CashRecord[]);
      setExpenses((expData || []) as Expense[]);
      setInvestorExpenses((investorData || []) as InvestorContribution[]);
      setCashHandovers((handoversData || []) as CashHandover[]);
      
      // Set initial date/shift from open shift or fallback
      if (!selectedDate) {
        if (openShift) {
          setSelectedDate(openShift.date);
          setSelectedShift(openShift.type as ShiftType);
        } else {
          setSelectedDate(getFallbackDate());
          setSelectedShift(getFallbackShift());
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const channel = supabase.channel('moneyflow')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_register' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_expenses' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_handovers' }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const openExpenseDialog = (source: PaymentSource, type: ExpenseType = 'balance', investor: boolean = false) => {
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
          approved: true
        });
      }
      toast.success('Added');
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

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            Money Flow
          </h1>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="shift" className="w-full">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="shift" className="gap-1.5">
            <Clock className="w-4 h-4" />
            Текущая смена
          </TabsTrigger>
          <TabsTrigger value="storage" className="gap-1.5">
            <Wallet className="w-4 h-4" />
            Хранилище
          </TabsTrigger>
        </TabsList>

        {/* Current Shift Tab */}
        <TabsContent value="shift" className="space-y-4 mt-4">
          {/* Shift selector */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border">
            <div className="flex items-center gap-3">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => {
                  const d = new Date(selectedDate);
                  d.setDate(d.getDate() - 1);
                  setSelectedDate(format(d, 'yyyy-MM-dd'));
                }}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-2">
                {selectedShift === 'day' ? (
                  <Sun className="w-5 h-5 text-amber-500" />
                ) : (
                  <Moon className="w-5 h-5 text-indigo-500" />
                )}
                <div>
                  <p className="font-medium">{selectedDate}</p>
                  <p className="text-xs text-muted-foreground">{selectedShift === 'day' ? 'Дневная смена' : 'Ночная смена'}</p>
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => {
                  const d = new Date(selectedDate);
                  d.setDate(d.getDate() + 1);
                  setSelectedDate(format(d, 'yyyy-MM-dd'));
                }}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={selectedShift === 'day' ? 'default' : 'outline'}
                className="h-8"
                onClick={() => setSelectedShift('day')}
              >
                <Sun className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant={selectedShift === 'night' ? 'default' : 'outline'}
                className="h-8"
                onClick={() => setSelectedShift('night')}
              >
                <Moon className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Current Register */}
          <Card className="border-primary/30 overflow-hidden">
            <CardHeader className="py-3 bg-primary/5">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-primary" />
                  Касса смены
                </span>
                <Badge className="text-lg font-bold">₱{currentRegisterTotal.toLocaleString()}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {/* Cash & GCash cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Banknote className="w-4 h-4 text-green-500" />
                      <span className="text-sm font-medium">Cash</span>
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-green-500">₱{currentRegisterCash.toLocaleString()}</p>
                  <div className="text-[10px] text-muted-foreground mt-2 space-y-0.5">
                    <div className="flex justify-between">
                      <span>Размен:</span>
                      <span className="text-amber-500">₱{carryoverCash.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Продажи:</span>
                      <span className="text-green-500">+₱{(currentRecord?.cash_expected || 0).toLocaleString()}</span>
                    </div>
                    {shiftCashExp > 0 && (
                      <div className="flex justify-between">
                        <span>Расходы:</span>
                        <span className="text-red-500">-₱{shiftCashExp.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="w-full mt-2 h-7 text-xs hover:bg-green-500/20 text-green-600"
                    onClick={() => openExpenseDialog('cash', 'shift')}
                  >
                    <Minus className="w-3 h-3 mr-1" />Расход
                  </Button>
                </div>

                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-blue-500" />
                      <span className="text-sm font-medium">GCash</span>
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-blue-500">₱{currentRegisterGcash.toLocaleString()}</p>
                  <div className="text-[10px] text-muted-foreground mt-2 space-y-0.5">
                    <div className="flex justify-between">
                      <span>Продажи:</span>
                      <span className="text-blue-500">+₱{(currentRecord?.gcash_expected || 0).toLocaleString()}</span>
                    </div>
                    {shiftGcashExp > 0 && (
                      <div className="flex justify-between">
                        <span>Расходы:</span>
                        <span className="text-red-500">-₱{shiftGcashExp.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="w-full mt-2 h-7 text-xs hover:bg-blue-500/20 text-blue-600"
                    onClick={() => openExpenseDialog('gcash', 'shift')}
                  >
                    <Minus className="w-3 h-3 mr-1" />Расход
                  </Button>
                </div>
              </div>

              {/* Shift Expenses List */}
              {currentShiftExpenses.length > 0 && (
                <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium flex items-center gap-2">
                      <ShoppingCart className="w-4 h-4 text-amber-500" />
                      Расходы смены
                    </span>
                    <Badge className="bg-amber-500/20 text-amber-600 border-0">
                      -₱{totalShiftExpenses.toLocaleString()}
                    </Badge>
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {currentShiftExpenses.map(exp => (
                      <div key={exp.id} className="flex items-center gap-2 text-sm p-2 bg-background/60 rounded-lg group">
                        <div className={cn(
                          "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                          exp.payment_source === 'gcash' ? "bg-blue-500/15" : "bg-green-500/15"
                        )}>
                          {exp.payment_source === 'gcash' 
                            ? <Smartphone className="w-3.5 h-3.5 text-blue-500" /> 
                            : <Banknote className="w-3.5 h-3.5 text-green-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{getCategoryLabel(exp.category)}</span>
                          {exp.description && <span className="text-muted-foreground text-xs ml-1">• {exp.description}</span>}
                        </div>
                        <span className="font-bold text-red-500">-₱{exp.amount.toLocaleString()}</span>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 text-red-500"
                          onClick={() => deleteExpense(exp.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Storage Tab */}
        <TabsContent value="storage" className="space-y-4 mt-4">
          {/* Total Storage */}
          <div className="text-center p-4 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
            <p className="text-sm text-muted-foreground mb-1">Общий баланс</p>
            <p className="text-3xl font-bold text-primary">₱{totalStorage.toLocaleString()}</p>
          </div>

          {/* Storage Balances */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="border-green-500/30 bg-gradient-to-br from-green-500/10 to-green-500/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Banknote className="w-5 h-5 text-green-500" />
                  <span className="font-medium">Cash</span>
                </div>
                <p className="text-2xl font-bold text-green-500 mb-2">₱{storageCash.toLocaleString()}</p>
                <div className="text-[10px] text-muted-foreground space-y-1">
                  <div className="flex justify-between"><span>Получено:</span><span className="text-green-500">+₱{totalCashReceived.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span>Потрачено:</span><span className="text-orange-500">-₱{totalBalanceCashExp.toLocaleString()}</span></div>
                </div>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="w-full mt-3 h-8 text-xs border-green-500/30 hover:bg-green-500/10 text-green-600"
                  onClick={() => openExpenseDialog('cash', 'balance')}
                >
                  <Minus className="w-3 h-3 mr-1" />Списать
                </Button>
              </CardContent>
            </Card>

            <Card className="border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-blue-500/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Smartphone className="w-5 h-5 text-blue-500" />
                  <span className="font-medium">GCash</span>
                </div>
                <p className="text-2xl font-bold text-blue-500 mb-2">₱{storageGcash.toLocaleString()}</p>
                <div className="text-[10px] text-muted-foreground space-y-1">
                  <div className="flex justify-between"><span>Получено:</span><span className="text-blue-500">+₱{totalGcashReceived.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span>Потрачено:</span><span className="text-orange-500">-₱{totalBalanceGcashExp.toLocaleString()}</span></div>
                </div>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="w-full mt-3 h-8 text-xs border-blue-500/30 hover:bg-blue-500/10 text-blue-600"
                  onClick={() => openExpenseDialog('gcash', 'balance')}
                >
                  <Minus className="w-3 h-3 mr-1" />Списать
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Investor Button */}
          <Button 
            variant="outline" 
            className="w-full border-purple-500/30 text-purple-500 hover:bg-purple-500/10"
            onClick={() => openExpenseDialog('cash', 'balance', true)}
          >
            <Wallet className="w-4 h-4 mr-2" />
            Расход инвестора
          </Button>

          {/* Storage Expenses History */}
          {expenses.filter(e => e.expense_type === 'balance').length > 0 && (
            <Card className="border-orange-500/20">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-orange-500" />
                    Расходы
                  </span>
                  <Badge className="bg-orange-500/20 text-orange-500 border-0">
                    -₱{(totalBalanceCashExp + totalBalanceGcashExp).toLocaleString()}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 py-2">
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {expenses
                    .filter(e => e.expense_type === 'balance')
                    .slice(0, 15)
                    .map(exp => (
                      <div key={exp.id} className="flex items-center gap-2 text-sm p-2 bg-background/60 rounded-lg group">
                        <div className={cn(
                          "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                          exp.payment_source === 'gcash' ? "bg-blue-500/15" : "bg-green-500/15"
                        )}>
                          {exp.payment_source === 'gcash' 
                            ? <Smartphone className="w-3.5 h-3.5 text-blue-500" /> 
                            : <Banknote className="w-3.5 h-3.5 text-green-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{getCategoryLabel(exp.category)}</div>
                          <div className="text-[10px] text-muted-foreground">{exp.date}</div>
                        </div>
                        <span className="font-bold text-orange-500">-₱{exp.amount.toLocaleString()}</span>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 text-red-500"
                          onClick={() => deleteExpense(exp.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Investor Expenses */}
          {investorExpenses.length > 0 && (
            <Card className="border-purple-500/20">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2 text-purple-500">
                    <Wallet className="w-4 h-4" />
                    Расходы инвестора
                  </span>
                  <Badge className="bg-purple-500/20 text-purple-500 border-0">
                    ₱{investorExpenses.reduce((s, e) => s + e.amount, 0).toLocaleString()}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 py-2">
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {investorExpenses.slice(0, 10).map(exp => (
                    <div key={exp.id} className="flex items-center justify-between text-sm p-2 bg-purple-500/5 rounded-lg group">
                      <div>
                        <span className="font-medium">{getCategoryLabel(exp.category)}</span>
                        <div className="text-[10px] text-muted-foreground">{exp.date}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-purple-500">₱{exp.amount.toLocaleString()}</span>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-6 w-6 opacity-0 group-hover:opacity-100" 
                          onClick={() => deleteInvestorExpense(exp.id)}
                        >
                          <Trash2 className="w-3 h-3 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
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
              {isInvestorExpense ? (
                <><Wallet className="w-5 h-5 text-purple-500" />Расход инвестора</>
              ) : expType === 'shift' ? (
                <><Receipt className="w-5 h-5 text-amber-500" />Расход смены</>
              ) : (
                <><CircleDollarSign className="w-5 h-5 text-primary" />Расход из хранилища</>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              type="number"
              placeholder="Сумма"
              value={expAmount}
              onChange={e => setExpAmount(e.target.value)}
              className="text-lg"
              autoFocus
            />
            <Select value={expCategory} onValueChange={setExpCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(isInvestorExpense ? INVESTOR_CATEGORIES : CATEGORIES).map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Описание (опционально)"
              value={expDescription}
              onChange={e => setExpDescription(e.target.value)}
            />
            {!isInvestorExpense && (
              <div className="flex gap-2">
                <Button
                  variant={expSource === 'cash' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setExpSource('cash')}
                >
                  <Banknote className="w-4 h-4 mr-1" />Cash
                </Button>
                <Button
                  variant={expSource === 'gcash' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setExpSource('gcash')}
                >
                  <Smartphone className="w-4 h-4 mr-1" />GCash
                </Button>
              </div>
            )}
            <Button className="w-full" onClick={addExpense}>
              <Plus className="w-4 h-4 mr-2" />
              Добавить
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
