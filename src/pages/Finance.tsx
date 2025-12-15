import { useState, useEffect } from 'react';
import { format, subDays } from 'date-fns';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
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
  Trash2,
  Lock,
  EyeOff,
  Download,
  FileSpreadsheet,
  Wallet,
  Receipt,
  CreditCard,
  Banknote,
  Coffee,
  Package
} from 'lucide-react';

interface CashRecord {
  id: string;
  date: string;
  opening_balance: number;
  expected_sales: number;
  cost: number;
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
  category: string;
  amount: number;
  description: string | null;
}

const ADMIN_PIN = '8808';

export default function CashRegister() {
  const [records, setRecords] = useState<CashRecord[]>([]);
  const [expenses, setExpenses] = useState<CashExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [actualCashInput, setActualCashInput] = useState<string>('');
  const [expenseAmount, setExpenseAmount] = useState<string>('');
  const [expenseDescription, setExpenseDescription] = useState<string>('');
  const [syncing, setSyncing] = useState(false);
  
  // Dialogs
  const [showCashDialog, setShowCashDialog] = useState(false);
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false);
  const [showSalaryDialog, setShowSalaryDialog] = useState(false);
  
  // Admin mode
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [pendingAdminAction, setPendingAdminAction] = useState<'purchase' | 'salary' | 'admin' | null>(null);
  
  // Google Sheets
  const [exportingToSheets, setExportingToSheets] = useState(false);

  useEffect(() => {
    loadData();
    
    const channel = supabase
      .channel('cash-register-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_register' }, () => loadData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_expenses' }, () => loadData(true))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const CACHE_KEY_RECORDS = 'cash_register_records';
  const CACHE_KEY_EXPENSES = 'cash_register_expenses';
  const CACHE_KEY_LAST_SYNC = 'cash_register_last_sync';

  const loadData = async (forceRefresh = false) => {
    try {
      // Try to load from cache first
      const cachedRecords = localStorage.getItem(CACHE_KEY_RECORDS);
      const cachedExpenses = localStorage.getItem(CACHE_KEY_EXPENSES);
      const lastSync = localStorage.getItem(CACHE_KEY_LAST_SYNC);
      const now = Date.now();
      const cacheMaxAge = 5 * 60 * 1000; // 5 minutes

      if (!forceRefresh && cachedRecords && cachedExpenses && lastSync && (now - parseInt(lastSync)) < cacheMaxAge) {
        setRecords(JSON.parse(cachedRecords));
        setExpenses(JSON.parse(cachedExpenses));
        setLoading(false);
        return;
      }

      const { data: recordsData, error: recordsError } = await supabase
        .from('cash_register')
        .select('*')
        .order('date', { ascending: false });

      if (recordsError) throw recordsError;
      
      const { data: expensesData, error: expensesError } = await supabase
        .from('cash_expenses')
        .select('*')
        .order('created_at', { ascending: false });

      if (expensesError) throw expensesError;

      // Cache the data
      localStorage.setItem(CACHE_KEY_RECORDS, JSON.stringify(recordsData || []));
      localStorage.setItem(CACHE_KEY_EXPENSES, JSON.stringify(expensesData || []));
      localStorage.setItem(CACHE_KEY_LAST_SYNC, now.toString());

      setRecords(recordsData || []);
      setExpenses((expensesData || []) as CashExpense[]);
      setExpenses(expensesData || []);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = () => {
    if (pinInput === ADMIN_PIN) {
      if (pendingAdminAction === 'purchase') {
        setShowPinDialog(false);
        setShowPurchaseDialog(true);
      } else if (pendingAdminAction === 'salary') {
        setShowPinDialog(false);
        setShowSalaryDialog(true);
      } else {
        setIsAdminMode(true);
        setShowPinDialog(false);
      }
      setPinInput('');
      setPinError('');
      setPendingAdminAction(null);
    } else {
      setPinError('Wrong PIN');
    }
  };

  const requestAdminAction = (action: 'purchase' | 'salary' | 'admin') => {
    setPendingAdminAction(action);
    setShowPinDialog(true);
    setPinInput('');
    setPinError('');
  };

  const currentRecord = records.find(r => r.date === selectedDate);
  const currentExpenses = expenses.filter(e => {
    const record = records.find(r => r.id === e.cash_register_id);
    return record?.date === selectedDate;
  });

  const syncSalesFromLoyverse = async (date: string) => {
    setSyncing(true);
    try {
      // Calculate 5AM-5AM period for the date in Manila timezone
      const targetDate = new Date(date + 'T00:00:00');
      const manilaOffset = 8 * 60;
      
      // Start: target date 5AM Manila = target date -3 hours UTC
      const startDate = new Date(targetDate.getTime());
      startDate.setHours(5 - 8, 0, 0, 0);
      
      // End: next day 5AM Manila
      const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
      
      const { data, error } = await supabase.functions.invoke('loyverse-payments', {
        body: { startDate: startDate.toISOString(), endDate: endDate.toISOString() }
      });

      if (error) throw error;

      if (data?.summary) {
        // Check if record exists
        const { data: existing } = await supabase
          .from('cash_register')
          .select('id, purchases, salaries, other_expenses')
          .eq('date', date)
          .single();

        if (existing) {
          // Update existing record, preserve expense data
          await supabase
            .from('cash_register')
            .update({
              expected_sales: data.summary.netAmount || 0,
              cost: data.summary.totalCost || 0,
            })
            .eq('id', existing.id);
        } else {
          // Create new record
          await supabase
            .from('cash_register')
            .insert({
              date,
              opening_balance: 0,
              expected_sales: data.summary.netAmount || 0,
              cost: data.summary.totalCost || 0,
            });
        }
        
        await loadData(true);
        toast.success(`Synced sales: ₱${data.summary.netAmount?.toLocaleString() || 0}`);
      }
    } catch (error) {
      console.error('Error syncing from Loyverse:', error);
      toast.error('Failed to sync from Loyverse');
    } finally {
      setSyncing(false);
    }
  };

  const saveActualCash = async () => {
    if (!actualCashInput) {
      toast.error('Please enter amount');
      return;
    }

    const amount = parseInt(actualCashInput);
    const date = format(new Date(), 'yyyy-MM-dd');

    try {
      // Get or create today's record
      let { data: existing } = await supabase
        .from('cash_register')
        .select('*')
        .eq('date', date)
        .single();

      if (!existing) {
        // Create new record with expected sales from Loyverse
        await syncSalesFromLoyverse(date);
        
        const { data: newRecord } = await supabase
          .from('cash_register')
          .select('*')
          .eq('date', date)
          .single();
        
        existing = newRecord;
      }

      if (existing) {
        const totalExpenses = existing.purchases + existing.salaries + existing.other_expenses;
        const expectedCash = existing.opening_balance + existing.expected_sales - totalExpenses;
        const discrepancy = amount - expectedCash;

        await supabase
          .from('cash_register')
          .update({
            actual_cash: amount,
            discrepancy: discrepancy
          })
          .eq('id', existing.id);

        toast.success('Cash saved');
        setActualCashInput('');
        setShowCashDialog(false);
        loadData(true);
      }
    } catch (error) {
      console.error('Error saving cash:', error);
      toast.error('Failed to save');
    }
  };

  const addExpense = async (category: 'purchases' | 'salaries' | 'other', amount: number, description: string) => {
    const date = format(new Date(), 'yyyy-MM-dd');

    try {
      // Get or create today's record
      let { data: existing } = await supabase
        .from('cash_register')
        .select('*')
        .eq('date', date)
        .single();

      if (!existing) {
        const { data: newRecord } = await supabase
          .from('cash_register')
          .insert({
            date,
            opening_balance: 0,
            expected_sales: 0,
          })
          .select()
          .single();
        existing = newRecord;
      }

      if (existing) {
        // Add expense record
        await supabase
          .from('cash_expenses')
          .insert({
            cash_register_id: existing.id,
            category,
            amount,
            description
          });

        // Update category total
        const field = category === 'purchases' ? 'purchases' : 
                      category === 'salaries' ? 'salaries' : 'other_expenses';
        const currentValue = existing[field] || 0;

        await supabase
          .from('cash_register')
          .update({ [field]: currentValue + amount })
          .eq('id', existing.id);

        toast.success(`${category === 'purchases' ? 'Purchase' : category === 'salaries' ? 'Salary' : 'Expense'} added: ₱${amount.toLocaleString()}`);
        loadData(true);
      }
    } catch (error) {
      console.error('Error adding expense:', error);
      toast.error('Failed to add');
    }
  };

  const handleAddExpense = () => {
    const amount = parseInt(expenseAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter valid amount');
      return;
    }
    addExpense('other', amount, expenseDescription);
    setExpenseAmount('');
    setExpenseDescription('');
    setShowExpenseDialog(false);
  };

  const handleAddPurchase = () => {
    const amount = parseInt(expenseAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter valid amount');
      return;
    }
    addExpense('purchases', amount, expenseDescription);
    setExpenseAmount('');
    setExpenseDescription('');
    setShowPurchaseDialog(false);
  };

  const handleAddSalary = () => {
    const amount = parseInt(expenseAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter valid amount');
      return;
    }
    addExpense('salaries', amount, expenseDescription);
    setExpenseAmount('');
    setExpenseDescription('');
    setShowSalaryDialog(false);
  };

  const deleteExpense = async (expenseId: string, category: string, amount: number) => {
    try {
      const expense = expenses.find(e => e.id === expenseId);
      if (!expense) return;

      await supabase
        .from('cash_expenses')
        .delete()
        .eq('id', expenseId);

      // Update the total in cash_register
      const record = records.find(r => r.id === expense.cash_register_id);
      if (record) {
        const field = category === 'purchases' ? 'purchases' : 
                      category === 'salaries' ? 'salaries' : 'other_expenses';
        const currentValue = record[field as keyof CashRecord] as number || 0;

        await supabase
          .from('cash_register')
          .update({ [field]: Math.max(0, currentValue - amount) })
          .eq('id', record.id);
      }

      toast.success('Deleted');
      loadData(true);
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast.error('Failed to delete');
    }
  };

  // Calculate today's summary
  const todayRecord = records.find(r => r.date === format(new Date(), 'yyyy-MM-dd'));
  const todayExpenses = expenses.filter(e => {
    const record = records.find(r => r.id === e.cash_register_id);
    return record?.date === format(new Date(), 'yyyy-MM-dd');
  });
  const todayTotalExpenses = (todayRecord?.purchases || 0) + (todayRecord?.salaries || 0) + (todayRecord?.other_expenses || 0);

  // Overall totals for summary
  const overallTotals = records.reduce((acc, r) => ({
    totalSales: acc.totalSales + r.expected_sales,
    totalCost: acc.totalCost + (r.cost || 0),
    totalPurchases: acc.totalPurchases + r.purchases,
    totalSalaries: acc.totalSalaries + r.salaries,
    totalOther: acc.totalOther + r.other_expenses,
    totalDiscrepancy: acc.totalDiscrepancy + (r.discrepancy || 0),
    daysWithDiscrepancy: acc.daysWithDiscrepancy + (r.discrepancy && r.discrepancy !== 0 ? 1 : 0)
  }), { totalSales: 0, totalCost: 0, totalPurchases: 0, totalSalaries: 0, totalOther: 0, totalDiscrepancy: 0, daysWithDiscrepancy: 0 });

  const exportToCSV = () => {
    if (records.length === 0) {
      toast.error('No records to export');
      return;
    }
    
    const headers = ['Date', 'Sales', 'Cost', 'Gross Profit', 'Purchases', 'Salaries', 'Other', 'Total Expenses', 'Net Profit', 'Actual Cash', 'Discrepancy'];
    const sortedRecords = [...records].sort((a, b) => a.date.localeCompare(b.date));
    const wsData: (string | number)[][] = [headers];
    
    sortedRecords.forEach(r => {
      const totalExp = r.purchases + r.salaries + r.other_expenses;
      const grossProfit = r.expected_sales - (r.cost || 0);
      const netProfit = grossProfit - totalExp;
      wsData.push([
        r.date,
        r.expected_sales,
        r.cost || 0,
        grossProfit,
        r.purchases,
        r.salaries,
        r.other_expenses,
        totalExp,
        netProfit,
        r.actual_cash ?? 0,
        r.discrepancy ?? 0
      ]);
    });
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Cash Register');
    XLSX.writeFile(wb, `cash-register-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast.success(`Exported ${records.length} records`);
  };

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
      case 'purchases': return <Package className="w-4 h-4 text-orange-500" />;
      case 'salaries': return <Users className="w-4 h-4 text-blue-500" />;
      case 'other': return <Coffee className="w-4 h-4 text-purple-500" />;
      default: return <MoreHorizontal className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  // Employee View
  if (!isAdminMode) {
    return (
      <div className="p-4 sm:p-6 space-y-6 max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Касса</h1>
            <p className="text-muted-foreground text-sm">
              {format(new Date(), 'dd MMMM yyyy')}
            </p>
          </div>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => requestAdminAction('admin')}
          >
            <Lock className="w-4 h-4" />
          </Button>
        </div>

        {/* Today's Summary Card */}
        {todayRecord && (
          <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground">Продажи</div>
                  <div className="text-xl font-bold text-green-600">₱{todayRecord.expected_sales.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Расходы</div>
                  <div className="text-xl font-bold text-red-600">₱{todayTotalExpenses.toLocaleString()}</div>
                </div>
                {todayRecord.actual_cash != null && (
                  <>
                    <div>
                      <div className="text-xs text-muted-foreground">В кассе</div>
                      <div className="text-xl font-bold">₱{todayRecord.actual_cash.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Расхождение</div>
                      <div className={cn(
                        "text-xl font-bold",
                        todayRecord.discrepancy === 0 ? "text-green-600" :
                        todayRecord.discrepancy && todayRecord.discrepancy < 0 ? "text-red-600" : "text-green-600"
                      )}>
                        {todayRecord.discrepancy === 0 ? '✓' : 
                          (todayRecord.discrepancy && todayRecord.discrepancy > 0 ? '+' : '') + 
                          '₱' + Math.abs(todayRecord.discrepancy || 0).toLocaleString()}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Big Action Buttons - Like Pause All */}
        <div className="grid grid-cols-2 gap-4">
          {/* Enter Cash Button */}
          <Button
            variant="default"
            className="h-24 flex flex-col gap-2 text-lg font-semibold bg-green-600 hover:bg-green-700"
            onClick={() => setShowCashDialog(true)}
          >
            <Wallet className="w-8 h-8" />
            Внести кассу
          </Button>

          {/* Add Expense Button */}
          <Button
            variant="default"
            className="h-24 flex flex-col gap-2 text-lg font-semibold bg-purple-600 hover:bg-purple-700"
            onClick={() => setShowExpenseDialog(true)}
          >
            <Receipt className="w-8 h-8" />
            Расход
          </Button>

          {/* Add Purchase Button - Requires Admin */}
          <Button
            variant="outline"
            className="h-24 flex flex-col gap-2 text-lg font-semibold border-orange-500/50 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
            onClick={() => requestAdminAction('purchase')}
          >
            <Package className="w-8 h-8" />
            <div className="flex items-center gap-1">
              Закупки
              <Lock className="w-3 h-3" />
            </div>
          </Button>

          {/* Add Salary Button - Requires Admin */}
          <Button
            variant="outline"
            className="h-24 flex flex-col gap-2 text-lg font-semibold border-blue-500/50 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
            onClick={() => requestAdminAction('salary')}
          >
            <Users className="w-8 h-8" />
            <div className="flex items-center gap-1">
              Зарплаты
              <Lock className="w-3 h-3" />
            </div>
          </Button>
        </div>

        {/* Today's Expenses List */}
        {todayExpenses.length > 0 && (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base">Расходы сегодня</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {todayExpenses.map((expense) => (
                <div key={expense.id} className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    {getCategoryIcon(expense.category)}
                    <div>
                      <div className="font-medium">₱{expense.amount.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">
                        {expense.description || getCategoryLabel(expense.category)}
                      </div>
                    </div>
                  </div>
                  <Badge variant="secondary">
                    {getCategoryLabel(expense.category)}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Cash Input Dialog */}
        <Dialog open={showCashDialog} onOpenChange={setShowCashDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-green-600" />
                Внести кассу
              </DialogTitle>
              <DialogDescription>
                Введите фактическую сумму в кассе
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <Input
                type="number"
                placeholder="Сумма"
                value={actualCashInput}
                onChange={(e) => setActualCashInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveActualCash()}
                className="text-2xl h-14 text-center"
                autoFocus
              />
              <Button onClick={saveActualCash} className="w-full h-12 bg-green-600 hover:bg-green-700">
                Сохранить
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Expense Dialog */}
        <Dialog open={showExpenseDialog} onOpenChange={setShowExpenseDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-purple-600" />
                Добавить расход
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <Input
                type="number"
                placeholder="Сумма"
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
                className="text-xl h-12"
                autoFocus
              />
              <Input
                placeholder="Описание (что купили?)"
                value={expenseDescription}
                onChange={(e) => setExpenseDescription(e.target.value)}
              />
              <Button onClick={handleAddExpense} className="w-full h-12 bg-purple-600 hover:bg-purple-700">
                Добавить
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Purchase Dialog (Admin) */}
        <Dialog open={showPurchaseDialog} onOpenChange={setShowPurchaseDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="w-5 h-5 text-orange-600" />
                Добавить закупку
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <Input
                type="number"
                placeholder="Сумма"
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
                className="text-xl h-12"
                autoFocus
              />
              <Input
                placeholder="Описание"
                value={expenseDescription}
                onChange={(e) => setExpenseDescription(e.target.value)}
              />
              <Button onClick={handleAddPurchase} className="w-full h-12 bg-orange-600 hover:bg-orange-700">
                Добавить закупку
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Salary Dialog (Admin) */}
        <Dialog open={showSalaryDialog} onOpenChange={setShowSalaryDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                Добавить зарплату
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <Input
                type="number"
                placeholder="Сумма"
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
                className="text-xl h-12"
                autoFocus
              />
              <Input
                placeholder="Кому (имя)"
                value={expenseDescription}
                onChange={(e) => setExpenseDescription(e.target.value)}
              />
              <Button onClick={handleAddSalary} className="w-full h-12 bg-blue-600 hover:bg-blue-700">
                Добавить зарплату
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* PIN Dialog */}
        <Dialog open={showPinDialog} onOpenChange={setShowPinDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5" />
                Введите PIN
              </DialogTitle>
              <DialogDescription>
                {pendingAdminAction === 'purchase' && 'Для добавления закупок требуется PIN'}
                {pendingAdminAction === 'salary' && 'Для добавления зарплат требуется PIN'}
                {pendingAdminAction === 'admin' && 'Войти в режим администратора'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <Input
                type="password"
                placeholder="PIN"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
                className={cn("text-center text-2xl h-14", pinError && 'border-destructive')}
                autoFocus
              />
              {pinError && <p className="text-sm text-destructive text-center">{pinError}</p>}
              <Button onClick={handleAdminLogin} className="w-full h-12">
                Подтвердить
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Admin View (Full)
  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Касса</h1>
          <p className="text-muted-foreground text-sm">Режим администратора</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-40"
          />
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => syncSalesFromLoyverse(selectedDate)}
            disabled={syncing}
          >
            <RefreshCw className={cn("w-4 h-4 mr-2", syncing && 'animate-spin')} />
            Sync
          </Button>
          <Button variant="outline" size="sm" onClick={exportToCSV}>
            <Download className="w-4 h-4 mr-2" />
            Excel
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={async () => {
              setExportingToSheets(true);
              try {
                const { data, error } = await supabase.functions.invoke('google-sheets-sync');
                if (error) throw error;
                toast.success(data?.message || 'Synced to Google Sheets');
              } catch (error) {
                console.error('Error syncing to Google Sheets:', error);
                toast.error('Failed to sync');
              } finally {
                setExportingToSheets(false);
              }
            }}
            disabled={exportingToSheets}
          >
            {exportingToSheets ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4 mr-2" />
            )}
            Sheets
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setIsAdminMode(false)}
          >
            <EyeOff className="w-4 h-4 mr-2" />
            Выйти
          </Button>
        </div>
      </div>

      {/* Overall Summary */}
      <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet className="w-5 h-5" />
            Итого за {records.length} дней
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <div className="text-xs text-muted-foreground">Продажи</div>
              <div className="text-lg font-bold text-green-600">₱{overallTotals.totalSales.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Себестоимость</div>
              <div className="text-lg font-bold text-muted-foreground">₱{overallTotals.totalCost.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Валовая прибыль</div>
              <div className="text-lg font-bold text-green-600">₱{(overallTotals.totalSales - overallTotals.totalCost).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Расходы</div>
              <div className="text-lg font-bold text-red-600">₱{(overallTotals.totalPurchases + overallTotals.totalSalaries + overallTotals.totalOther).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Чистая прибыль</div>
              <div className="text-lg font-bold">
                ₱{(overallTotals.totalSales - overallTotals.totalCost - overallTotals.totalPurchases - overallTotals.totalSalaries - overallTotals.totalOther).toLocaleString()}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions for Admin */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Button
          variant="outline"
          className="h-16 flex flex-col gap-1 border-green-500/50 hover:bg-green-50 dark:hover:bg-green-950"
          onClick={() => setShowCashDialog(true)}
        >
          <Wallet className="w-5 h-5 text-green-600" />
          <span className="text-sm">Внести кассу</span>
        </Button>
        <Button
          variant="outline"
          className="h-16 flex flex-col gap-1 border-purple-500/50 hover:bg-purple-50 dark:hover:bg-purple-950"
          onClick={() => setShowExpenseDialog(true)}
        >
          <Receipt className="w-5 h-5 text-purple-600" />
          <span className="text-sm">Расход</span>
        </Button>
        <Button
          variant="outline"
          className="h-16 flex flex-col gap-1 border-orange-500/50 hover:bg-orange-50 dark:hover:bg-orange-950"
          onClick={() => setShowPurchaseDialog(true)}
        >
          <Package className="w-5 h-5 text-orange-600" />
          <span className="text-sm">Закупки</span>
        </Button>
        <Button
          variant="outline"
          className="h-16 flex flex-col gap-1 border-blue-500/50 hover:bg-blue-50 dark:hover:bg-blue-950"
          onClick={() => setShowSalaryDialog(true)}
        >
          <Users className="w-5 h-5 text-blue-600" />
          <span className="text-sm">Зарплаты</span>
        </Button>
      </div>

      {/* History Table */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">История</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2">Дата</th>
                  <th className="text-right py-2 px-2">Продажи</th>
                  <th className="text-right py-2 px-2">Расходы</th>
                  <th className="text-right py-2 px-2">Касса</th>
                  <th className="text-right py-2 px-2">Расх.</th>
                </tr>
              </thead>
              <tbody>
                {records.slice(0, 30).map((record) => {
                  const totalExp = record.purchases + record.salaries + record.other_expenses;
                  return (
                    <tr key={record.id} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-2">{record.date}</td>
                      <td className="text-right py-2 px-2 text-green-600">₱{record.expected_sales.toLocaleString()}</td>
                      <td className="text-right py-2 px-2 text-red-600">₱{totalExp.toLocaleString()}</td>
                      <td className="text-right py-2 px-2">
                        {record.actual_cash != null ? `₱${record.actual_cash.toLocaleString()}` : '—'}
                      </td>
                      <td className={cn(
                        "text-right py-2 px-2",
                        record.discrepancy === 0 ? "text-green-600" :
                        record.discrepancy && record.discrepancy < 0 ? "text-red-600" : "text-green-600"
                      )}>
                        {record.discrepancy != null ? (
                          record.discrepancy === 0 ? '✓' : 
                          (record.discrepancy > 0 ? '+' : '') + `₱${record.discrepancy.toLocaleString()}`
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

      {/* Expenses Detail */}
      {expenses.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Последние расходы</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {expenses.slice(0, 20).map((expense) => {
              const record = records.find(r => r.id === expense.cash_register_id);
              return (
                <div key={expense.id} className="flex items-center justify-between p-2 bg-secondary/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    {getCategoryIcon(expense.category)}
                    <div>
                      <div className="font-medium">₱{expense.amount.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">
                        {record?.date} • {expense.description || getCategoryLabel(expense.category)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {getCategoryLabel(expense.category)}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => deleteExpense(expense.id, expense.category, expense.amount)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
