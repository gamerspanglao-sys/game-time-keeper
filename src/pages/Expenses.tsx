import { useState, useEffect } from 'react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Loader2, Pencil, Trash2, Plus, Receipt, Search, CalendarIcon, Download, ShoppingCart, Wallet, Coffee, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Expense {
  id: string;
  cash_register_id: string;
  category: string;
  amount: number;
  description: string | null;
  shift: string;
  created_at: string;
}

// Categories organized by accounting type
const RETURNABLE_CATEGORIES = [
  { value: 'purchases', label: 'Закупки товара', icon: ShoppingCart }
];

const NON_RETURNABLE_CATEGORIES = [
  { value: 'salaries', label: 'Зарплаты', icon: Users },
  { value: 'advance', label: 'Аванс', icon: Wallet },
  { value: 'employee_food', label: 'Еда сотрудников', icon: Coffee },
  { value: 'food_hunters', label: 'Food Hunters', icon: Coffee },
  { value: 'other', label: 'Прочее', icon: Receipt }
];

const ALL_CATEGORIES = [...RETURNABLE_CATEGORIES, ...NON_RETURNABLE_CATEGORIES];

const CATEGORY_LABELS: Record<string, string> = {
  purchases: 'Закупки',
  salaries: 'Зарплаты',
  other: 'Прочее',
  employee_food: 'Еда сотрудников',
  food_hunters: 'Food Hunters',
  advance: 'Аванс'
};

const CATEGORY_COLORS: Record<string, string> = {
  purchases: 'bg-orange-500/20 text-orange-500 border-orange-500/30',
  salaries: 'bg-blue-500/20 text-blue-500 border-blue-500/30',
  other: 'bg-purple-500/20 text-purple-500 border-purple-500/30',
  employee_food: 'bg-green-500/20 text-green-500 border-green-500/30',
  food_hunters: 'bg-pink-500/20 text-pink-500 border-pink-500/30',
  advance: 'bg-cyan-500/20 text-cyan-500 border-cyan-500/30'
};

const isReturnable = (category: string) => RETURNABLE_CATEGORIES.some(c => c.value === category);

type DatePreset = 'today' | 'week' | 'month' | 'custom';

export default function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('all');
  
  // Date filters
  const today = new Date();
  const [datePreset, setDatePreset] = useState<DatePreset>('week');
  const [dateFrom, setDateFrom] = useState<Date>(startOfWeek(today, { weekStartsOn: 1 }));
  const [dateTo, setDateTo] = useState<Date>(endOfWeek(today, { weekStartsOn: 1 }));
  
  // Edit dialog
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');
  
  // Add dialog
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newAmount, setNewAmount] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState('other');
  const [newDate, setNewDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [newShift, setNewShift] = useState<'day' | 'night'>('day');

  const applyDatePreset = (preset: DatePreset) => {
    setDatePreset(preset);
    const now = new Date();
    
    switch (preset) {
      case 'today':
        setDateFrom(now);
        setDateTo(now);
        break;
      case 'week':
        setDateFrom(startOfWeek(now, { weekStartsOn: 1 }));
        setDateTo(endOfWeek(now, { weekStartsOn: 1 }));
        break;
      case 'month':
        setDateFrom(startOfMonth(now));
        setDateTo(endOfMonth(now));
        break;
    }
  };

  const loadExpenses = async () => {
    setLoading(true);
    try {
      const fromStr = format(dateFrom, 'yyyy-MM-dd');
      const toStr = format(dateTo, 'yyyy-MM-dd');
      
      const { data, error } = await supabase
        .from('cash_expenses')
        .select('*')
        .gte('created_at', `${fromStr}T00:00:00`)
        .lte('created_at', `${toStr}T23:59:59`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setExpenses(data || []);
    } catch (error) {
      console.error('Error loading expenses:', error);
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExpenses();
  }, [dateFrom, dateTo]);

  // Filter expenses based on tab and search
  const getFilteredExpenses = () => {
    return expenses.filter(e => {
      const matchesSearch = !searchTerm || 
        e.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        CATEGORY_LABELS[e.category]?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = filterCategory === 'all' || e.category === filterCategory;
      
      let matchesTab = true;
      if (activeTab === 'returnable') {
        matchesTab = isReturnable(e.category);
      } else if (activeTab === 'non-returnable') {
        matchesTab = !isReturnable(e.category);
      }
      
      return matchesSearch && matchesCategory && matchesTab;
    });
  };

  const filteredExpenses = getFilteredExpenses();

  // Calculate totals
  const totalAmount = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const returnableTotal = expenses.filter(e => isReturnable(e.category)).reduce((sum, e) => sum + e.amount, 0);
  const nonReturnableTotal = expenses.filter(e => !isReturnable(e.category)).reduce((sum, e) => sum + e.amount, 0);
  
  const categoryTotals = filteredExpenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {} as Record<string, number>);

  const openEditDialog = (expense: Expense) => {
    setEditingExpense(expense);
    setEditAmount(expense.amount.toString());
    setEditDescription(expense.description || '');
    setEditCategory(expense.category);
    setShowEditDialog(true);
  };

  const saveEdit = async () => {
    if (!editingExpense) return;

    try {
      const newAmount = parseInt(editAmount);
      if (isNaN(newAmount) || newAmount <= 0) {
        toast.error('Введите корректную сумму');
        return;
      }

      const amountDiff = newAmount - editingExpense.amount;
      const categoryChanged = editCategory !== editingExpense.category;

      const { error } = await supabase
        .from('cash_expenses')
        .update({
          amount: newAmount,
          description: editDescription || null,
          category: editCategory
        })
        .eq('id', editingExpense.id);

      if (error) throw error;

      if (amountDiff !== 0 || categoryChanged) {
        const { data: record } = await supabase
          .from('cash_register')
          .select('*')
          .eq('id', editingExpense.cash_register_id)
          .maybeSingle();

        if (record) {
          const updates: Record<string, number> = {};

          if (categoryChanged) {
            const oldField = editingExpense.category === 'purchases' ? 'purchases' : 
                           editingExpense.category === 'salaries' || editingExpense.category === 'advance' ? 'salaries' : 'other_expenses';
            updates[oldField] = Math.max(0, (record[oldField] || 0) - editingExpense.amount);
            
            const newField = editCategory === 'purchases' ? 'purchases' : 
                           editCategory === 'salaries' || editCategory === 'advance' ? 'salaries' : 'other_expenses';
            updates[newField] = (record[newField] || 0) + newAmount;
          } else if (amountDiff !== 0) {
            const field = editCategory === 'purchases' ? 'purchases' : 
                         editCategory === 'salaries' || editCategory === 'advance' ? 'salaries' : 'other_expenses';
            updates[field] = Math.max(0, (record[field] || 0) + amountDiff);
          }

          if (Object.keys(updates).length > 0) {
            await supabase
              .from('cash_register')
              .update(updates)
              .eq('id', record.id);
          }
        }
      }

      toast.success('Расход обновлен');
      setShowEditDialog(false);
      loadExpenses();
    } catch (error) {
      console.error('Error updating expense:', error);
      toast.error('Ошибка обновления');
    }
  };

  const deleteExpense = async (expense: Expense) => {
    if (!confirm('Удалить этот расход?')) return;

    try {
      await supabase
        .from('cash_expenses')
        .delete()
        .eq('id', expense.id);

      const { data: record } = await supabase
        .from('cash_register')
        .select('*')
        .eq('id', expense.cash_register_id)
        .maybeSingle();

      if (record) {
        const field = expense.category === 'purchases' ? 'purchases' : 
                     expense.category === 'salaries' || expense.category === 'advance' ? 'salaries' : 'other_expenses';
        await supabase
          .from('cash_register')
          .update({ [field]: Math.max(0, (record[field] || 0) - expense.amount) })
          .eq('id', record.id);
      }

      toast.success('Удалено');
      loadExpenses();
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast.error('Ошибка удаления');
    }
  };

  const addExpense = async () => {
    const amount = parseInt(newAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Введите корректную сумму');
      return;
    }

    try {
      let { data: existing } = await supabase
        .from('cash_register')
        .select('id')
        .eq('date', newDate)
        .eq('shift', newShift)
        .maybeSingle();

      if (!existing) {
        const { data: created, error: createError } = await supabase
          .from('cash_register')
          .insert({ date: newDate, shift: newShift })
          .select('id')
          .single();
        if (createError) throw createError;
        existing = created;
      }

      await supabase
        .from('cash_expenses')
        .insert({
          cash_register_id: existing.id,
          category: newCategory,
          amount,
          description: newDescription || null,
          shift: newShift
        });

      const field = newCategory === 'purchases' ? 'purchases' : 
                   newCategory === 'salaries' || newCategory === 'advance' ? 'salaries' : 'other_expenses';
      
      const { data: record } = await supabase
        .from('cash_register')
        .select(field)
        .eq('id', existing.id)
        .single();

      await supabase
        .from('cash_register')
        .update({ [field]: ((record as any)?.[field] || 0) + amount })
        .eq('id', existing.id);

      toast.success('Расход добавлен');
      setShowAddDialog(false);
      setNewAmount('');
      setNewDescription('');
      loadExpenses();
    } catch (error) {
      console.error('Error adding expense:', error);
      toast.error('Ошибка добавления');
    }
  };

  const exportToExcel = () => {
    const fromStr = format(dateFrom, 'dd.MM.yyyy');
    const toStr = format(dateTo, 'dd.MM.yyyy');
    
    // Group by category type
    const returnableExpenses = filteredExpenses.filter(e => isReturnable(e.category));
    const nonReturnableExpenses = filteredExpenses.filter(e => !isReturnable(e.category));
    
    const rows: any[] = [];
    
    // Header
    rows.push(['Расходы', `${fromStr} - ${toStr}`]);
    rows.push([]);
    
    // Returnable section
    rows.push(['ОБОРОТНЫЕ (Returnable)']);
    rows.push(['Дата', 'Смена', 'Категория', 'Описание', 'Сумма']);
    returnableExpenses.forEach(e => {
      rows.push([
        format(new Date(e.created_at), 'dd.MM.yyyy'),
        e.shift === 'day' ? 'День' : 'Ночь',
        CATEGORY_LABELS[e.category] || e.category,
        e.description || '',
        e.amount
      ]);
    });
    rows.push(['', '', '', 'Итого оборотные:', returnableTotal]);
    rows.push([]);
    
    // Non-returnable section
    rows.push(['НЕВОЗВРАТНЫЕ (Non-returnable)']);
    rows.push(['Дата', 'Смена', 'Категория', 'Описание', 'Сумма']);
    nonReturnableExpenses.forEach(e => {
      rows.push([
        format(new Date(e.created_at), 'dd.MM.yyyy'),
        e.shift === 'day' ? 'День' : 'Ночь',
        CATEGORY_LABELS[e.category] || e.category,
        e.description || '',
        e.amount
      ]);
    });
    rows.push(['', '', '', 'Итого невозвратные:', nonReturnableTotal]);
    rows.push([]);
    
    // Summary by category
    rows.push(['ИТОГО ПО КАТЕГОРИЯМ']);
    Object.entries(categoryTotals).forEach(([cat, total]) => {
      rows.push([CATEGORY_LABELS[cat] || cat, '', '', '', total]);
    });
    rows.push(['', '', '', 'ОБЩИЙ ИТОГ:', totalAmount]);
    
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Расходы');
    XLSX.writeFile(wb, `expenses_${format(dateFrom, 'yyyy-MM-dd')}_${format(dateTo, 'yyyy-MM-dd')}.xlsx`);
    
    toast.success('Экспорт завершен');
  };

  const renderExpenseTable = (expenseList: Expense[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="text-left py-3 px-4 font-semibold">Дата</th>
            <th className="text-left py-3 px-4 font-semibold">Смена</th>
            <th className="text-left py-3 px-4 font-semibold">Категория</th>
            <th className="text-left py-3 px-4 font-semibold">Описание</th>
            <th className="text-right py-3 px-4 font-semibold">Сумма</th>
            <th className="py-3 px-4 w-24"></th>
          </tr>
        </thead>
        <tbody>
          {expenseList.map((expense) => (
            <tr key={expense.id} className="border-b hover:bg-muted/50">
              <td className="py-3 px-4">{format(new Date(expense.created_at), 'dd.MM.yyyy')}</td>
              <td className="py-3 px-4">
                <Badge variant="outline" className="text-xs">
                  {expense.shift === 'day' ? '☀️ День' : '🌙 Ночь'}
                </Badge>
              </td>
              <td className="py-3 px-4">
                <Badge className={cn("border", CATEGORY_COLORS[expense.category] || 'bg-muted text-muted-foreground')}>
                  {CATEGORY_LABELS[expense.category] || expense.category}
                </Badge>
              </td>
              <td className="py-3 px-4 text-muted-foreground max-w-xs truncate">
                {expense.description || '—'}
              </td>
              <td className="text-right py-3 px-4 font-medium">₱{expense.amount.toLocaleString()}</td>
              <td className="py-3 px-4">
                <div className="flex gap-1 justify-end">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(expense)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => deleteExpense(expense)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4 p-4">
      {/* Header with Date Filter */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-4 items-end justify-between">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex gap-1">
              <Button 
                size="sm" 
                variant={datePreset === 'today' ? 'default' : 'outline'}
                onClick={() => applyDatePreset('today')}
              >
                Сегодня
              </Button>
              <Button 
                size="sm" 
                variant={datePreset === 'week' ? 'default' : 'outline'}
                onClick={() => applyDatePreset('week')}
              >
                Неделя
              </Button>
              <Button 
                size="sm" 
                variant={datePreset === 'month' ? 'default' : 'outline'}
                onClick={() => applyDatePreset('month')}
              >
                Месяц
              </Button>
            </div>
            
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <CalendarIcon className="w-4 h-4" />
                    {format(dateFrom, 'dd.MM.yy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-popover" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={(d) => { if (d) { setDateFrom(d); setDatePreset('custom'); }}}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              <span className="text-muted-foreground">—</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <CalendarIcon className="w-4 h-4" />
                    {format(dateTo, 'dd.MM.yy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-popover" align="start">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={(d) => { if (d) { setDateTo(d); setDatePreset('custom'); }}}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportToExcel} className="gap-2">
              <Download className="w-4 h-4" />
              Excel
            </Button>
            <Button onClick={() => setShowAddDialog(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Добавить
            </Button>
          </div>
        </div>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
          <CardContent className="py-4 px-4">
            <div className="flex items-center gap-3">
              <Receipt className="w-8 h-8 text-purple-500" />
              <div>
                <div className="text-sm text-muted-foreground">Всего расходов</div>
                <div className="text-2xl font-bold">₱{(returnableTotal + nonReturnableTotal).toLocaleString()}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20">
          <CardContent className="py-4 px-4">
            <div className="flex items-center gap-3">
              <ShoppingCart className="w-8 h-8 text-orange-500" />
              <div>
                <div className="text-sm text-muted-foreground">Оборотные</div>
                <div className="text-2xl font-bold">₱{returnableTotal.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Закупки товара</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/20">
          <CardContent className="py-4 px-4">
            <div className="flex items-center gap-3">
              <Wallet className="w-8 h-8 text-red-500" />
              <div>
                <div className="text-sm text-muted-foreground">Невозвратные</div>
                <div className="text-2xl font-bold">₱{nonReturnableTotal.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Зарплаты, еда, прочее</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Category Filter */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Поиск</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Поиск..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-48 pl-9"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Категория</Label>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-48 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">Все категории</SelectItem>
                {ALL_CATEGORIES.map(cat => (
                  <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Expenses Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="all" className="gap-2">
            <Receipt className="w-4 h-4" />
            Все ({expenses.length})
          </TabsTrigger>
          <TabsTrigger value="returnable" className="gap-2">
            <ShoppingCart className="w-4 h-4" />
            Оборотные ({expenses.filter(e => isReturnable(e.category)).length})
          </TabsTrigger>
          <TabsTrigger value="non-returnable" className="gap-2">
            <Wallet className="w-4 h-4" />
            Невозвратные ({expenses.filter(e => !isReturnable(e.category)).length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-0">
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredExpenses.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">Нет расходов</div>
              ) : (
                renderExpenseTable(filteredExpenses)
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="returnable" className="mt-0">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-orange-500" />
                Оборотные расходы (Закупки)
              </CardTitle>
              <p className="text-sm text-muted-foreground">Расходы на товар, которые возвращаются через продажи</p>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredExpenses.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">Нет оборотных расходов</div>
              ) : (
                renderExpenseTable(filteredExpenses)
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="non-returnable" className="mt-0">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Wallet className="w-5 h-5 text-red-500" />
                Невозвратные расходы
              </CardTitle>
              <p className="text-sm text-muted-foreground">Зарплаты, еда сотрудников и прочие операционные расходы</p>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredExpenses.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">Нет невозвратных расходов</div>
              ) : (
                renderExpenseTable(filteredExpenses)
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Category Breakdown */}
      {Object.keys(categoryTotals).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">По категориям</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.entries(categoryTotals).map(([cat, total]) => (
                <div key={cat} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <Badge className={cn("border", CATEGORY_COLORS[cat] || 'bg-muted')}>
                    {CATEGORY_LABELS[cat] || cat}
                  </Badge>
                  <span className="font-semibold">₱{total.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="bg-background">
          <DialogHeader>
            <DialogTitle>Редактировать расход</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Категория</Label>
              <Select value={editCategory} onValueChange={setEditCategory}>
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="" disabled className="text-muted-foreground">— Оборотные —</SelectItem>
                  {RETURNABLE_CATEGORIES.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                  <SelectItem value="" disabled className="text-muted-foreground">— Невозвратные —</SelectItem>
                  {NON_RETURNABLE_CATEGORIES.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Сумма (₱)</Label>
              <Input
                type="number"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Описание</Label>
              <Input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Необязательно"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowEditDialog(false)}>Отмена</Button>
              <Button onClick={saveEdit}>Сохранить</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-background">
          <DialogHeader>
            <DialogTitle>Добавить расход</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Дата</Label>
                <Input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Смена</Label>
                <Select value={newShift} onValueChange={(v) => setNewShift(v as 'day' | 'night')}>
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="day">☀️ День</SelectItem>
                    <SelectItem value="night">🌙 Ночь</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Категория</Label>
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="" disabled className="text-muted-foreground font-semibold">— Оборотные —</SelectItem>
                  {RETURNABLE_CATEGORIES.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                  <SelectItem value="" disabled className="text-muted-foreground font-semibold">— Невозвратные —</SelectItem>
                  {NON_RETURNABLE_CATEGORIES.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Сумма (₱)</Label>
              <Input
                type="number"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>Описание</Label>
              <Input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Необязательно"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>Отмена</Button>
              <Button onClick={addExpense}>Добавить</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
