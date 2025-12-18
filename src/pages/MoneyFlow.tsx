import React, { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { 
  Loader2, Sun, Moon, Plus, Trash2, Banknote, Smartphone, 
  Wallet, Minus, ShoppingCart, Receipt, TrendingUp, CircleDollarSign
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type ShiftType = 'day' | 'night';
type PaymentSource = 'cash' | 'gcash';

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
  if (hours < 5) {
    manilaTime.setDate(manilaTime.getDate() - 1);
  }
  return format(manilaTime, 'yyyy-MM-dd');
};

export default function MoneyFlow() {
  const [records, setRecords] = useState<CashRecord[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [investorExpenses, setInvestorExpenses] = useState<InvestorContribution[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedDate, setSelectedDate] = useState(getShiftDate());
  const [selectedShift, setSelectedShift] = useState<ShiftType>(getCurrentShift());
  
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [expAmount, setExpAmount] = useState('');
  const [expCategory, setExpCategory] = useState('purchases');
  const [expDescription, setExpDescription] = useState('');
  const [expSource, setExpSource] = useState<PaymentSource>('cash');
  const [isInvestorExpense, setIsInvestorExpense] = useState(false);

  const currentRecord = records.find(r => r.date === selectedDate && r.shift === selectedShift);
  const currentInvestorExpenses = investorExpenses.filter(e => e.date === selectedDate);
  
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
      const [{ data: cashData }, { data: expData }, { data: investorData }] = await Promise.all([
        supabase.from('cash_register').select('id, date, shift, cash_expected, gcash_expected, cash_actual, gcash_actual').order('date', { ascending: false }),
        supabase.from('cash_expenses').select('*').order('created_at', { ascending: false }),
        supabase.from('investor_contributions').select('*').order('created_at', { ascending: false })
      ]);
      setRecords((cashData || []) as CashRecord[]);
      setExpenses((expData || []) as Expense[]);
      setInvestorExpenses((investorData || []) as InvestorContribution[]);
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
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const openExpenseDialog = (source: PaymentSource, investor: boolean = false) => {
    setExpSource(source);
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
          shift: selectedShift, date: selectedDate, payment_source: expSource, expense_type: 'balance',
          approved: true
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
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            Money Flow
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Storage & expenses</p>
        </div>
        <Badge variant="outline" className="text-lg font-bold px-4 py-2">
          ₱{totalStorage.toLocaleString()}
        </Badge>
      </div>

      {/* Storage Balances */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-green-500/30 bg-gradient-to-br from-green-500/10 to-green-500/5 overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                <Banknote className="w-4 h-4 text-green-500" />
              </div>
              <span className="text-sm font-medium">Cash</span>
            </div>
            <p className="text-2xl font-bold text-green-500 mb-2">₱{storageCash.toLocaleString()}</p>
            <div className="text-[10px] text-muted-foreground space-y-1">
              <div className="flex justify-between"><span>Received:</span><span className="text-green-500">+₱{totalCashReceived.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>Spent:</span><span className="text-orange-500">-₱{totalBalanceCashExp.toLocaleString()}</span></div>
            </div>
            <Button 
              size="sm" 
              variant="outline" 
              className="w-full mt-3 h-8 text-xs border-green-500/30 hover:bg-green-500/10 text-green-600"
              onClick={() => openExpenseDialog('cash')}
            >
              <Minus className="w-3 h-3 mr-1" />
              Deduct
            </Button>
          </CardContent>
        </Card>

        <Card className="border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-blue-500/5 overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Smartphone className="w-4 h-4 text-blue-500" />
              </div>
              <span className="text-sm font-medium">GCash</span>
            </div>
            <p className="text-2xl font-bold text-blue-500 mb-2">₱{storageGcash.toLocaleString()}</p>
            <div className="text-[10px] text-muted-foreground space-y-1">
              <div className="flex justify-between"><span>Received:</span><span className="text-blue-500">+₱{totalGcashReceived.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>Spent:</span><span className="text-orange-500">-₱{totalBalanceGcashExp.toLocaleString()}</span></div>
            </div>
            <Button 
              size="sm" 
              variant="outline" 
              className="w-full mt-3 h-8 text-xs border-blue-500/30 hover:bg-blue-500/10 text-blue-600"
              onClick={() => openExpenseDialog('gcash')}
            >
              <Minus className="w-3 h-3 mr-1" />
              Deduct
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Investor Button */}
      <Button 
        variant="outline" 
        className="w-full border-purple-500/30 text-purple-500 hover:bg-purple-500/10"
        onClick={() => openExpenseDialog('cash', true)}
      >
        <Wallet className="w-4 h-4 mr-2" />
        Add Investor Expense
      </Button>

      {/* Storage Expenses History */}
      {expenses.filter(e => e.expense_type === 'balance').length > 0 && (
        <Card className="border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-transparent">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-orange-500/20 flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4 text-orange-500" />
                </div>
                <span>Expenses</span>
              </span>
              <Badge className="bg-orange-500/20 text-orange-500 border-0 font-semibold">
                -₱{(totalBalanceCashExp + totalBalanceGcashExp).toLocaleString()}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 py-2">
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {expenses
                .filter(e => e.expense_type === 'balance')
                .slice(0, 20)
                .map(exp => (
                  <div key={exp.id} className="flex items-center gap-3 text-xs p-2.5 bg-background/60 rounded-xl border border-border/40 group hover:border-orange-500/30 transition-all">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                      exp.payment_source === 'gcash' ? "bg-blue-500/15" : "bg-green-500/15"
                    )}>
                      {exp.payment_source === 'gcash' 
                        ? <Smartphone className="w-4 h-4 text-blue-500" /> 
                        : <Banknote className="w-4 h-4 text-green-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{getCategoryLabel(exp.category)}</div>
                      <div className="text-muted-foreground text-[10px] truncate">
                        {exp.date} {exp.description && `• ${exp.description}`}
                      </div>
                    </div>
                    <Badge variant="outline" className={cn(
                      "shrink-0 font-bold border-0",
                      exp.payment_source === 'gcash' ? "bg-blue-500/15 text-blue-500" : "bg-green-500/15 text-green-500"
                    )}>
                      -₱{exp.amount.toLocaleString()}
                    </Badge>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive/70 hover:text-destructive hover:bg-destructive/10 shrink-0"
                      onClick={() => deleteExpense(exp.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
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
                Investor Expenses
              </span>
              <Badge className="bg-purple-500/20 text-purple-500 border-0">
                ₱{investorExpenses.reduce((s, e) => s + e.amount, 0).toLocaleString()}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 py-2">
            <div className="space-y-2 max-h-44 overflow-y-auto">
              {investorExpenses.slice(0, 15).map(exp => (
                <div key={exp.id} className="flex items-center justify-between text-xs p-2.5 bg-purple-500/5 rounded-xl group">
                  <div className="flex-1">
                    <span className="font-medium">{getCategoryLabel(exp.category)}</span>
                    {exp.description && <span className="text-muted-foreground ml-2">• {exp.description}</span>}
                    <div className="text-[10px] text-muted-foreground">{exp.date}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-purple-500">₱{exp.amount.toLocaleString()}</span>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:bg-destructive/20" 
                      onClick={() => deleteInvestorExpense(exp.id)}
                    >
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Expense Dialog */}
      <Dialog open={showExpenseDialog} onOpenChange={setShowExpenseDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isInvestorExpense ? (
                <><Wallet className="w-5 h-5 text-purple-500" />Investor Expense</>
              ) : (
                <><CircleDollarSign className="w-5 h-5 text-primary" />Add Expense</>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              type="number"
              placeholder="Amount"
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
              placeholder="Description (optional)"
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
              Add Expense
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
