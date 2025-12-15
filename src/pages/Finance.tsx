import React, { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { EmployeeShiftCard } from '@/components/staff/EmployeeShiftCard';
import { EmployeeManagement } from '@/components/staff/EmployeeManagement';
import { PayrollReport } from '@/components/staff/PayrollReport';
import { ActivityLog } from '@/components/ActivityLog';
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
  Loader2,
  Sun,
  Moon,
  Pencil,
  ClipboardList,
  CalendarIcon
} from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// ============= TYPES =============

type ShiftType = 'day' | 'night';

// Regular employee expense types
const EXPENSE_TYPES = [
  { value: 'employee_food', label: 'Employee Food', category: 'other' as const },
  { value: 'food_hunters', label: 'Food Hunters', category: 'other' as const },
  { value: 'other', label: 'Other', category: 'other' as const },
];

// Admin-only expense types
const ADMIN_EXPENSE_TYPES = [
  { value: 'purchases', label: 'Purchases', category: 'purchases' as const },
  { value: 'advance', label: 'Advance (Salary)', category: 'salaries' as const },
];

// All expense types combined for lookup
const ALL_EXPENSE_TYPES = [...EXPENSE_TYPES, ...ADMIN_EXPENSE_TYPES];

interface CashRecord {
  id: string;
  date: string;
  shift: ShiftType;
  opening_balance: number;
  expected_sales: number;
  cash_expected: number | null;
  gcash_expected: number | null;
  cost: number;
  actual_cash: number | null;
  cash_actual: number | null;
  gcash_actual: number | null;
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
  shift: ShiftType;
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

// Get current shift based on Manila time
const getCurrentShift = (): ShiftType => {
  const now = new Date();
  const manilaOffset = 8 * 60;
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const manilaTime = new Date(utcTime + (manilaOffset * 60000));
  const hour = manilaTime.getHours();
  // Day shift: 5AM - 5PM, Night shift: 5PM - 5AM
  return hour >= 5 && hour < 17 ? 'day' : 'night';
};

// Get current date for the shift (night shift after midnight belongs to previous day)
const getShiftDate = (): string => {
  const now = new Date();
  const manilaOffset = 8 * 60;
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const manilaTime = new Date(utcTime + (manilaOffset * 60000));
  const hour = manilaTime.getHours();
  
  // If it's between midnight and 5AM, we're still in the night shift of the previous day
  if (hour < 5) {
    manilaTime.setDate(manilaTime.getDate() - 1);
  }
  
  return format(manilaTime, 'yyyy-MM-dd');
};

export default function Finance() {
  const [activeTab, setActiveTab] = useState('shifts');
  
  // ============= CASH REGISTER STATE =============
  const [records, setRecords] = useState<CashRecord[]>([]);
  const [expenses, setExpenses] = useState<CashExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [selectedShift, setSelectedShift] = useState<ShiftType>(getCurrentShift());
  const [actualCashInput, setActualCashInput] = useState<string>('');
  const [expenseAmount, setExpenseAmount] = useState<string>('');
  const [expenseDescription, setExpenseDescription] = useState<string>('');
  const [expenseDate, setExpenseDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [expenseShift, setExpenseShift] = useState<ShiftType>(getCurrentShift());
  const [expenseType, setExpenseType] = useState<string>('other');
  const [expenseResponsible, setExpenseResponsible] = useState<string>('');
  const [employeesList, setEmployeesList] = useState<{id: string, name: string}[]>([]);
  const [syncing, setSyncing] = useState(false);
  
  // Date range filter for stats
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  
  // Dialogs
  const [showCashDialog, setShowCashDialog] = useState(false);
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [showPurchaseExpenseDialog, setShowPurchaseExpenseDialog] = useState(false);
  const [showSalaryDialog, setShowSalaryDialog] = useState(false);
  const [recentExpenses, setRecentExpenses] = useState<Array<{id: string; amount: number; description: string | null; category: string; shift: string; created_at: string}>>([]);
  
  // Admin mode
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [pendingAdminAction, setPendingAdminAction] = useState<'purchase' | 'salary' | 'admin' | null>(null);
  const [viewMode, setViewMode] = useState<'shifts' | 'daily'>('daily'); // Default to daily view
  
  // Edit cash record
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingRecord, setEditingRecord] = useState<CashRecord | null>(null);
  const [editSales, setEditSales] = useState('');
  const [editCost, setEditCost] = useState('');
  const [editActualCash, setEditActualCash] = useState('');
  const [editPurchases, setEditPurchases] = useState('');
  const [editSalaries, setEditSalaries] = useState('');
  const [editOther, setEditOther] = useState('');
  
  // Google Sheets
  const [exportingToSheets, setExportingToSheets] = useState(false);

  // ============= PURCHASE ORDERS STATE =============
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [sendingPurchase, setSendingPurchase] = useState(false);
  const [sendingCash, setSendingCash] = useState(false);
  const [purchaseData, setPurchaseData] = useState<PurchaseData | null>(null);
  const [removedItems, setRemovedItems] = useState<Set<string>>(new Set());
  const [showAllItems, setShowAllItems] = useState(true);

  // ============= SYNC FUNCTIONS =============

  // Throttled sync - max once per 2 minutes to avoid rate limits
  const lastSyncRef = useRef<number>(0);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const syncToGoogleSheets = useCallback(async (force = false) => {
    const now = Date.now();
    const minInterval = 120000; // 2 minutes
    
    // If not forced and called too recently, skip
    if (!force && now - lastSyncRef.current < minInterval) {
      console.log('📊 Skipping auto-sync (rate limited)');
      return;
    }
    
    try {
      lastSyncRef.current = now;
      const { error } = await supabase.functions.invoke('google-sheets-sync');
      if (error) throw error;
      console.log('📊 Synced to Google Sheets');
    } catch (error) {
      console.error('Error syncing to Google Sheets:', error);
    }
  }, []);

  // Debounced sync for realtime changes - waits 30s after last change
  const debouncedSync = useCallback(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    syncTimeoutRef.current = setTimeout(() => {
      syncToGoogleSheets(false);
    }, 30000); // 30 second debounce
  }, [syncToGoogleSheets]);

  // ============= EFFECTS =============

  const loadEmployees = async () => {
    const { data } = await supabase
      .from('employees')
      .select('id, name')
      .eq('active', true)
      .order('name');
    if (data) setEmployeesList(data);
  };

  const loadRecentExpenses = async () => {
    const { data } = await supabase
      .from('cash_expenses')
      .select('id, amount, description, category, shift, created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    if (data) setRecentExpenses(data);
  };

  useEffect(() => {
    loadData();
    loadEmployees();
    loadRecentExpenses();
    
    const channel = supabase
      .channel('cash-register-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_register' }, () => {
        loadData(true);
        debouncedSync();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_expenses' }, () => {
        loadData(true);
        loadRecentExpenses();
        debouncedSync();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [debouncedSync]);

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
        .order('date', { ascending: false })
        .order('shift', { ascending: true });

      if (recordsError) throw recordsError;
      
      const { data: expensesData, error: expensesError } = await supabase
        .from('cash_expenses')
        .select('*')
        .order('created_at', { ascending: false });

      if (expensesError) throw expensesError;

      localStorage.setItem(CACHE_KEY_RECORDS, JSON.stringify(recordsData || []));
      localStorage.setItem(CACHE_KEY_EXPENSES, JSON.stringify(expensesData || []));
      localStorage.setItem(CACHE_KEY_LAST_SYNC, now.toString());

      setRecords((recordsData || []) as CashRecord[]);
      setExpenses((expensesData || []) as CashExpense[]);
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

  const syncSalesFromLoyverse = async (date: string, shift: ShiftType) => {
    setSyncing(true);
    try {
      const targetDate = new Date(date + 'T00:00:00');
      let startDate: Date;
      let endDate: Date;
      
      if (shift === 'day') {
        // Day shift: 5AM to 5PM Manila
        startDate = new Date(targetDate.getTime());
        startDate.setHours(5 - 8, 0, 0, 0); // 5AM Manila = -3 UTC
        endDate = new Date(startDate.getTime() + 12 * 60 * 60 * 1000);
      } else {
        // Night shift: 5PM to 5AM next day Manila
        startDate = new Date(targetDate.getTime());
        startDate.setHours(17 - 8, 0, 0, 0); // 5PM Manila = 9 UTC
        endDate = new Date(startDate.getTime() + 12 * 60 * 60 * 1000);
      }
      
      const { data, error } = await supabase.functions.invoke('loyverse-payments', {
        body: { startDate: startDate.toISOString(), endDate: endDate.toISOString() }
      });

      if (error) throw error;

      if (data?.summary) {
        const { data: existing } = await supabase
          .from('cash_register')
          .select('id, purchases, salaries, other_expenses')
          .eq('date', date)
          .eq('shift', shift)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('cash_register')
            .update({
              expected_sales: Math.round(data.summary.netAmount || 0),
              cost: Math.round(data.summary.totalCost || 0),
            })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('cash_register')
            .insert({
              date,
              shift,
              opening_balance: 0,
              expected_sales: Math.round(data.summary.netAmount || 0),
              cost: Math.round(data.summary.totalCost || 0),
            });
        }
        
        await loadData(true);
        toast.success(`Synced ${shift} shift: ₱${data.summary.netAmount?.toLocaleString() || 0}`);
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
    const date = getShiftDate();
    const shift = getCurrentShift();

    try {
      let { data: existing } = await supabase
        .from('cash_register')
        .select('*')
        .eq('date', date)
        .eq('shift', shift)
        .maybeSingle();

      if (!existing) {
        await syncSalesFromLoyverse(date, shift);
        
        const { data: newRecord } = await supabase
          .from('cash_register')
          .select('*')
          .eq('date', date)
          .eq('shift', shift)
          .maybeSingle();
        
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

        toast.success(`Cash saved for ${shift} shift`);
        setActualCashInput('');
        setShowCashDialog(false);
        loadData(true);
      }
    } catch (error) {
      console.error('Error saving cash:', error);
      toast.error('Failed to save');
    }
  };

  const addExpense = async (category: 'purchases' | 'salaries' | 'other', amount: number, description: string, date: string, shift: ShiftType) => {

    try {
      let { data: existing } = await supabase
        .from('cash_register')
        .select('*')
        .eq('date', date)
        .eq('shift', shift)
        .maybeSingle();

      if (!existing) {
        const { data: newRecord } = await supabase
          .from('cash_register')
          .insert({
            date,
            shift,
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
            description,
            shift
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
    const typeConfig = ALL_EXPENSE_TYPES.find(t => t.value === expenseType) || EXPENSE_TYPES[2];
    const responsibleName = employeesList.find(e => e.id === expenseResponsible)?.name || '';
    const parts = [`[${typeConfig.label}]`];
    if (responsibleName) parts.push(`@${responsibleName}`);
    if (expenseDescription) parts.push(expenseDescription);
    const fullDescription = parts.join(' ').trim();
    addExpense(typeConfig.category, amount, fullDescription, expenseDate, expenseShift);
    setExpenseAmount('');
    setExpenseDescription('');
    setExpenseDate(format(new Date(), 'yyyy-MM-dd'));
    setExpenseShift(getCurrentShift());
    setExpenseType('other');
    setExpenseResponsible('');
    setShowExpenseDialog(false);
  };


  const handleAddPurchaseExpense = () => {
    const amount = parseInt(expenseAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter valid amount');
      return;
    }
    addExpense('purchases', amount, expenseDescription, expenseDate, expenseShift);
    setExpenseAmount('');
    setExpenseDescription('');
    setExpenseDate(format(new Date(), 'yyyy-MM-dd'));
    setExpenseShift(getCurrentShift());
    setShowPurchaseExpenseDialog(false);
  };

  const handleAddSalary = () => {
    const amount = parseInt(expenseAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter valid amount');
      return;
    }
    addExpense('salaries', amount, expenseDescription, expenseDate, expenseShift);
    setExpenseAmount('');
    setExpenseDescription('');
    setExpenseDate(format(new Date(), 'yyyy-MM-dd'));
    setExpenseShift(getCurrentShift());
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
      loadRecentExpenses();
      loadData(true);
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast.error('Failed to delete');
    }
  };

  const openEditDialog = (record: CashRecord) => {
    setEditingRecord(record);
    setEditSales(record.expected_sales.toString());
    setEditCost((record.cost || 0).toString());
    setEditActualCash(record.actual_cash?.toString() || '');
    setEditPurchases(record.purchases.toString());
    setEditSalaries(record.salaries.toString());
    setEditOther(record.other_expenses.toString());
    setShowEditDialog(true);
  };

  const saveEditedRecord = async () => {
    if (!editingRecord) return;

    try {
      const sales = parseInt(editSales) || 0;
      const cost = parseInt(editCost) || 0;
      const actualCash = editActualCash ? parseInt(editActualCash) : null;
      const purchases = parseInt(editPurchases) || 0;
      const salaries = parseInt(editSalaries) || 0;
      const other = parseInt(editOther) || 0;
      
      const totalExpenses = purchases + salaries + other;
      const expectedCash = editingRecord.opening_balance + sales - totalExpenses;
      const discrepancy = actualCash !== null ? actualCash - expectedCash : null;

      await supabase
        .from('cash_register')
        .update({
          expected_sales: sales,
          cost: cost,
          actual_cash: actualCash,
          purchases: purchases,
          salaries: salaries,
          other_expenses: other,
          discrepancy: discrepancy
        })
        .eq('id', editingRecord.id);

      toast.success('Record updated');
      setShowEditDialog(false);
      setEditingRecord(null);
      loadData(true);
    } catch (error) {
      console.error('Error updating record:', error);
      toast.error('Failed to update');
    }
  };

  // Calculate today's summary for current shift
  const currentDate = getShiftDate();
  const currentShift = getCurrentShift();
  const todayRecord = records.find(r => r.date === currentDate && r.shift === currentShift);
  const todayExpenses = expenses.filter(e => {
    const record = records.find(r => r.id === e.cash_register_id);
    return record?.date === currentDate && record?.shift === currentShift;
  });
  const todayTotalExpenses = (todayRecord?.purchases || 0) + (todayRecord?.salaries || 0) + (todayRecord?.other_expenses || 0);

  // Filter records by date range
  const filteredRecords = React.useMemo(() => {
    return records.filter(r => {
      if (dateFrom && r.date < dateFrom) return false;
      if (dateTo && r.date > dateTo) return false;
      return true;
    });
  }, [records, dateFrom, dateTo]);

  // Overall totals for summary (using filtered records)
  const overallTotals = filteredRecords.reduce((acc, r) => ({
    totalSales: acc.totalSales + r.expected_sales,
    totalCost: acc.totalCost + (r.cost || 0),
    totalPurchases: acc.totalPurchases + r.purchases,
    totalSalaries: acc.totalSalaries + r.salaries,
    totalOther: acc.totalOther + r.other_expenses,
    totalDiscrepancy: acc.totalDiscrepancy + (r.discrepancy || 0),
    daysWithDiscrepancy: acc.daysWithDiscrepancy + (r.discrepancy && r.discrepancy !== 0 ? 1 : 0)
  }), { totalSales: 0, totalCost: 0, totalPurchases: 0, totalSalaries: 0, totalOther: 0, totalDiscrepancy: 0, daysWithDiscrepancy: 0 });

  // Daily aggregated records (combines day + night shifts into single daily record)
  interface DailyRecord {
    date: string;
    expected_sales: number;
    cost: number;
    purchases: number;
    salaries: number;
    other_expenses: number;
    actual_cash: number | null;
    discrepancy: number | null;
    shifts: number; // how many shifts have data
  }

  const dailyRecords = React.useMemo(() => {
    const dailyMap = new Map<string, DailyRecord>();
    
    filteredRecords.forEach(r => {
      const existing = dailyMap.get(r.date);
      if (existing) {
        existing.expected_sales += r.expected_sales;
        existing.cost += (r.cost || 0);
        existing.purchases += r.purchases;
        existing.salaries += r.salaries;
        existing.other_expenses += r.other_expenses;
        existing.shifts += 1;
        // Combine actual cash if both shifts have it
        if (r.actual_cash != null) {
          existing.actual_cash = (existing.actual_cash || 0) + r.actual_cash;
        }
        if (r.discrepancy != null) {
          existing.discrepancy = (existing.discrepancy || 0) + r.discrepancy;
        }
      } else {
        dailyMap.set(r.date, {
          date: r.date,
          expected_sales: r.expected_sales,
          cost: r.cost || 0,
          purchases: r.purchases,
          salaries: r.salaries,
          other_expenses: r.other_expenses,
          actual_cash: r.actual_cash,
          discrepancy: r.discrepancy,
          shifts: 1
        });
      }
    });
    
    return Array.from(dailyMap.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredRecords]);

  const exportToCSV = () => {
    if (records.length === 0) {
      toast.error('No records to export');
      return;
    }
    
    const headers = ['Date', 'Shift', 'Sales', 'Cost', 'Gross Profit', 'Purchases', 'Salaries', 'Other', 'Total Expenses', 'Net Profit', 'Actual Cash', 'Discrepancy'];
    const sortedRecords = [...records].sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.shift.localeCompare(b.shift);
    });
    const wsData: (string | number)[][] = [headers];
    
    sortedRecords.forEach(r => {
      const totalExp = r.purchases + r.salaries + r.other_expenses;
      const grossProfit = r.expected_sales - (r.cost || 0);
      const netProfit = grossProfit - totalExp;
      wsData.push([
        r.date,
        r.shift === 'day' ? 'Day (5AM-5PM)' : 'Night (5PM-5AM)',
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
              Enter Cash - {currentShift === 'day' ? 'Day Shift' : 'Night Shift'}
            </DialogTitle>
            <DialogDescription>
              Enter the actual cash amount for {currentShift} shift ({currentShift === 'day' ? '5AM-5PM' : '5PM-5AM'})
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
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="flex-1 justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(new Date(expenseDate), 'dd.MM.yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-50" align="start">
                  <Calendar
                    mode="single"
                    selected={new Date(expenseDate)}
                    onSelect={(date) => date && setExpenseDate(format(date, 'yyyy-MM-dd'))}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              <Select value={expenseShift} onValueChange={(v) => setExpenseShift(v as ShiftType)}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-50 bg-background">
                  <SelectItem value="day">
                    <span className="flex items-center gap-2">
                      <Sun className="w-4 h-4" /> Day
                    </span>
                  </SelectItem>
                  <SelectItem value="night">
                    <span className="flex items-center gap-2">
                      <Moon className="w-4 h-4" /> Night
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Select value={expenseType} onValueChange={setExpenseType}>
                <SelectTrigger className="flex-1 h-12">
                  <SelectValue placeholder="Expense Type" />
                </SelectTrigger>
                <SelectContent className="z-50 bg-background">
                  {EXPENSE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={expenseResponsible || 'none'} onValueChange={(v) => setExpenseResponsible(v === 'none' ? '' : v)}>
                <SelectTrigger className="flex-1 h-12">
                  <SelectValue placeholder="Responsible" />
                </SelectTrigger>
                <SelectContent className="z-50 bg-background">
                  <SelectItem value="none">None</SelectItem>
                  {employeesList.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input
              type="number"
              placeholder="Amount"
              value={expenseAmount}
              onChange={(e) => setExpenseAmount(e.target.value)}
              className="text-xl h-12"
            />
            <Input
              placeholder="Description (optional)"
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
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="flex-1 justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(new Date(expenseDate), 'dd.MM.yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-50" align="start">
                  <Calendar
                    mode="single"
                    selected={new Date(expenseDate)}
                    onSelect={(date) => date && setExpenseDate(format(date, 'yyyy-MM-dd'))}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              <Select value={expenseShift} onValueChange={(v) => setExpenseShift(v as ShiftType)}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-50 bg-background">
                  <SelectItem value="day">
                    <span className="flex items-center gap-2">
                      <Sun className="w-4 h-4" /> Day
                    </span>
                  </SelectItem>
                  <SelectItem value="night">
                    <span className="flex items-center gap-2">
                      <Moon className="w-4 h-4" /> Night
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
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
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="flex-1 justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(new Date(expenseDate), 'dd.MM.yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-50" align="start">
                  <Calendar
                    mode="single"
                    selected={new Date(expenseDate)}
                    onSelect={(date) => date && setExpenseDate(format(date, 'yyyy-MM-dd'))}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              <Select value={expenseShift} onValueChange={(v) => setExpenseShift(v as ShiftType)}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-50 bg-background">
                  <SelectItem value="day">
                    <span className="flex items-center gap-2">
                      <Sun className="w-4 h-4" /> Day
                    </span>
                  </SelectItem>
                  <SelectItem value="night">
                    <span className="flex items-center gap-2">
                      <Moon className="w-4 h-4" /> Night
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
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

      {/* Edit Cash Record Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5" />
              Edit Record - {editingRecord?.date} ({editingRecord?.shift === 'day' ? 'Day' : 'Night'})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Sales</Label>
                <Input
                  type="number"
                  value={editSales}
                  onChange={(e) => setEditSales(e.target.value)}
                  className="h-10"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Cost</Label>
                <Input
                  type="number"
                  value={editCost}
                  onChange={(e) => setEditCost(e.target.value)}
                  className="h-10"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Actual Cash</Label>
              <Input
                type="number"
                value={editActualCash}
                onChange={(e) => setEditActualCash(e.target.value)}
                placeholder="Not entered"
                className="h-10"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-orange-500">Purchases</Label>
                <Input
                  type="number"
                  value={editPurchases}
                  onChange={(e) => setEditPurchases(e.target.value)}
                  className="h-10"
                />
              </div>
              <div>
                <Label className="text-xs text-blue-500">Salaries</Label>
                <Input
                  type="number"
                  value={editSalaries}
                  onChange={(e) => setEditSalaries(e.target.value)}
                  className="h-10"
                />
              </div>
              <div>
                <Label className="text-xs text-purple-500">Other</Label>
                <Input
                  type="number"
                  value={editOther}
                  onChange={(e) => setEditOther(e.target.value)}
                  className="h-10"
                />
              </div>
            </div>
            <Button onClick={saveEditedRecord} className="w-full h-12">
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );

  // ============= CASH REGISTER VIEW =============

  const renderCashRegister = () => {
    // Employee View - simplified, no duplicate cash entry
    if (!isAdminMode) {
      return (
        <div className="space-y-4 max-w-2xl mx-auto">
          {/* Header with Admin Toggle */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Cash Register</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => requestAdminAction('admin')}
              className="gap-2"
            >
              <Lock className="w-4 h-4" />
              Admin
            </Button>
          </div>

          {/* Today's Summary Card - only if has data */}
          {todayRecord && todayRecord.expected_sales > 0 && (
            <Card className="bg-secondary/30">
              <CardContent className="py-3">
                <div className="flex items-center gap-4 flex-wrap">
                  <div>
                    <div className="text-xs text-muted-foreground">Sales</div>
                    <div className="text-lg font-bold text-green-600">₱{todayRecord.expected_sales.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Expenses</div>
                    <div className="text-lg font-bold text-red-600">₱{todayTotalExpenses.toLocaleString()}</div>
                  </div>
                  {todayRecord.actual_cash != null && todayRecord.discrepancy !== null && (
                    <div>
                      <div className="text-xs text-muted-foreground">Discrepancy</div>
                      <div className={cn(
                        "text-lg font-bold",
                        todayRecord.discrepancy === 0 ? "text-green-600" :
                        todayRecord.discrepancy < 0 ? "text-red-600" : "text-amber-600"
                      )}>
                        {todayRecord.discrepancy === 0 ? '✓ OK' : 
                          (todayRecord.discrepancy > 0 ? '+' : '') + 
                          '₱' + todayRecord.discrepancy.toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Expense Buttons */}
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              className="h-16 flex flex-col gap-1 border-purple-500/30 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950"
              onClick={() => setShowExpenseDialog(true)}
            >
              <Receipt className="w-5 h-5" />
              <span className="text-xs">Expense</span>
            </Button>

            <Button
              variant="outline"
              className="h-16 flex flex-col gap-1 border-orange-500/30 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
              onClick={() => requestAdminAction('purchase')}
            >
              <Package className="w-5 h-5" />
              <span className="text-xs flex items-center gap-0.5">Purchase <Lock className="w-2.5 h-2.5" /></span>
            </Button>

            <Button
              variant="outline"
              className="h-16 flex flex-col gap-1 border-blue-500/30 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
              onClick={() => requestAdminAction('salary')}
            >
              <Users className="w-5 h-5" />
              <span className="text-xs flex items-center gap-0.5">Salary <Lock className="w-2.5 h-2.5" /></span>
            </Button>
          </div>

          {/* Recent Expenses List */}
          {recentExpenses.length > 0 && (
            <Card>
              <CardHeader className="py-2 pb-1">
                <CardTitle className="text-sm font-medium text-muted-foreground">Recent Expenses</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 pt-0">
                {recentExpenses.map((expense) => (
                  <div key={expense.id} className="flex items-center justify-between py-2 px-2 bg-secondary/30 rounded">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Badge variant="outline" className="text-xs shrink-0">
                        {expense.shift === 'day' ? '☀️' : '🌙'}
                      </Badge>
                      <span className="text-sm truncate">{expense.description || expense.category}</span>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <span className="font-medium text-sm whitespace-nowrap">₱{expense.amount.toLocaleString()}</span>
                      {isAdminMode && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => deleteExpense(expense.id, expense.category, expense.amount)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
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
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">Cash Register</h2>
              <p className="text-muted-foreground text-sm">Admin Mode</p>
            </div>
            <div className="flex flex-wrap gap-2">
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
          
          {/* Date Range Filter */}
          <Card className="p-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">From</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-40"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">To</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-40"
                />
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  setDateFrom('');
                  setDateTo(format(new Date(), 'yyyy-MM-dd'));
                }}
              >
                All Time
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  const today = new Date();
                  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
                  setDateFrom(format(firstDay, 'yyyy-MM-dd'));
                  setDateTo(format(today, 'yyyy-MM-dd'));
                }}
              >
                This Month
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  const today = new Date();
                  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
                  setDateFrom(format(weekAgo, 'yyyy-MM-dd'));
                  setDateTo(format(today, 'yyyy-MM-dd'));
                }}
              >
                Last 7 Days
              </Button>
            </div>
          </Card>
          
          {/* Sync Controls */}
          <div className="flex flex-wrap gap-2">
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-40"
            />
            <div className="flex border rounded-md overflow-hidden">
              <Button
                variant={selectedShift === 'day' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-none"
                onClick={() => setSelectedShift('day')}
              >
                <Sun className="w-4 h-4 mr-1" />
                Day
              </Button>
              <Button
                variant={selectedShift === 'night' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-none"
                onClick={() => setSelectedShift('night')}
              >
                <Moon className="w-4 h-4 mr-1" />
                Night
              </Button>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => syncSalesFromLoyverse(selectedDate, selectedShift)}
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
          </div>
        </div>

        {/* Overall Summary */}
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileSpreadsheet className="w-5 h-5" />
              Total for {filteredRecords.length} shifts
              {(dateFrom || dateTo) && (
                <span className="text-sm font-normal text-muted-foreground">
                  ({dateFrom || 'start'} — {dateTo || 'now'})
                </span>
              )}
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
                <div className="text-xs text-muted-foreground">Op. Expenses</div>
                <div className="text-lg font-bold text-red-600">₱{(overallTotals.totalSalaries + overallTotals.totalOther).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Net Profit</div>
                <div className="text-lg font-bold">
                  ₱{(overallTotals.totalSales - overallTotals.totalCost - overallTotals.totalSalaries - overallTotals.totalOther).toLocaleString()}
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
          <CardHeader className="py-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              History ({viewMode === 'daily' ? `${dailyRecords.length} days` : `${filteredRecords.length} shifts`})
            </CardTitle>
            <div className="flex border rounded-md overflow-hidden">
              <Button
                variant={viewMode === 'daily' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-none text-xs"
                onClick={() => setViewMode('daily')}
              >
                By Day
              </Button>
              <Button
                variant={viewMode === 'shifts' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-none text-xs"
                onClick={() => setViewMode('shifts')}
              >
                By Shift
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left py-2 px-2 font-semibold">Date</th>
                    {viewMode === 'shifts' && <th className="text-left py-2 px-2 font-semibold">Shift</th>}
                    <th className="text-right py-2 px-2 font-semibold">Sales</th>
                    <th className="text-right py-2 px-2 font-semibold">Cost</th>
                    <th className="text-right py-2 px-2 font-semibold text-green-600">Gross</th>
                    <th className="text-right py-2 px-2 font-semibold text-orange-500">Purch</th>
                    <th className="text-right py-2 px-2 font-semibold text-blue-500">Salary</th>
                    <th className="text-right py-2 px-2 font-semibold text-purple-500">Other</th>
                    <th className="text-right py-2 px-2 font-semibold text-red-500">Op.Exp</th>
                    <th className="text-right py-2 px-2 font-semibold">Net</th>
                    <th className="text-right py-2 px-2 font-semibold">Cash</th>
                    <th className="text-right py-2 px-2 font-semibold">Diff</th>
                    {viewMode === 'shifts' && <th className="py-2 px-2 font-semibold w-10"></th>}
                  </tr>
                </thead>
                <tbody>
                  {viewMode === 'daily' ? (
                    // Daily aggregated view
                    dailyRecords.map((record) => {
                      const opExpenses = record.salaries + record.other_expenses;
                      const grossProfit = record.expected_sales - record.cost;
                      const netProfit = grossProfit - opExpenses;
                      return (
                        <tr key={record.date} className="border-b hover:bg-muted/50">
                          <td className="py-2 px-2 whitespace-nowrap font-medium">{record.date}</td>
                          <td className="text-right py-2 px-2 text-green-600">₱{record.expected_sales.toLocaleString()}</td>
                          <td className="text-right py-2 px-2 text-muted-foreground">₱{record.cost.toLocaleString()}</td>
                          <td className="text-right py-2 px-2 text-green-600 font-medium">₱{grossProfit.toLocaleString()}</td>
                          <td className="text-right py-2 px-2 text-orange-500">{record.purchases > 0 ? `₱${record.purchases.toLocaleString()}` : '—'}</td>
                          <td className="text-right py-2 px-2 text-blue-500">{record.salaries > 0 ? `₱${record.salaries.toLocaleString()}` : '—'}</td>
                          <td className="text-right py-2 px-2 text-purple-500">{record.other_expenses > 0 ? `₱${record.other_expenses.toLocaleString()}` : '—'}</td>
                          <td className="text-right py-2 px-2 text-red-500 font-medium">₱{opExpenses.toLocaleString()}</td>
                          <td className={cn(
                            "text-right py-2 px-2 font-bold",
                            netProfit >= 0 ? "text-green-600" : "text-red-600"
                          )}>
                            {netProfit >= 0 ? '+' : ''}₱{netProfit.toLocaleString()}
                          </td>
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
                    })
                  ) : (
                    // Shift-by-shift view
                    filteredRecords.map((record) => {
                      const opExpenses = record.salaries + record.other_expenses;
                      const grossProfit = record.expected_sales - (record.cost || 0);
                      const netProfit = grossProfit - opExpenses;
                      return (
                        <tr key={record.id} className="border-b hover:bg-muted/50">
                          <td className="py-2 px-2 whitespace-nowrap">{record.date}</td>
                          <td className="py-2 px-2">
                            <Badge variant={record.shift === 'day' ? 'default' : 'secondary'} className="text-xs">
                              {record.shift === 'day' ? <Sun className="w-3 h-3 mr-1" /> : <Moon className="w-3 h-3 mr-1" />}
                              {record.shift === 'day' ? 'D' : 'N'}
                            </Badge>
                          </td>
                          <td className="text-right py-2 px-2 text-green-600">₱{record.expected_sales.toLocaleString()}</td>
                          <td className="text-right py-2 px-2 text-muted-foreground">₱{(record.cost || 0).toLocaleString()}</td>
                          <td className="text-right py-2 px-2 text-green-600 font-medium">₱{grossProfit.toLocaleString()}</td>
                          <td className="text-right py-2 px-2 text-orange-500">{record.purchases > 0 ? `₱${record.purchases.toLocaleString()}` : '—'}</td>
                          <td className="text-right py-2 px-2 text-blue-500">{record.salaries > 0 ? `₱${record.salaries.toLocaleString()}` : '—'}</td>
                          <td className="text-right py-2 px-2 text-purple-500">{record.other_expenses > 0 ? `₱${record.other_expenses.toLocaleString()}` : '—'}</td>
                          <td className="text-right py-2 px-2 text-red-500 font-medium">₱{opExpenses.toLocaleString()}</td>
                          <td className={cn(
                            "text-right py-2 px-2 font-bold",
                            netProfit >= 0 ? "text-green-600" : "text-red-600"
                          )}>
                            {netProfit >= 0 ? '+' : ''}₱{netProfit.toLocaleString()}
                          </td>
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
                          <td className="py-2 px-2 text-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => openEditDialog(record)}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot className="bg-muted/50 font-bold">
                  <tr className="border-t-2">
                    <td className="py-2 px-2" colSpan={viewMode === 'shifts' ? 2 : 1}>TOTAL</td>
                    <td className="text-right py-2 px-2 text-green-600">₱{overallTotals.totalSales.toLocaleString()}</td>
                    <td className="text-right py-2 px-2 text-muted-foreground">₱{overallTotals.totalCost.toLocaleString()}</td>
                    <td className="text-right py-2 px-2 text-green-600">₱{(overallTotals.totalSales - overallTotals.totalCost).toLocaleString()}</td>
                    <td className="text-right py-2 px-2 text-orange-500">₱{overallTotals.totalPurchases.toLocaleString()}</td>
                    <td className="text-right py-2 px-2 text-blue-500">₱{overallTotals.totalSalaries.toLocaleString()}</td>
                    <td className="text-right py-2 px-2 text-purple-500">₱{overallTotals.totalOther.toLocaleString()}</td>
                    <td className="text-right py-2 px-2 text-red-500">₱{(overallTotals.totalSalaries + overallTotals.totalOther).toLocaleString()}</td>
                    <td className={cn(
                      "text-right py-2 px-2",
                      (overallTotals.totalSales - overallTotals.totalCost - overallTotals.totalSalaries - overallTotals.totalOther) >= 0 
                        ? "text-green-600" : "text-red-600"
                    )}>
                      ₱{(overallTotals.totalSales - overallTotals.totalCost - overallTotals.totalSalaries - overallTotals.totalOther).toLocaleString()}
                    </td>
                    <td className="text-right py-2 px-2">—</td>
                    <td className={cn(
                      "text-right py-2 px-2",
                      overallTotals.totalDiscrepancy >= 0 ? "text-green-600" : "text-red-600"
                    )}>
                      ₱{overallTotals.totalDiscrepancy.toLocaleString()}
                    </td>
                    {viewMode === 'shifts' && <td></td>}
                  </tr>
                </tfoot>
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
                          {record?.date} • {expense.shift === 'day' ? '☀️' : '🌙'} • {expense.description || getCategoryLabel(expense.category)}
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
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        {/* Admin Mode Header */}
        {isAdminMode && (
          <div className="flex items-center justify-between bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-xl px-4 py-3 animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <Lock className="w-4 h-4 text-amber-500" />
              </div>
              <div>
                <span className="text-sm font-semibold text-amber-500">Admin Mode</span>
                <p className="text-xs text-muted-foreground">Full access enabled</p>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setIsAdminMode(false)}
              className="text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 gap-2"
            >
              <EyeOff className="w-4 h-4" />
              Exit
            </Button>
          </div>
        )}

        {/* Tabs Navigation */}
        <TabsList className="grid w-full max-w-2xl grid-cols-4 bg-secondary/50 p-1 rounded-xl">
          <TabsTrigger 
            value="shifts" 
            className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg transition-all"
          >
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">Shifts</span>
          </TabsTrigger>
          <TabsTrigger 
            value="finance" 
            className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg transition-all"
          >
            <Wallet className="w-4 h-4" />
            <span className="hidden sm:inline">Finance</span>
          </TabsTrigger>
          <TabsTrigger 
            value="purchases" 
            className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg transition-all"
          >
            <ShoppingCart className="w-4 h-4" />
            <span className="hidden sm:inline">Orders</span>
          </TabsTrigger>
          <TabsTrigger 
            value="activity" 
            className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg transition-all"
          >
            <ClipboardList className="w-4 h-4" />
            <span className="hidden sm:inline">Activity</span>
          </TabsTrigger>
        </TabsList>

        {/* SHIFTS TAB */}
        <TabsContent value="shifts" className="space-y-6 animate-fade-in">
          <EmployeeShiftCard />
          {isAdminMode && (
            <div className="space-y-4">
              <Tabs defaultValue="employees" className="space-y-4">
                <TabsList className="bg-secondary/30">
                  <TabsTrigger value="employees" className="gap-2">
                    <Users className="w-4 h-4" />
                    Employees
                  </TabsTrigger>
                  <TabsTrigger value="payroll" className="gap-2">
                    <Wallet className="w-4 h-4" />
                    Payroll
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="employees" className="animate-fade-in">
                  <EmployeeManagement />
                </TabsContent>
                <TabsContent value="payroll" className="animate-fade-in">
                  <PayrollReport />
                </TabsContent>
              </Tabs>
            </div>
          )}
        </TabsContent>

        {/* FINANCE TAB */}
        <TabsContent value="finance" className="space-y-6 animate-fade-in">
          {/* Header with Admin Button */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
                Finance
              </h2>
              <p className="text-sm text-muted-foreground">Manage expenses and cash register</p>
            </div>
            {!isAdminMode && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => requestAdminAction('admin')}
                className="gap-2 border-primary/30 hover:border-primary hover:bg-primary/10"
              >
                <Lock className="w-4 h-4" />
                Admin
              </Button>
            )}
          </div>

          {/* Stats Cards Row */}
          {todayRecord && todayRecord.expected_sales > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/5 border-green-500/20 overflow-hidden relative">
                <div className="absolute top-0 right-0 w-20 h-20 bg-green-500/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-green-500" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">Today's Sales</p>
                      <p className="text-2xl font-bold text-green-500">₱{todayRecord.expected_sales.toLocaleString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-red-500/10 to-rose-500/5 border-red-500/20 overflow-hidden relative">
                <div className="absolute top-0 right-0 w-20 h-20 bg-red-500/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                      <Receipt className="w-5 h-5 text-red-500" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">Expenses</p>
                      <p className="text-2xl font-bold text-red-500">₱{todayTotalExpenses.toLocaleString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {todayRecord.discrepancy !== null && (
                <Card className={cn(
                  "overflow-hidden relative",
                  todayRecord.discrepancy === 0 
                    ? "bg-gradient-to-br from-green-500/10 to-emerald-500/5 border-green-500/20"
                    : todayRecord.discrepancy < 0
                    ? "bg-gradient-to-br from-red-500/10 to-rose-500/5 border-red-500/20"
                    : "bg-gradient-to-br from-amber-500/10 to-yellow-500/5 border-amber-500/20"
                )}>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center",
                        todayRecord.discrepancy === 0 ? "bg-green-500/20" :
                        todayRecord.discrepancy < 0 ? "bg-red-500/20" : "bg-amber-500/20"
                      )}>
                        <Wallet className={cn(
                          "w-5 h-5",
                          todayRecord.discrepancy === 0 ? "text-green-500" :
                          todayRecord.discrepancy < 0 ? "text-red-500" : "text-amber-500"
                        )} />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground font-medium">Discrepancy</p>
                        <p className={cn(
                          "text-2xl font-bold",
                          todayRecord.discrepancy === 0 ? "text-green-500" :
                          todayRecord.discrepancy < 0 ? "text-red-500" : "text-amber-500"
                        )}>
                          {todayRecord.discrepancy === 0 ? '✓ OK' : 
                            `${todayRecord.discrepancy > 0 ? '+' : ''}₱${todayRecord.discrepancy.toLocaleString()}`}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Expense Section */}
          <Card className="border-border/50 overflow-hidden">
            <CardHeader className="pb-4 bg-gradient-to-r from-purple-500/5 to-transparent border-b border-border/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                  <Receipt className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <CardTitle className="text-lg">Expenses</CardTitle>
                  <p className="text-xs text-muted-foreground">Add and manage expenses</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              {/* Add Expense Buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Button
                  variant="outline"
                  className="h-20 flex flex-col gap-2 border-purple-500/30 hover:border-purple-500 hover:bg-purple-500/10 transition-all group"
                  onClick={() => setShowExpenseDialog(true)}
                >
                  <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Receipt className="w-4 h-4 text-purple-500" />
                  </div>
                  <span className="text-xs font-medium">Add Expense</span>
                </Button>
                
                {isAdminMode && (
                  <>
                    <Button
                      variant="outline"
                      className="h-20 flex flex-col gap-2 border-orange-500/30 hover:border-orange-500 hover:bg-orange-500/10 transition-all group"
                      onClick={() => setShowPurchaseExpenseDialog(true)}
                    >
                      <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Package className="w-4 h-4 text-orange-500" />
                      </div>
                      <span className="text-xs font-medium">Purchase</span>
                    </Button>
                    <Button
                      variant="outline"
                      className="h-20 flex flex-col gap-2 border-blue-500/30 hover:border-blue-500 hover:bg-blue-500/10 transition-all group"
                      onClick={() => setShowSalaryDialog(true)}
                    >
                      <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Users className="w-4 h-4 text-blue-500" />
                      </div>
                      <span className="text-xs font-medium">Salary</span>
                    </Button>
                  </>
                )}
              </div>

              {/* Recent Expenses List */}
              {recentExpenses.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                      <ClipboardList className="w-4 h-4" />
                      Recent Expenses
                    </h4>
                    <Badge variant="secondary" className="text-xs">Last 10</Badge>
                  </div>
                  <div className="space-y-2">
                    {recentExpenses.map((expense, index) => (
                      <div 
                        key={expense.id} 
                        className="flex items-center justify-between py-3 px-4 bg-secondary/30 hover:bg-secondary/50 rounded-xl transition-all group"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium",
                            expense.shift === 'day' 
                              ? "bg-amber-500/20 text-amber-500" 
                              : "bg-indigo-500/20 text-indigo-500"
                          )}>
                            {expense.shift === 'day' ? '☀️' : '🌙'}
                          </div>
                          <span className="text-sm truncate">{expense.description || expense.category}</span>
                        </div>
                        <div className="flex items-center gap-3 ml-2">
                          <span className="font-semibold text-sm whitespace-nowrap">₱{expense.amount.toLocaleString()}</span>
                          {isAdminMode && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10 transition-all"
                              onClick={() => deleteExpense(expense.id, expense.category, expense.amount)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Admin: Full Cash Register History */}
          {isAdminMode && (
            <Card className="border-border/50 overflow-hidden">
              <CardHeader className="pb-4 bg-gradient-to-r from-green-500/5 to-transparent border-b border-border/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                      <Wallet className="w-5 h-5 text-green-500" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Cash History</CardTitle>
                      <p className="text-xs text-muted-foreground">Recent register entries</p>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => syncToGoogleSheets(true)}
                    disabled={exportingToSheets}
                    className="gap-2"
                  >
                    {exportingToSheets ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                    Sync
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left py-3 px-2 font-semibold text-muted-foreground">Date</th>
                        <th className="text-left py-3 px-2 font-semibold text-muted-foreground">Shift</th>
                        <th className="text-right py-3 px-1 font-semibold text-green-500">
                          <div className="text-xs">Cash</div>
                          <div className="text-[10px] text-muted-foreground">exp / act</div>
                        </th>
                        <th className="text-right py-3 px-1 font-semibold text-blue-500">
                          <div className="text-xs">GCash</div>
                          <div className="text-[10px] text-muted-foreground">exp / act</div>
                        </th>
                        <th className="text-right py-3 px-2 font-semibold text-muted-foreground">Diff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.slice(0, 10).map((record, index) => {
                        return (
                          <tr 
                            key={record.id} 
                            className="border-b border-border/30 hover:bg-secondary/30 transition-colors"
                          >
                            <td className="py-3 px-2 font-medium">{format(new Date(record.date), 'MMM d')}</td>
                            <td className="py-3 px-2">
                              <span className={cn(
                                "inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs",
                                record.shift === 'day' ? "bg-amber-500/20" : "bg-indigo-500/20"
                              )}>
                                {record.shift === 'day' ? '☀️' : '🌙'}
                              </span>
                            </td>
                            <td className="py-3 px-1 text-right">
                              <div className="text-xs text-muted-foreground">
                                {record.cash_expected !== null ? `₱${record.cash_expected.toLocaleString()}` : '-'}
                              </div>
                              <div className="font-semibold text-green-500">
                                {record.cash_actual !== null ? `₱${record.cash_actual.toLocaleString()}` : '-'}
                              </div>
                            </td>
                            <td className="py-3 px-1 text-right">
                              <div className="text-xs text-muted-foreground">
                                {record.gcash_expected !== null ? `₱${record.gcash_expected.toLocaleString()}` : '-'}
                              </div>
                              <div className="font-semibold text-blue-500">
                                {record.gcash_actual !== null && record.gcash_actual > 0 ? `₱${record.gcash_actual.toLocaleString()}` : '-'}
                              </div>
                            </td>
                            <td className={cn(
                              "py-3 px-2 text-right font-bold",
                              record.discrepancy === 0 ? "text-green-500" :
                              record.discrepancy && record.discrepancy < 0 ? "text-red-500" : "text-amber-500"
                            )}>
                              {record.discrepancy !== null ? 
                                (record.discrepancy === 0 ? '✓' : `${record.discrepancy > 0 ? '+' : ''}₱${record.discrepancy}`) 
                                : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ORDERS TAB */}
        <TabsContent value="purchases" className="animate-fade-in">
          {renderPurchaseOrders()}
        </TabsContent>

        {/* ACTIVITY TAB */}
        <TabsContent value="activity" className="animate-fade-in">
          <ActivityLog />
        </TabsContent>
      </Tabs>

      {renderDialogs()}
    </div>
  );
}