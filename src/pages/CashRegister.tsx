import React, { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { 
  RefreshCw, Lock, Loader2, Sun, Moon, Plus, Trash2, Banknote, Smartphone, 
  Calendar, ChevronDown, ChevronUp
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
}

const ADMIN_PIN = '8808';

const CATEGORIES = [
  { value: 'purchases', label: 'Закупки' },
  { value: 'salaries', label: 'Зарплаты' },
  { value: 'equipment', label: 'Оборудование' },
  { value: 'employee_food', label: 'Еда сотрудников' },
  { value: 'food_hunters', label: 'Food Hunters' },
  { value: 'other', label: 'Прочее' }
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
  
  // Edit cash
  const [showCashDialog, setShowCashDialog] = useState(false);
  const [editCash, setEditCash] = useState('');
  const [editGcash, setEditGcash] = useState('');
  
  // Add expense
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [expAmount, setExpAmount] = useState('');
  const [expCategory, setExpCategory] = useState('purchases');
  const [expDescription, setExpDescription] = useState('');
  const [expSource, setExpSource] = useState<PaymentSource>('cash');
  
  // Show history
  const [showHistory, setShowHistory] = useState(false);
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

  const currentRecord = records.find(r => r.date === selectedDate && r.shift === selectedShift);
  const currentExpenses = expenses.filter(e => e.date === selectedDate && e.shift === selectedShift);
  
  const cashExp = currentExpenses.filter(e => e.payment_source === 'cash').reduce((s, e) => s + e.amount, 0);
  const gcashExp = currentExpenses.filter(e => e.payment_source === 'gcash').reduce((s, e) => s + e.amount, 0);
  const cashOnHand = (currentRecord?.cash_actual || 0) - cashExp;
  const gcashOnHand = (currentRecord?.gcash_actual || 0) - gcashExp;

  // History expenses
  const historyExpenses = expenses.filter(e => e.date >= dateFrom && e.date <= dateTo);
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
      toast.error('Неверный PIN');
    }
  };

  const syncLoyverse = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('loyverse-history-sync', { body: { days: 7 } });
      if (error) throw error;
      if (data?.success) {
        await loadData();
        toast.success('Синхронизировано');
      }
    } catch (e) {
      toast.error('Ошибка синхронизации');
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
      toast.success('Сохранено');
      setShowCashDialog(false);
      loadData();
    } catch (e) {
      toast.error('Ошибка сохранения');
    }
  };

  const addExpense = async () => {
    const amount = parseInt(expAmount);
    if (!amount || amount <= 0) {
      toast.error('Введите сумму');
      return;
    }
    
    try {
      let regId = currentRecord?.id;
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
        payment_source: expSource
      });
      
      toast.success('Расход добавлен');
      setShowExpenseDialog(false);
      setExpAmount('');
      setExpDescription('');
      loadData();
    } catch (e) {
      toast.error('Ошибка');
    }
  };

  const deleteExpense = async (id: string) => {
    await supabase.from('cash_expenses').delete().eq('id', id);
    toast.success('Удалено');
    loadData();
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
            <h2 className="text-xl font-semibold">Касса</h2>
            <p className="text-muted-foreground">Требуется доступ администратора</p>
            <Button onClick={() => setShowPinDialog(true)}><Lock className="w-4 h-4 mr-2" />Войти</Button>
          </CardContent>
        </Card>
        <Dialog open={showPinDialog} onOpenChange={setShowPinDialog}>
          <DialogContent className="max-w-xs">
            <DialogHeader><DialogTitle>Введите PIN</DialogTitle></DialogHeader>
            <Input type="password" value={pinInput} onChange={e => setPinInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} placeholder="PIN" />
            <Button onClick={handleLogin} className="w-full">Войти</Button>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">💰 Касса</h1>
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
            <Sun className="w-4 h-4 mr-1" />День
          </Button>
          <Button variant={selectedShift === 'night' ? 'default' : 'ghost'} size="sm" className="rounded-l-none" onClick={() => setSelectedShift('night')}>
            <Moon className="w-4 h-4 mr-1" />Ночь
          </Button>
        </div>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-green-500/10 border-green-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Banknote className="w-5 h-5 text-green-600" />
              <span className="text-xs text-green-600 font-semibold">CASH НА РУКАХ</span>
            </div>
            <div className="text-2xl font-bold text-green-600">₱{cashOnHand.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Получено: ₱{(currentRecord?.cash_actual || 0).toLocaleString()} − Расходы: ₱{cashExp.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-blue-500/10 border-blue-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Smartphone className="w-5 h-5 text-blue-600" />
              <span className="text-xs text-blue-600 font-semibold">GCASH НА РУКАХ</span>
            </div>
            <div className="text-2xl font-bold text-blue-600">₱{gcashOnHand.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Получено: ₱{(currentRecord?.gcash_actual || 0).toLocaleString()} − Расходы: ₱{gcashExp.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2">
        <Button className="flex-1 bg-primary" onClick={() => {
          setEditCash((currentRecord?.cash_actual || 0).toString());
          setEditGcash((currentRecord?.gcash_actual || 0).toString());
          setShowCashDialog(true);
        }}>
          <Banknote className="w-4 h-4 mr-2" />Ввести кассу
        </Button>
        <Button variant="outline" className="flex-1" onClick={() => setShowExpenseDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />Добавить расход
        </Button>
      </div>

      {/* Expected vs Actual */}
      {currentRecord && (
        <Card>
          <CardContent className="p-3">
            <div className="grid grid-cols-3 text-xs gap-2">
              <div></div>
              <div className="text-center font-medium text-muted-foreground">Ожидается</div>
              <div className="text-center font-medium text-muted-foreground">Получено</div>
              <div className="font-medium">💵 Cash</div>
              <div className="text-center">₱{(currentRecord.cash_expected || 0).toLocaleString()}</div>
              <div className={cn("text-center font-medium", (currentRecord.cash_actual || 0) >= (currentRecord.cash_expected || 0) ? "text-green-600" : "text-red-600")}>
                ₱{(currentRecord.cash_actual || 0).toLocaleString()}
              </div>
              <div className="font-medium">📱 GCash</div>
              <div className="text-center">₱{(currentRecord.gcash_expected || 0).toLocaleString()}</div>
              <div className={cn("text-center font-medium", (currentRecord.gcash_actual || 0) >= (currentRecord.gcash_expected || 0) ? "text-green-600" : "text-red-600")}>
                ₱{(currentRecord.gcash_actual || 0).toLocaleString()}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expenses List */}
      <Card>
        <CardHeader className="py-3 pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>Расходы за смену</span>
            <Badge variant="secondary">₱{(cashExp + gcashExp).toLocaleString()}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="py-2">
          {currentExpenses.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Нет расходов</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {currentExpenses.map(exp => (
                <div key={exp.id} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-sm", exp.payment_source === 'gcash' ? "text-blue-600" : "text-green-600")}>
                      {exp.payment_source === 'gcash' ? '📱' : '💵'}
                    </span>
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

      {/* History Toggle */}
      <Button variant="ghost" className="w-full justify-between" onClick={() => setShowHistory(!showHistory)}>
        <span className="flex items-center gap-2"><Calendar className="w-4 h-4" />История расходов</span>
        {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </Button>

      {showHistory && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex gap-2 items-center">
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="flex-1" />
              <span>—</span>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="flex-1" />
            </div>
            
            <div className="flex gap-4 text-sm">
              <div>💵 Cash: <span className="font-semibold">₱{historyTotalCash.toLocaleString()}</span></div>
              <div>📱 GCash: <span className="font-semibold">₱{historyTotalGcash.toLocaleString()}</span></div>
              <div>Всего: <span className="font-semibold">₱{(historyTotalCash + historyTotalGcash).toLocaleString()}</span></div>
            </div>
            
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {historyExpenses.slice(0, 50).map(exp => (
                <div key={exp.id} className="flex items-center justify-between text-xs p-2 bg-muted/20 rounded">
                  <div className="flex items-center gap-2">
                    <span>{exp.payment_source === 'gcash' ? '📱' : '💵'}</span>
                    <span className="text-muted-foreground">{exp.date}</span>
                    <span>{getCategoryLabel(exp.category)}</span>
                  </div>
                  <span className="font-medium">₱{exp.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cash Dialog */}
      <Dialog open={showCashDialog} onOpenChange={setShowCashDialog}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Ввести кассу</DialogTitle>
            <DialogDescription>{selectedDate} {selectedShift === 'day' ? '☀️' : '🌙'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground">Ожидается: ₱{(currentRecord?.cash_expected || 0).toLocaleString()}</label>
              <div className="flex items-center gap-2 mt-1">
                <Banknote className="w-4 h-4 text-green-600" />
                <Input type="number" placeholder="Cash" value={editCash} onChange={e => setEditCash(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Ожидается: ₱{(currentRecord?.gcash_expected || 0).toLocaleString()}</label>
              <div className="flex items-center gap-2 mt-1">
                <Smartphone className="w-4 h-4 text-blue-600" />
                <Input type="number" placeholder="GCash" value={editGcash} onChange={e => setEditGcash(e.target.value)} />
              </div>
            </div>
            <Button onClick={saveCash} className="w-full">Сохранить</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Expense Dialog */}
      <Dialog open={showExpenseDialog} onOpenChange={setShowExpenseDialog}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Добавить расход</DialogTitle>
            <DialogDescription>{selectedDate} {selectedShift === 'day' ? '☀️' : '🌙'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={expSource === 'cash' ? 'default' : 'outline'}
                className={cn("flex-1", expSource === 'cash' && "bg-green-600 hover:bg-green-700")}
                onClick={() => setExpSource('cash')}
              >💵 Cash</Button>
              <Button
                type="button"
                variant={expSource === 'gcash' ? 'default' : 'outline'}
                className={cn("flex-1", expSource === 'gcash' && "bg-blue-600 hover:bg-blue-700")}
                onClick={() => setExpSource('gcash')}
              >📱 GCash</Button>
            </div>
            <Select value={expCategory} onValueChange={setExpCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="number" placeholder="Сумма" value={expAmount} onChange={e => setExpAmount(e.target.value)} />
            <Input placeholder="Описание (опционально)" value={expDescription} onChange={e => setExpDescription(e.target.value)} />
            <Button onClick={addExpense} className="w-full">Добавить</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
