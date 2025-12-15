import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { 
  TrendingUp, 
  ShoppingCart,
  Users,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  Lock,
  EyeOff,
  Download,
  FileSpreadsheet,
  Wallet,
  Receipt,
  Package,
  Coffee,
  Send,
  X,
  Loader2
} from 'lucide-react';

// ============= TYPES =============

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

interface PurchaseItem {
  name: string;
  totalQuantity: number;
  avgPerDay: number;
  recommendedQty: number;
  inStock: number;
  toOrder: number;
  caseSize: number;
  casesToOrder: number;
  category: string;
  supplier?: string;
  note?: string;
}

interface PurchaseData {
  period: { days: number; deliveryBuffer?: number };
  totalReceipts: number;
  towerSales?: number;
  basketSales?: number;
  recommendations: PurchaseItem[];
}

// ============= CONSTANTS =============

const ADMIN_PIN = '8808';

const SUPPLIER_CONFIG: Record<string, { label: string; color: string }> = {
  'San Miguel': { label: 'San Miguel (Beer)', color: 'bg-amber-500/20 text-amber-500 border-amber-500/30' },
  'Tanduay': { label: 'Tanduay', color: 'bg-orange-500/20 text-orange-500 border-orange-500/30' },
  'Soft Drinks': { label: 'Soft Drinks', color: 'bg-blue-500/20 text-blue-500 border-blue-500/30' },
  'Snacks': { label: 'Snacks', color: 'bg-purple-500/20 text-purple-500 border-purple-500/30' },
  'Others': { label: 'Others', color: 'bg-muted text-muted-foreground border-muted' },
};

export default function Finance() {
  const [activeTab, setActiveTab] = useState('cash');
  
  // ============= CASH REGISTER STATE =============
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
  const [showPurchaseExpenseDialog, setShowPurchaseExpenseDialog] = useState(false);
  const [showSalaryDialog, setShowSalaryDialog] = useState(false);
  
  // Admin mode
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [pendingAdminAction, setPendingAdminAction] = useState<'purchase' | 'salary' | 'admin' | null>(null);
  
  // Google Sheets
  const [exportingToSheets, setExportingToSheets] = useState(false);

  // ============= PURCHASE ORDERS STATE =============
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [sendingPurchase, setSendingPurchase] = useState(false);
  const [sendingCash, setSendingCash] = useState(false);
  const [purchaseData, setPurchaseData] = useState<PurchaseData | null>(null);
  const [removedItems, setRemovedItems] = useState<Set<string>>(new Set());
  const [showAllItems, setShowAllItems] = useState(true);

  // ============= EFFECTS =============

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

  // ============= CASH REGISTER FUNCTIONS =============

  const CACHE_KEY_RECORDS = 'cash_register_records';
  const CACHE_KEY_EXPENSES = 'cash_register_expenses';
  const CACHE_KEY_LAST_SYNC = 'cash_register_last_sync';

  const loadData = async (forceRefresh = false) => {
    try {
      const cachedRecords = localStorage.getItem(CACHE_KEY_RECORDS);
      const cachedExpenses = localStorage.getItem(CACHE_KEY_EXPENSES);
      const lastSync = localStorage.getItem(CACHE_KEY_LAST_SYNC);
      const now = Date.now();
      const cacheMaxAge = 5 * 60 * 1000;

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

      localStorage.setItem(CACHE_KEY_RECORDS, JSON.stringify(recordsData || []));
      localStorage.setItem(CACHE_KEY_EXPENSES, JSON.stringify(expensesData || []));
      localStorage.setItem(CACHE_KEY_LAST_SYNC, now.toString());

      setRecords(recordsData || []);
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
        setShowPurchaseExpenseDialog(true);
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

  const syncSalesFromLoyverse = async (date: string) => {
    setSyncing(true);
    try {
      const targetDate = new Date(date + 'T00:00:00');
      const startDate = new Date(targetDate.getTime());
      startDate.setHours(5 - 8, 0, 0, 0);
      const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
      
      const { data, error } = await supabase.functions.invoke('loyverse-payments', {
        body: { startDate: startDate.toISOString(), endDate: endDate.toISOString() }
      });

      if (error) throw error;

      if (data?.summary) {
        const { data: existing } = await supabase
          .from('cash_register')
          .select('id, purchases, salaries, other_expenses')
          .eq('date', date)
          .single();

        if (existing) {
          await supabase
            .from('cash_register')
            .update({
              expected_sales: data.summary.netAmount || 0,
              cost: data.summary.totalCost || 0,
            })
            .eq('id', existing.id);
        } else {
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
      let { data: existing } = await supabase
        .from('cash_register')
        .select('*')
        .eq('date', date)
        .single();

      if (!existing) {
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
        await supabase
          .from('cash_expenses')
          .insert({
            cash_register_id: existing.id,
            category,
            amount,
            description
          });

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

  const handleAddPurchaseExpense = () => {
    const amount = parseInt(expenseAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter valid amount');
      return;
    }
    addExpense('purchases', amount, expenseDescription);
    setExpenseAmount('');
    setExpenseDescription('');
    setShowPurchaseExpenseDialog(false);
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
      case 'purchases': return 'Purchases';
      case 'salaries': return 'Salaries';
      case 'other': return 'Other';
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

  // ============= PURCHASE ORDERS FUNCTIONS =============

  const fetchPurchaseData = async () => {
    setPurchaseLoading(true);
    setRemovedItems(new Set());
    
    try {
      const { data: response, error } = await supabase.functions.invoke('loyverse-purchase-request');

      if (error) throw error;
      if (!response.success) throw new Error(response.error);

      setPurchaseData(response);
      toast.success(`Analyzed ${response.totalReceipts} receipts, ${response.recommendations.length} products`);
    } catch (error: any) {
      console.error('Error fetching purchase data:', error);
      toast.error(error.message || 'Failed to fetch data');
    } finally {
      setPurchaseLoading(false);
    }
  };

  const sendToTelegram = async (action: 'purchase' | 'cash') => {
    const isCash = action === 'cash';
    if (isCash) {
      setSendingCash(true);
    } else {
      setSendingPurchase(true);
    }
    
    try {
      const { data: response, error } = await supabase.functions.invoke('telegram-notify', {
        body: { action }
      });

      if (error) throw error;
      if (!response.success) throw new Error(response.error || 'Failed to send');

      toast.success(isCash ? 'Cash report sent to Telegram' : 'Purchase order sent to Telegram');
    } catch (error: any) {
      console.error('Error sending to Telegram:', error);
      toast.error(error.message || 'Failed to send to Telegram');
    } finally {
      if (isCash) {
        setSendingCash(false);
      } else {
        setSendingPurchase(false);
      }
    }
  };

  const removeItem = (itemName: string) => {
    setRemovedItems(prev => new Set([...prev, itemName]));
  };

  const cleanProductName = (name: string) => {
    return name
      .replace(/\s*\(from towers\)/gi, '')
      .replace(/\s*\(from baskets\)/gi, '')
      .trim();
  };

  const filteredRecommendations = purchaseData?.recommendations
    .filter(item => !removedItems.has(item.name) && (showAllItems || item.toOrder > 0))
    .sort((a, b) => {
      const categoryOrder = ['beer', 'spirits', 'cocktails', 'soft', 'other'];
      const catA = categoryOrder.indexOf(a.category);
      const catB = categoryOrder.indexOf(b.category);
      if (catA !== catB) return catA - catB;
      if (b.toOrder !== a.toOrder) return b.toOrder - a.toOrder;
      return cleanProductName(a.name).localeCompare(cleanProductName(b.name));
    }) || [];

  const exportPurchaseToCSV = () => {
    if (!purchaseData) return;

    const headers = ['Item', 'Supplier', 'Sold (3d)', 'Avg/Day', 'In Stock', 'Need', 'Case Size', 'Cases'];
    const rows = filteredRecommendations.map(item => [
      cleanProductName(item.name),
      item.supplier || 'Other',
      item.totalQuantity,
      item.avgPerDay,
      item.inStock,
      item.toOrder,
      item.caseSize,
      item.casesToOrder,
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `purchase-order-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalUnits = filteredRecommendations.reduce((sum, item) => sum + item.toOrder, 0);
  const totalCases = filteredRecommendations.reduce((sum, item) => sum + item.casesToOrder, 0);

  const supplierOrder = ['San Miguel', 'Tanduay', 'Soft Drinks', 'Snacks', 'Others'];
  const groupedBySupplier = filteredRecommendations.reduce((acc, item) => {
    const supplier = item.supplier || 'Other';
    if (!acc[supplier]) acc[supplier] = [];
    acc[supplier].push(item);
    return acc;
  }, {} as Record<string, PurchaseItem[]>);
  
  const sortedSuppliers = Object.keys(groupedBySupplier).sort((a, b) => {
    return supplierOrder.indexOf(a) - supplierOrder.indexOf(b);
  });

  // ============= RENDER =============

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

  // ============= DIALOGS (shared) =============

  const renderDialogs = () => (
    <>
      {/* Cash Input Dialog */}
      <Dialog open={showCashDialog} onOpenChange={setShowCashDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-green-600" />
              Enter Cash
            </DialogTitle>
            <DialogDescription>
              Enter the actual cash amount in register
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Input
              type="number"
              placeholder="Amount"
              value={actualCashInput}
              onChange={(e) => setActualCashInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveActualCash()}
              className="text-2xl h-14 text-center"
              autoFocus
            />
            <Button onClick={saveActualCash} className="w-full h-12 bg-green-600 hover:bg-green-700">
              Save
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
              Add Expense
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Input
              type="number"
              placeholder="Amount"
              value={expenseAmount}
              onChange={(e) => setExpenseAmount(e.target.value)}
              className="text-xl h-12"
              autoFocus
            />
            <Input
              placeholder="Description (what was bought?)"
              value={expenseDescription}
              onChange={(e) => setExpenseDescription(e.target.value)}
            />
            <Button onClick={handleAddExpense} className="w-full h-12 bg-purple-600 hover:bg-purple-700">
              Add
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Purchase Expense Dialog (Admin) */}
      <Dialog open={showPurchaseExpenseDialog} onOpenChange={setShowPurchaseExpenseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-orange-600" />
              Add Purchase
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Input
              type="number"
              placeholder="Amount"
              value={expenseAmount}
              onChange={(e) => setExpenseAmount(e.target.value)}
              className="text-xl h-12"
              autoFocus
            />
            <Input
              placeholder="Description"
              value={expenseDescription}
              onChange={(e) => setExpenseDescription(e.target.value)}
            />
            <Button onClick={handleAddPurchaseExpense} className="w-full h-12 bg-orange-600 hover:bg-orange-700">
              Add Purchase
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
              Add Salary
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Input
              type="number"
              placeholder="Amount"
              value={expenseAmount}
              onChange={(e) => setExpenseAmount(e.target.value)}
              className="text-xl h-12"
              autoFocus
            />
            <Input
              placeholder="Recipient (name)"
              value={expenseDescription}
              onChange={(e) => setExpenseDescription(e.target.value)}
            />
            <Button onClick={handleAddSalary} className="w-full h-12 bg-blue-600 hover:bg-blue-700">
              Add Salary
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
              Enter PIN
            </DialogTitle>
            <DialogDescription>
              {pendingAdminAction === 'purchase' && 'PIN required to add purchases'}
              {pendingAdminAction === 'salary' && 'PIN required to add salaries'}
              {pendingAdminAction === 'admin' && 'Enter admin mode'}
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
              Confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );

  // ============= CASH REGISTER VIEW =============

  const renderCashRegister = () => {
    // Employee View
    if (!isAdminMode) {
      return (
        <div className="space-y-6 max-w-2xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold">Cash Register</h2>
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
                    <div className="text-xs text-muted-foreground">Sales</div>
                    <div className="text-xl font-bold text-green-600">₱{todayRecord.expected_sales.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Expenses</div>
                    <div className="text-xl font-bold text-red-600">₱{todayTotalExpenses.toLocaleString()}</div>
                  </div>
                  {todayRecord.actual_cash != null && (
                    <>
                      <div>
                        <div className="text-xs text-muted-foreground">In Register</div>
                        <div className="text-xl font-bold">₱{todayRecord.actual_cash.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Discrepancy</div>
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

          {/* Big Action Buttons */}
          <div className="grid grid-cols-2 gap-4">
            <Button
              variant="default"
              className="h-24 flex flex-col gap-2 text-lg font-semibold bg-green-600 hover:bg-green-700"
              onClick={() => setShowCashDialog(true)}
            >
              <Wallet className="w-8 h-8" />
              Enter Cash
            </Button>

            <Button
              variant="default"
              className="h-24 flex flex-col gap-2 text-lg font-semibold bg-purple-600 hover:bg-purple-700"
              onClick={() => setShowExpenseDialog(true)}
            >
              <Receipt className="w-8 h-8" />
              Expense
            </Button>

            <Button
              variant="outline"
              className="h-24 flex flex-col gap-2 text-lg font-semibold border-orange-500/50 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
              onClick={() => requestAdminAction('purchase')}
            >
              <Package className="w-8 h-8" />
              <div className="flex items-center gap-1">
                Purchases
                <Lock className="w-3 h-3" />
              </div>
            </Button>

            <Button
              variant="outline"
              className="h-24 flex flex-col gap-2 text-lg font-semibold border-blue-500/50 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
              onClick={() => requestAdminAction('salary')}
            >
              <Users className="w-8 h-8" />
              <div className="flex items-center gap-1">
                Salaries
                <Lock className="w-3 h-3" />
              </div>
            </Button>
          </div>

          {/* Today's Expenses List */}
          {todayExpenses.length > 0 && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base">Today&apos;s Expenses</CardTitle>
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
        </div>
      );
    }

    // Admin View
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">Cash Register</h2>
            <p className="text-muted-foreground text-sm">Admin Mode</p>
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
              Exit
            </Button>
          </div>
        </div>

        {/* Overall Summary */}
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileSpreadsheet className="w-5 h-5" />
              Total for {records.length} days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <div className="text-xs text-muted-foreground">Sales</div>
                <div className="text-lg font-bold text-green-600">₱{overallTotals.totalSales.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Cost</div>
                <div className="text-lg font-bold text-muted-foreground">₱{overallTotals.totalCost.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Gross Profit</div>
                <div className="text-lg font-bold text-green-600">₱{(overallTotals.totalSales - overallTotals.totalCost).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Expenses</div>
                <div className="text-lg font-bold text-red-600">₱{(overallTotals.totalPurchases + overallTotals.totalSalaries + overallTotals.totalOther).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Net Profit</div>
                <div className="text-lg font-bold">
                  ₱{(overallTotals.totalSales - overallTotals.totalCost - overallTotals.totalPurchases - overallTotals.totalSalaries - overallTotals.totalOther).toLocaleString()}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Button
            variant="outline"
            className="h-16 flex flex-col gap-1 border-green-500/50 hover:bg-green-50 dark:hover:bg-green-950"
            onClick={() => setShowCashDialog(true)}
          >
            <Wallet className="w-5 h-5 text-green-600" />
            <span className="text-sm">Enter Cash</span>
          </Button>
          <Button
            variant="outline"
            className="h-16 flex flex-col gap-1 border-purple-500/50 hover:bg-purple-50 dark:hover:bg-purple-950"
            onClick={() => setShowExpenseDialog(true)}
          >
            <Receipt className="w-5 h-5 text-purple-600" />
            <span className="text-sm">Expense</span>
          </Button>
          <Button
            variant="outline"
            className="h-16 flex flex-col gap-1 border-orange-500/50 hover:bg-orange-50 dark:hover:bg-orange-950"
            onClick={() => setShowPurchaseExpenseDialog(true)}
          >
            <Package className="w-5 h-5 text-orange-600" />
            <span className="text-sm">Purchases</span>
          </Button>
          <Button
            variant="outline"
            className="h-16 flex flex-col gap-1 border-blue-500/50 hover:bg-blue-50 dark:hover:bg-blue-950"
            onClick={() => setShowSalaryDialog(true)}
          >
            <Users className="w-5 h-5 text-blue-600" />
            <span className="text-sm">Salaries</span>
          </Button>
        </div>

        {/* History Table */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">Date</th>
                    <th className="text-right py-2 px-2">Sales</th>
                    <th className="text-right py-2 px-2">Expenses</th>
                    <th className="text-right py-2 px-2">Cash</th>
                    <th className="text-right py-2 px-2">Diff</th>
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
              <CardTitle className="text-base">Recent Expenses</CardTitle>
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
  };

  // ============= PURCHASE ORDERS VIEW =============

  const renderPurchaseOrders = () => (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Purchase Order</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Based on {purchaseData?.period.days || 3}-day sales analysis
          </p>
        </div>
        
        <div className="flex flex-wrap gap-3 items-center">
          <Button 
            onClick={fetchPurchaseData} 
            disabled={purchaseLoading} 
            size="lg"
            className="shadow-lg hover:shadow-xl transition-shadow"
          >
            {purchaseLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShoppingCart className="h-4 w-4 mr-2" />}
            Generate
          </Button>

          {purchaseData && filteredRecommendations.length > 0 && (
            <Button variant="outline" onClick={exportPurchaseToCSV} className="shadow-sm">
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
          )}
          
          {purchaseData && (
            <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
              <Switch 
                id="show-all" 
                checked={showAllItems} 
                onCheckedChange={setShowAllItems}
              />
              <Label htmlFor="show-all" className="text-sm cursor-pointer">
                {showAllItems ? "All" : "Order only"}
              </Label>
            </div>
          )}
        </div>
      </div>

      {/* Telegram Buttons */}
      <div className="flex flex-wrap gap-3">
        <Button 
          variant="outline" 
          onClick={() => sendToTelegram('purchase')} 
          disabled={sendingPurchase}
          className="bg-blue-500/10 border-blue-500/30 text-blue-500 hover:bg-blue-500/20 hover:text-blue-400"
        >
          {sendingPurchase ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
          Send Order
        </Button>
        <Button 
          variant="outline" 
          onClick={() => sendToTelegram('cash')} 
          disabled={sendingCash}
          className="bg-green-500/10 border-green-500/30 text-green-500 hover:bg-green-500/20 hover:text-green-400"
        >
          {sendingCash ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
          Send Cash Report
        </Button>
      </div>

      {purchaseData && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-card to-muted/30 border-0 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Analysis Period
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{purchaseData.period.days} <span className="text-lg font-normal text-muted-foreground">days</span></p>
                <p className="text-xs text-muted-foreground mt-1">
                  +{purchaseData.period.deliveryBuffer || 2} days buffer
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-card to-muted/30 border-0 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Receipts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{purchaseData.totalReceipts.toLocaleString()}</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-primary uppercase tracking-wide">
                  Units to Order
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-primary">{totalUnits}</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-card to-muted/30 border-0 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Cases
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{totalCases}</p>
              </CardContent>
            </Card>
          </div>

          {/* Supplier Groups */}
          {sortedSuppliers.map((supplier) => {
            const items = groupedBySupplier[supplier];
            const supplierConfig = SUPPLIER_CONFIG[supplier] || SUPPLIER_CONFIG['Others'];
            const typedItems = items as PurchaseItem[];
            const supplierCases = typedItems.reduce((sum, item) => sum + item.casesToOrder, 0);
            
            return (
              <Card key={supplier} className="shadow-md border-0 overflow-hidden">
                <CardHeader className="pb-3 bg-gradient-to-r from-muted/50 to-transparent">
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge className={cn("text-sm px-3 py-1", supplierConfig.color)}>
                        {supplierConfig.label}
                      </Badge>
                      <span className="text-muted-foreground text-sm font-normal">
                        {typedItems.length} items
                      </span>
                    </div>
                    <div className="text-sm font-medium text-muted-foreground">
                      {supplierCases} cases
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {typedItems.map((item, index) => (
                      <div
                        key={index}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg gap-2 transition-all",
                          item.toOrder > 0 
                            ? "bg-gradient-to-r from-primary/5 to-transparent border border-primary/10" 
                            : "bg-muted/30"
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {cleanProductName(item.name)}
                          </div>
                          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                            <span>S:{item.totalQuantity}</span>
                            <span>A:{item.avgPerDay}/d</span>
                            <span className={cn(
                              "font-medium",
                              item.inStock >= item.recommendedQty ? "text-green-500" : item.inStock > 0 ? "text-amber-500" : "text-red-500"
                            )}>St:{item.inStock}</span>
                          </div>
                          {item.note && (
                            <div className="text-xs text-primary/80 truncate italic">
                              {item.note}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className={cn(
                            "text-center px-2 py-1 rounded min-w-[45px]",
                            item.toOrder > 0 ? "bg-primary/10" : "bg-muted/50"
                          )}>
                            <div className="text-[10px] text-muted-foreground">NEED</div>
                            <div className={cn(
                              "text-base font-bold",
                              item.toOrder > 0 ? "text-primary" : "text-muted-foreground"
                            )}>{item.toOrder}</div>
                          </div>
                          {item.caseSize > 1 && (
                            <div className="text-center px-2 py-1 rounded bg-muted/50 min-w-[50px]">
                              <div className="text-[10px] text-muted-foreground">CS({item.caseSize})</div>
                              <div className="text-base font-bold">{item.casesToOrder}</div>
                            </div>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 rounded-full"
                            onClick={() => removeItem(item.name)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {filteredRecommendations.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                {removedItems.size > 0 
                  ? "All items removed. Click Generate to refresh."
                  : "All items in stock!"
                }
              </CardContent>
            </Card>
          )}
        </>
      )}

      {!purchaseData && !purchaseLoading && (
        <Card>
          <CardContent className="py-12 text-center">
            <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Generate Purchase Order</h3>
            <p className="text-muted-foreground mb-4">
              Analyzes 7-day sales, compares with current stock, and recommends what to order.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );

  // ============= MAIN RENDER =============

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="cash" className="flex items-center gap-2">
            <Wallet className="w-4 h-4" />
            Cash
          </TabsTrigger>
          <TabsTrigger value="purchases" className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" />
            Orders
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cash">
          {renderCashRegister()}
        </TabsContent>

        <TabsContent value="purchases">
          {renderPurchaseOrders()}
        </TabsContent>
      </Tabs>

      {renderDialogs()}
    </div>
  );
}
