import { useState, useEffect } from 'react';
import { format, subDays, startOfDay } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { 
  Calculator, 
  Plus, 
  TrendingDown, 
  TrendingUp, 
  DollarSign,
  ShoppingCart,
  Users,
  MoreHorizontal,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Trash2
} from 'lucide-react';

interface CashRecord {
  id: string;
  date: string;
  opening_balance: number;
  expected_sales: number;
  actual_cash: number | null;
  discrepancy: number | null;
  purchases: number;
  salaries: number;
  other_expenses: number;
  notes: string | null;
}

interface CashExpense {
  id: string;
  cash_register_id: string;
  category: 'purchases' | 'salaries' | 'other';
  amount: number;
  description: string | null;
}

export default function CashRegister() {
  const [records, setRecords] = useState<CashRecord[]>([]);
  const [expenses, setExpenses] = useState<CashExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [actualCashInput, setActualCashInput] = useState<string>('');
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState<'purchases' | 'salaries' | 'other'>('purchases');
  const [expenseAmount, setExpenseAmount] = useState<string>('');
  const [expenseDescription, setExpenseDescription] = useState<string>('');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadData();
    
    // Subscribe to realtime updates
    const channel = supabase
      .channel('cash-register-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_register' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_expenses' }, () => loadData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadData = async () => {
    try {
      const { data: recordsData, error: recordsError } = await supabase
        .from('cash_register')
        .select('*')
        .order('date', { ascending: false })
        .limit(30);

      if (recordsError) throw recordsError;
      setRecords(recordsData || []);

      const { data: expensesData, error: expensesError } = await supabase
        .from('cash_expenses')
        .select('*')
        .order('created_at', { ascending: false });

      if (expensesError) throw expensesError;
      setExpenses((expensesData || []) as CashExpense[]);
    } catch (error) {
      console.error('Error loading cash data:', error);
      toast.error('Ошибка загрузки данных кассы');
    } finally {
      setLoading(false);
    }
  };

  const syncSalesFromLoyverse = async (date: string) => {
    setSyncing(true);
    try {
      // Get Manila timezone date boundaries (5AM to 5AM)
      const dateObj = new Date(date + 'T00:00:00');
      const startDate = new Date(dateObj);
      startDate.setHours(5, 0, 0, 0);
      const endDate = new Date(dateObj);
      endDate.setDate(endDate.getDate() + 1);
      endDate.setHours(5, 0, 0, 0);

      const { data, error } = await supabase.functions.invoke('loyverse-payments', {
        body: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        }
      });

      if (error) throw error;

      const cashSales = data.summary?.byPaymentType?.Cash?.amount || 0;
      
      // Get previous day's record for opening balance
      const prevDate = format(subDays(new Date(date), 1), 'yyyy-MM-dd');
      const { data: prevRecord } = await supabase
        .from('cash_register')
        .select('*')
        .eq('date', prevDate)
        .maybeSingle();

      let openingBalance = 0;
      if (prevRecord && prevRecord.actual_cash !== null) {
        // Use previous day's actual cash minus expenses as opening balance
        openingBalance = prevRecord.actual_cash - (prevRecord.purchases + prevRecord.salaries + prevRecord.other_expenses);
      }

      // Upsert the record
      const { error: upsertError } = await supabase
        .from('cash_register')
        .upsert({
          date,
          opening_balance: openingBalance,
          expected_sales: Math.round(cashSales)
        }, { onConflict: 'date' });

      if (upsertError) throw upsertError;

      toast.success(`Продажи синхронизированы: ₱${cashSales.toLocaleString()}`);
      loadData();
    } catch (error) {
      console.error('Error syncing sales:', error);
      toast.error('Ошибка синхронизации продаж');
    } finally {
      setSyncing(false);
    }
  };

  const saveActualCash = async () => {
    const amount = parseInt(actualCashInput);
    if (isNaN(amount)) {
      toast.error('Введите корректную сумму');
      return;
    }

    try {
      const record = records.find(r => r.date === selectedDate);
      const expectedTotal = (record?.opening_balance || 0) + (record?.expected_sales || 0);
      const discrepancy = amount - expectedTotal;

      const { error } = await supabase
        .from('cash_register')
        .upsert({
          date: selectedDate,
          actual_cash: amount,
          discrepancy,
          opening_balance: record?.opening_balance || 0,
          expected_sales: record?.expected_sales || 0
        }, { onConflict: 'date' });

      if (error) throw error;

      toast.success('Фактическая касса сохранена');
      setActualCashInput('');
      loadData();
    } catch (error) {
      console.error('Error saving actual cash:', error);
      toast.error('Ошибка сохранения');
    }
  };

  const addExpense = async () => {
    const amount = parseInt(expenseAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Введите корректную сумму');
      return;
    }

    try {
      // Get or create today's record
      let record = records.find(r => r.date === selectedDate);
      if (!record) {
        const { data: newRecord, error: createError } = await supabase
          .from('cash_register')
          .insert({ date: selectedDate })
          .select()
          .single();
        
        if (createError) throw createError;
        record = newRecord;
      }

      // Add expense
      const { error: expenseError } = await supabase
        .from('cash_expenses')
        .insert({
          cash_register_id: record.id,
          category: expenseCategory,
          amount,
          description: expenseDescription || null
        });

      if (expenseError) throw expenseError;

      // Update totals
      const updateField = expenseCategory === 'purchases' ? 'purchases' : 
                          expenseCategory === 'salaries' ? 'salaries' : 'other_expenses';
      
      const { error: updateError } = await supabase
        .from('cash_register')
        .update({ [updateField]: (record[updateField as keyof CashRecord] as number || 0) + amount })
        .eq('id', record.id);

      if (updateError) throw updateError;

      toast.success('Расход добавлен');
      setShowExpenseDialog(false);
      setExpenseAmount('');
      setExpenseDescription('');
      loadData();
    } catch (error) {
      console.error('Error adding expense:', error);
      toast.error('Ошибка добавления расхода');
    }
  };

  const deleteExpense = async (expense: CashExpense) => {
    try {
      const { error: deleteError } = await supabase
        .from('cash_expenses')
        .delete()
        .eq('id', expense.id);

      if (deleteError) throw deleteError;

      // Update totals in cash_register
      const record = records.find(r => r.id === expense.cash_register_id);
      if (record) {
        const updateField = expense.category === 'purchases' ? 'purchases' : 
                            expense.category === 'salaries' ? 'salaries' : 'other_expenses';
        
        const { error: updateError } = await supabase
          .from('cash_register')
          .update({ [updateField]: Math.max(0, (record[updateField as keyof CashRecord] as number || 0) - expense.amount) })
          .eq('id', record.id);

        if (updateError) throw updateError;
      }

      toast.success('Расход удален');
      loadData();
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast.error('Ошибка удаления');
    }
  };

  const currentRecord = records.find(r => r.date === selectedDate);
  const expectedTotal = (currentRecord?.opening_balance || 0) + (currentRecord?.expected_sales || 0);
  const totalExpenses = (currentRecord?.purchases || 0) + (currentRecord?.salaries || 0) + (currentRecord?.other_expenses || 0);
  const expectedAfterExpenses = expectedTotal - totalExpenses;
  const currentExpenses = expenses.filter(e => e.cash_register_id === currentRecord?.id);

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'purchases': return 'Закупки';
      case 'salaries': return 'Зарплаты';
      case 'other': return 'Прочее';
      default: return category;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'purchases': return <ShoppingCart className="w-4 h-4" />;
      case 'salaries': return <Users className="w-4 h-4" />;
      case 'other': return <MoreHorizontal className="w-4 h-4" />;
      default: return null;
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Учет кассы</h1>
          <p className="text-muted-foreground text-sm">Контроль наличных и расходов</p>
        </div>
        <div className="flex gap-2">
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-40"
          />
          <Button 
            variant="outline" 
            onClick={() => syncSalesFromLoyverse(selectedDate)}
            disabled={syncing}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            Синхронизировать
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Начальный остаток
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₱{(currentRecord?.opening_balance || 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Продажи (нал)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              +₱{(currentRecord?.expected_sales || 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingDown className="w-4 h-4" />
              Расходы
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              -₱{totalExpenses.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Закупки: ₱{(currentRecord?.purchases || 0).toLocaleString()} | 
              Зарплаты: ₱{(currentRecord?.salaries || 0).toLocaleString()} | 
              Прочее: ₱{(currentRecord?.other_expenses || 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card className={currentRecord?.discrepancy != null && currentRecord?.discrepancy !== 0 ? 
          ((currentRecord?.discrepancy ?? 0) < 0 ? 'border-red-500/50' : 'border-green-500/50') : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calculator className="w-4 h-4" />
              Расхождение
            </CardTitle>
          </CardHeader>
          <CardContent>
            {currentRecord?.discrepancy != null ? (
              <div className="flex items-center gap-2">
                {currentRecord.discrepancy === 0 ? (
                  <>
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="text-2xl font-bold text-green-600">₱0</span>
                  </>
                ) : currentRecord.discrepancy < 0 ? (
                  <>
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    <span className="text-2xl font-bold text-red-600">
                      -₱{Math.abs(currentRecord.discrepancy).toLocaleString()}
                    </span>
                  </>
                ) : (
                  <>
                    <TrendingUp className="w-5 h-5 text-green-600" />
                    <span className="text-2xl font-bold text-green-600">
                      +₱{currentRecord.discrepancy.toLocaleString()}
                    </span>
                  </>
                )}
              </div>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">—</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Enter Actual Cash */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Ввод фактической кассы</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Ожидаемо в кассе: <span className="font-bold text-foreground">₱{expectedAfterExpenses.toLocaleString()}</span>
            </div>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Сумма в кассе"
                value={actualCashInput}
                onChange={(e) => setActualCashInput(e.target.value)}
                className="flex-1"
              />
              <Button onClick={saveActualCash}>
                Сохранить
              </Button>
            </div>
            {currentRecord?.actual_cash !== null && (
              <div className="text-sm">
                Текущее значение: <span className="font-bold">₱{currentRecord.actual_cash.toLocaleString()}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add Expense */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Добавить расход</CardTitle>
          </CardHeader>
          <CardContent>
            <Dialog open={showExpenseDialog} onOpenChange={setShowExpenseDialog}>
              <DialogTrigger asChild>
                <Button className="w-full" variant="outline">
                  <Plus className="w-4 h-4 mr-2" />
                  Добавить расход
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Новый расход</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div>
                    <label className="text-sm font-medium">Категория</label>
                    <Select value={expenseCategory} onValueChange={(v) => setExpenseCategory(v as any)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="purchases">Закупки</SelectItem>
                        <SelectItem value="salaries">Зарплаты</SelectItem>
                        <SelectItem value="other">Прочее</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Сумма</label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={expenseAmount}
                      onChange={(e) => setExpenseAmount(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Описание (опционально)</label>
                    <Textarea
                      placeholder="Описание расхода..."
                      value={expenseDescription}
                      onChange={(e) => setExpenseDescription(e.target.value)}
                    />
                  </div>
                  <Button onClick={addExpense} className="w-full">
                    Добавить
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Recent expenses for this day */}
            {currentExpenses.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="text-sm font-medium">Расходы за день:</div>
                {currentExpenses.map((expense) => (
                  <div key={expense.id} className="flex items-center justify-between p-2 bg-secondary/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      {getCategoryIcon(expense.category)}
                      <div>
                        <div className="text-sm font-medium">₱{expense.amount.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">
                          {getCategoryLabel(expense.category)}
                          {expense.description && ` - ${expense.description}`}
                        </div>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => deleteExpense(expense)}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* History Table */}
      <Card>
        <CardHeader>
          <CardTitle>История (последние 30 дней)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2">Дата</th>
                  <th className="text-right py-2 px-2">Нач. остаток</th>
                  <th className="text-right py-2 px-2">Продажи</th>
                  <th className="text-right py-2 px-2">Расходы</th>
                  <th className="text-right py-2 px-2">Ожидаемо</th>
                  <th className="text-right py-2 px-2">Факт</th>
                  <th className="text-right py-2 px-2">Расхождение</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => {
                  const recordExpenses = record.purchases + record.salaries + record.other_expenses;
                  const expected = record.opening_balance + record.expected_sales - recordExpenses;
                  return (
                    <tr 
                      key={record.id} 
                      className={`border-b hover:bg-secondary/50 cursor-pointer ${record.date === selectedDate ? 'bg-primary/10' : ''}`}
                      onClick={() => setSelectedDate(record.date)}
                    >
                      <td className="py-2 px-2">{format(new Date(record.date), 'dd.MM.yyyy')}</td>
                      <td className="text-right py-2 px-2">₱{record.opening_balance.toLocaleString()}</td>
                      <td className="text-right py-2 px-2 text-green-600">+₱{record.expected_sales.toLocaleString()}</td>
                      <td className="text-right py-2 px-2 text-red-600">-₱{recordExpenses.toLocaleString()}</td>
                      <td className="text-right py-2 px-2 font-medium">₱{expected.toLocaleString()}</td>
                      <td className="text-right py-2 px-2">
                        {record.actual_cash !== null ? `₱${record.actual_cash.toLocaleString()}` : '—'}
                      </td>
                      <td className="text-right py-2 px-2">
                        {record.discrepancy !== null ? (
                          <Badge variant={record.discrepancy === 0 ? 'default' : record.discrepancy < 0 ? 'destructive' : 'secondary'}>
                            {record.discrepancy >= 0 ? '+' : ''}₱{record.discrepancy.toLocaleString()}
                          </Badge>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
