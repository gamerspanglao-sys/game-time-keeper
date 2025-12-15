import { useState, useEffect } from 'react';
import { format, subDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  Trash2,
  Lock,
  EyeOff,
  Download,
  FileSpreadsheet
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

const ADMIN_PIN = '8808';

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
  const [expenseEmployeeName, setExpenseEmployeeName] = useState<string>('');
  const [syncing, setSyncing] = useState(false);
  
  // Admin mode
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  useEffect(() => {
    loadData();
    
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
      // Load ALL records for complete history
      const { data: recordsData, error: recordsError } = await supabase
        .from('cash_register')
        .select('*')
        .order('date', { ascending: false });

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
      toast.error('Error loading data');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = () => {
    if (pinInput === ADMIN_PIN) {
      setIsAdminMode(true);
      setShowPinDialog(false);
      setPinInput('');
      setPinError('');
      toast.success('Admin mode enabled');
    } else {
      setPinError('Invalid PIN');
    }
  };

  const syncSalesFromLoyverse = async (date: string) => {
    setSyncing(true);
    try {
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
      
      const prevDate = format(subDays(new Date(date), 1), 'yyyy-MM-dd');
      const { data: prevRecord } = await supabase
        .from('cash_register')
        .select('*')
        .eq('date', prevDate)
        .maybeSingle();

      let openingBalance = 0;
      if (prevRecord && prevRecord.actual_cash != null) {
        openingBalance = prevRecord.actual_cash - (prevRecord.purchases + prevRecord.salaries + prevRecord.other_expenses);
      }

      const { error: upsertError } = await supabase
        .from('cash_register')
        .upsert({
          date,
          opening_balance: openingBalance,
          expected_sales: Math.round(cashSales)
        }, { onConflict: 'date' });

      if (upsertError) throw upsertError;

      toast.success(`Sales synced: ₱${cashSales.toLocaleString()}`);
      loadData();
    } catch (error) {
      console.error('Error syncing sales:', error);
      toast.error('Error syncing sales');
    } finally {
      setSyncing(false);
    }
  };

  const saveActualCash = async () => {
    const amount = parseInt(actualCashInput);
    if (isNaN(amount)) {
      toast.error('Enter a valid amount');
      return;
    }

    try {
      const record = records.find(r => r.date === selectedDate);
      const expectedTotal = (record?.opening_balance || 0) + (record?.expected_sales || 0);
      const totalExp = (record?.purchases || 0) + (record?.salaries || 0) + (record?.other_expenses || 0);
      const discrepancy = amount - (expectedTotal - totalExp);

      const { error } = await supabase
        .from('cash_register')
        .upsert({
          date: selectedDate,
          actual_cash: amount,
          discrepancy,
          opening_balance: record?.opening_balance || 0,
          expected_sales: record?.expected_sales || 0,
          purchases: record?.purchases || 0,
          salaries: record?.salaries || 0,
          other_expenses: record?.other_expenses || 0
        }, { onConflict: 'date' });

      if (error) throw error;

      toast.success('Actual cash saved');
      setActualCashInput('');
      loadData();
    } catch (error) {
      console.error('Error saving actual cash:', error);
      toast.error('Error saving');
    }
  };

  const addExpense = async () => {
    const amount = parseInt(expenseAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (!expenseEmployeeName.trim()) {
      toast.error('Enter your name');
      return;
    }

    try {
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

      const fullDescription = `${expenseEmployeeName}: ${expenseDescription || 'No description'}`;

      const { error: expenseError } = await supabase
        .from('cash_expenses')
        .insert({
          cash_register_id: record.id,
          category: expenseCategory,
          amount,
          description: fullDescription
        });

      if (expenseError) throw expenseError;

      const updateField = expenseCategory === 'purchases' ? 'purchases' : 
                          expenseCategory === 'salaries' ? 'salaries' : 'other_expenses';
      
      const { error: updateError } = await supabase
        .from('cash_register')
        .update({ [updateField]: (record[updateField as keyof CashRecord] as number || 0) + amount })
        .eq('id', record.id);

      if (updateError) throw updateError;

      toast.success('Expense added');
      setShowExpenseDialog(false);
      setExpenseAmount('');
      setExpenseDescription('');
      setExpenseEmployeeName('');
      loadData();
    } catch (error) {
      console.error('Error adding expense:', error);
      toast.error('Error adding expense');
    }
  };

  const deleteExpense = async (expense: CashExpense) => {
    try {
      const { error: deleteError } = await supabase
        .from('cash_expenses')
        .delete()
        .eq('id', expense.id);

      if (deleteError) throw deleteError;

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

      toast.success('Expense deleted');
      loadData();
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast.error('Error deleting');
    }
  };

  const currentRecord = records.find(r => r.date === selectedDate);
  const expectedTotal = (currentRecord?.opening_balance || 0) + (currentRecord?.expected_sales || 0);
  const totalExpenses = (currentRecord?.purchases || 0) + (currentRecord?.salaries || 0) + (currentRecord?.other_expenses || 0);
  const expectedAfterExpenses = expectedTotal - totalExpenses;
  const currentExpenses = expenses.filter(e => e.cash_register_id === currentRecord?.id);

  // Overall totals for summary
  const overallTotals = records.reduce((acc, r) => ({
    totalSales: acc.totalSales + r.expected_sales,
    totalPurchases: acc.totalPurchases + r.purchases,
    totalSalaries: acc.totalSalaries + r.salaries,
    totalOther: acc.totalOther + r.other_expenses,
    totalDiscrepancy: acc.totalDiscrepancy + (r.discrepancy || 0),
    daysWithDiscrepancy: acc.daysWithDiscrepancy + (r.discrepancy && r.discrepancy !== 0 ? 1 : 0)
  }), { totalSales: 0, totalPurchases: 0, totalSalaries: 0, totalOther: 0, totalDiscrepancy: 0, daysWithDiscrepancy: 0 });

  const exportToCSV = () => {
    // Main cash register data
    const headers = ['Date', 'Opening Balance', 'Cash Sales', 'Purchases', 'Salaries', 'Other Expenses', 'Total Expenses', 'Expected', 'Actual', 'Discrepancy'];
    
    // Sort by date ascending for the export
    const sortedRecords = [...records].sort((a, b) => a.date.localeCompare(b.date));
    
    const rows = sortedRecords.map(r => {
      const totalExp = r.purchases + r.salaries + r.other_expenses;
      const expected = r.opening_balance + r.expected_sales - totalExp;
      return [
        r.date,
        r.opening_balance,
        r.expected_sales,
        r.purchases,
        r.salaries,
        r.other_expenses,
        totalExp,
        expected,
        r.actual_cash ?? '',
        r.discrepancy ?? ''
      ].join(',');
    });

    // Add totals row
    const totalsRow = [
      'TOTAL',
      '',
      overallTotals.totalSales,
      overallTotals.totalPurchases,
      overallTotals.totalSalaries,
      overallTotals.totalOther,
      overallTotals.totalPurchases + overallTotals.totalSalaries + overallTotals.totalOther,
      '',
      '',
      overallTotals.totalDiscrepancy
    ].join(',');

    const csv = [headers.join(','), ...rows, '', totalsRow].join('\n');
    
    // Add BOM for Excel to recognize UTF-8
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cash-register-full-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${records.length} records to CSV`);
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'purchases': return 'Purchases';
      case 'salaries': return 'Salaries';
      case 'other': return 'Other';
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

  // Employee View (Limited)
  if (!isAdminMode) {
    return (
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Cash Register</h1>
            <p className="text-muted-foreground text-sm">Employee View</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={showPinDialog} onOpenChange={setShowPinDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Lock className="w-4 h-4 mr-2" />
                  Admin Login
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Enter Admin PIN</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <Input
                    type="password"
                    placeholder="PIN"
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
        </div>

        {/* Simple Cash Input for Employees */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Enter Actual Cash</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Amount in register"
                value={actualCashInput}
                onChange={(e) => setActualCashInput(e.target.value)}
                className="flex-1"
              />
              <Button onClick={saveActualCash}>Save</Button>
            </div>
            {currentRecord?.discrepancy != null && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/50">
                {currentRecord.discrepancy === 0 ? (
                  <>
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="font-medium text-green-600">No discrepancy</span>
                  </>
                ) : currentRecord.discrepancy < 0 ? (
                  <>
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    <span className="font-medium text-red-600">
                      Missing: ₱{Math.abs(currentRecord.discrepancy).toLocaleString()}
                    </span>
                  </>
                ) : (
                  <>
                    <TrendingUp className="w-5 h-5 text-green-600" />
                    <span className="font-medium text-green-600">
                      Overage: ₱{currentRecord.discrepancy.toLocaleString()}
                    </span>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add Expense - Available to All */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Add Expense</CardTitle>
          </CardHeader>
          <CardContent>
            <Dialog open={showExpenseDialog} onOpenChange={setShowExpenseDialog}>
              <DialogTrigger asChild>
                <Button className="w-full" variant="outline">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Expense
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New Expense</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div>
                    <label className="text-sm font-medium">Your Name *</label>
                    <Input
                      placeholder="Enter your name"
                      value={expenseEmployeeName}
                      onChange={(e) => setExpenseEmployeeName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Category</label>
                    <Select value={expenseCategory} onValueChange={(v) => setExpenseCategory(v as any)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="purchases">Purchases</SelectItem>
                        <SelectItem value="salaries">Salaries</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Amount *</label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={expenseAmount}
                      onChange={(e) => setExpenseAmount(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Description</label>
                    <Input
                      placeholder="What was purchased?"
                      value={expenseDescription}
                      onChange={(e) => setExpenseDescription(e.target.value)}
                    />
                  </div>
                  <Button onClick={addExpense} className="w-full">Add</Button>
                </div>
              </DialogContent>
            </Dialog>

            {currentExpenses.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="text-sm font-medium">Today's Expenses:</div>
                {currentExpenses.slice(0, 5).map((expense) => (
                  <div key={expense.id} className="flex items-center justify-between p-2 bg-secondary/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      {getCategoryIcon(expense.category)}
                      <div>
                        <div className="text-sm font-medium">₱{expense.amount.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">
                          {expense.description || getCategoryLabel(expense.category)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Admin View (Full)
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Cash Register</h1>
          <p className="text-muted-foreground text-sm">Admin View - Full Access</p>
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
            onClick={() => syncSalesFromLoyverse(selectedDate)}
            disabled={syncing}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            Sync
          </Button>
          <Button variant="outline" onClick={exportToCSV}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setIsAdminMode(false)}
          >
            <EyeOff className="w-4 h-4 mr-2" />
            Exit
          </Button>
        </div>
      </div>

      {/* Overall Summary - All Time Totals */}
      <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            All-Time Summary ({records.length} days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <div>
              <div className="text-xs text-muted-foreground">Total Sales</div>
              <div className="text-lg font-bold text-green-600">₱{overallTotals.totalSales.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Purchases</div>
              <div className="text-lg font-bold text-red-600">₱{overallTotals.totalPurchases.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Salaries</div>
              <div className="text-lg font-bold text-red-600">₱{overallTotals.totalSalaries.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Other</div>
              <div className="text-lg font-bold text-red-600">₱{overallTotals.totalOther.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Net Total</div>
              <div className="text-lg font-bold">
                ₱{(overallTotals.totalSales - overallTotals.totalPurchases - overallTotals.totalSalaries - overallTotals.totalOther).toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Discrepancies</div>
              <div className={`text-lg font-bold ${overallTotals.totalDiscrepancy < 0 ? 'text-red-600' : overallTotals.totalDiscrepancy > 0 ? 'text-green-600' : ''}`}>
                {overallTotals.totalDiscrepancy >= 0 ? '+' : ''}₱{overallTotals.totalDiscrepancy.toLocaleString()}
                <span className="text-xs text-muted-foreground ml-1">({overallTotals.daysWithDiscrepancy} days)</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Opening Balance
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
              Cash Sales
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
              Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              -₱{totalExpenses.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Purchases: ₱{(currentRecord?.purchases || 0).toLocaleString()} | 
              Salaries: ₱{(currentRecord?.salaries || 0).toLocaleString()} | 
              Other: ₱{(currentRecord?.other_expenses || 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card className={currentRecord?.discrepancy != null && currentRecord?.discrepancy !== 0 ? 
          ((currentRecord?.discrepancy ?? 0) < 0 ? 'border-red-500/50' : 'border-green-500/50') : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calculator className="w-4 h-4" />
              Discrepancy
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
            <CardTitle className="text-lg">Enter Actual Cash</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Expected: <span className="font-bold text-foreground">₱{expectedAfterExpenses.toLocaleString()}</span>
            </div>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Amount in register"
                value={actualCashInput}
                onChange={(e) => setActualCashInput(e.target.value)}
                className="flex-1"
              />
              <Button onClick={saveActualCash}>Save</Button>
            </div>
            {currentRecord?.actual_cash != null && (
              <div className="text-sm">
                Current value: <span className="font-bold">₱{currentRecord?.actual_cash?.toLocaleString()}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add Expense */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Add Expense</CardTitle>
          </CardHeader>
          <CardContent>
            <Dialog open={showExpenseDialog} onOpenChange={setShowExpenseDialog}>
              <DialogTrigger asChild>
                <Button className="w-full" variant="outline">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Expense
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New Expense</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div>
                    <label className="text-sm font-medium">Your Name *</label>
                    <Input
                      placeholder="Enter your name"
                      value={expenseEmployeeName}
                      onChange={(e) => setExpenseEmployeeName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Category</label>
                    <Select value={expenseCategory} onValueChange={(v) => setExpenseCategory(v as any)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="purchases">Purchases</SelectItem>
                        <SelectItem value="salaries">Salaries</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Amount *</label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={expenseAmount}
                      onChange={(e) => setExpenseAmount(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Description</label>
                    <Input
                      placeholder="What was purchased?"
                      value={expenseDescription}
                      onChange={(e) => setExpenseDescription(e.target.value)}
                    />
                  </div>
                  <Button onClick={addExpense} className="w-full">Add</Button>
                </div>
              </DialogContent>
            </Dialog>

            {currentExpenses.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="text-sm font-medium">Today's Expenses:</div>
                {currentExpenses.map((expense) => (
                  <div key={expense.id} className="flex items-center justify-between p-2 bg-secondary/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      {getCategoryIcon(expense.category)}
                      <div>
                        <div className="text-sm font-medium">₱{expense.amount.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">
                          {expense.description || getCategoryLabel(expense.category)}
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

      {/* History Table - Admin Only */}
      <Card>
        <CardHeader>
          <CardTitle>Full History ({records.length} records)</CardTitle>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No records yet. Click "Sync" to load sales data.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">Date</th>
                    <th className="text-right py-2 px-2">Opening</th>
                    <th className="text-right py-2 px-2">Sales</th>
                    <th className="text-right py-2 px-2">Expenses</th>
                    <th className="text-right py-2 px-2">Expected</th>
                    <th className="text-right py-2 px-2">Actual</th>
                    <th className="text-right py-2 px-2">Discrepancy</th>
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
                          {record.actual_cash != null ? `₱${record.actual_cash.toLocaleString()}` : '—'}
                        </td>
                        <td className="text-right py-2 px-2">
                          {record.discrepancy != null ? (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
