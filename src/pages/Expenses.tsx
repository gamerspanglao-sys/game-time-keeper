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
import { toast } from 'sonner';
import { Loader2, Pencil, Trash2, Plus, Receipt, Search, CalendarIcon, Download, ShoppingCart, Wrench, Coffee, TrendingUp, TrendingDown } from 'lucide-react';
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

// Category groups
const EXPENSE_CATEGORIES = {
  // Оборотные - закупки товара для продажи
  returnable: [
    { value: 'purchases', label: 'Закупки товара', color: 'bg-orange-500/20 text-orange-500 border-orange-500/30' }
  ],
  // Невозвратные - операционные расходы бизнеса
  nonReturnable: [
    { value: 'equipment', label: 'Оборудование', color: 'bg-blue-500/20 text-blue-500 border-blue-500/30' },
    { value: 'inventory', label: 'Инвентарь', color: 'bg-purple-500/20 text-purple-500 border-purple-500/30' },
    { value: 'employee_food', label: 'Еда сотрудников', color: 'bg-green-500/20 text-green-500 border-green-500/30' },
    { value: 'food_hunters', label: 'Food Hunters', color: 'bg-pink-500/20 text-pink-500 border-pink-500/30' },
    { value: 'other', label: 'Прочее', color: 'bg-gray-500/20 text-gray-500 border-gray-500/30' }
  ],
  // Инвесторские возвратные - вложения в оборотные средства
  investorReturnable: [
    { value: 'investor_purchases', label: 'Инвестор: Закупки', color: 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30' }
  ],
  // Инвесторские невозвратные - вложения в основные средства
  investorNonReturnable: [
    { value: 'investor_equipment', label: 'Инвестор: Оборудование', color: 'bg-teal-500/20 text-teal-500 border-teal-500/30' },
    { value: 'investor_inventory', label: 'Инвестор: Инвентарь', color: 'bg-cyan-500/20 text-cyan-500 border-cyan-500/30' },
    { value: 'investor_other', label: 'Инвестор: Прочее', color: 'bg-sky-500/20 text-sky-500 border-sky-500/30' }
  ]
};

const ALL_CATEGORIES = [
  ...EXPENSE_CATEGORIES.returnable,
  ...EXPENSE_CATEGORIES.nonReturnable,
  ...EXPENSE_CATEGORIES.investorReturnable,
  ...EXPENSE_CATEGORIES.investorNonReturnable
];

const getCategoryLabel = (value: string) => {
  const cat = ALL_CATEGORIES.find(c => c.value === value);
  return cat?.label || value;
};

const getCategoryColor = (value: string) => {
  const cat = ALL_CATEGORIES.find(c => c.value === value);
  return cat?.color || 'bg-muted text-muted-foreground';
};

const getCategoryGroup = (value: string): string => {
  if (EXPENSE_CATEGORIES.returnable.some(c => c.value === value)) return 'returnable';
  if (EXPENSE_CATEGORIES.nonReturnable.some(c => c.value === value)) return 'nonReturnable';
  if (EXPENSE_CATEGORIES.investorReturnable.some(c => c.value === value)) return 'investorReturnable';
  if (EXPENSE_CATEGORIES.investorNonReturnable.some(c => c.value === value)) return 'investorNonReturnable';
  return 'other';
};

type DatePreset = 'today' | 'week' | 'month' | 'custom';

export default function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  
  // Date filters
  const today = new Date();
  const [datePreset, setDatePreset] = useState<DatePreset>('month');
  const [dateFrom, setDateFrom] = useState<Date>(startOfMonth(today));
  const [dateTo, setDateTo] = useState<Date>(endOfMonth(today));
  
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
  const [newCategory, setNewCategory] = useState('purchases');
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
      toast.error('Ошибка загрузки расходов');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExpenses();
  }, [dateFrom, dateTo]);

  const filteredExpenses = expenses.filter(e => {
    const matchesSearch = !searchTerm || 
      e.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getCategoryLabel(e.category).toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || e.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  // Calculate totals by group
  const totals = {
    returnable: expenses.filter(e => getCategoryGroup(e.category) === 'returnable').reduce((s, e) => s + e.amount, 0),
    nonReturnable: expenses.filter(e => getCategoryGroup(e.category) === 'nonReturnable').reduce((s, e) => s + e.amount, 0),
    investorReturnable: expenses.filter(e => getCategoryGroup(e.category) === 'investorReturnable').reduce((s, e) => s + e.amount, 0),
    investorNonReturnable: expenses.filter(e => getCategoryGroup(e.category) === 'investorNonReturnable').reduce((s, e) => s + e.amount, 0)
  };

  const grandTotal = totals.returnable + totals.nonReturnable + totals.investorReturnable + totals.investorNonReturnable;

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

      const { error } = await supabase
        .from('cash_expenses')
        .update({
          amount: newAmount,
          description: editDescription || null,
          category: editCategory
        })
        .eq('id', editingExpense.id);

      if (error) throw error;

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
    
    const rows: any[] = [];
    
    rows.push(['РАСХОДЫ', `${fromStr} - ${toStr}`]);
    rows.push([]);
    
    // Оборотные
    rows.push(['═══ ОБОРОТНЫЕ (Закупки товара) ═══']);
    rows.push(['Дата', 'Смена', 'Категория', 'Описание', 'Сумма']);
    expenses.filter(e => getCategoryGroup(e.category) === 'returnable').forEach(e => {
      rows.push([
        format(new Date(e.created_at), 'dd.MM.yyyy'),
        e.shift === 'day' ? 'День' : 'Ночь',
        getCategoryLabel(e.category),
        e.description || '',
        e.amount
      ]);
    });
    rows.push(['', '', '', 'ИТОГО Оборотные:', totals.returnable]);
    rows.push([]);
    
    // Невозвратные
    rows.push(['═══ НЕВОЗВРАТНЫЕ (Операционные) ═══']);
    rows.push(['Дата', 'Смена', 'Категория', 'Описание', 'Сумма']);
    expenses.filter(e => getCategoryGroup(e.category) === 'nonReturnable').forEach(e => {
      rows.push([
        format(new Date(e.created_at), 'dd.MM.yyyy'),
        e.shift === 'day' ? 'День' : 'Ночь',
        getCategoryLabel(e.category),
        e.description || '',
        e.amount
      ]);
    });
    rows.push(['', '', '', 'ИТОГО Невозвратные:', totals.nonReturnable]);
    rows.push([]);
    
    // Инвесторские возвратные
    rows.push(['═══ ИНВЕСТОР: ВОЗВРАТНЫЕ ═══']);
    rows.push(['Дата', 'Смена', 'Категория', 'Описание', 'Сумма']);
    expenses.filter(e => getCategoryGroup(e.category) === 'investorReturnable').forEach(e => {
      rows.push([
        format(new Date(e.created_at), 'dd.MM.yyyy'),
        e.shift === 'day' ? 'День' : 'Ночь',
        getCategoryLabel(e.category),
        e.description || '',
        e.amount
      ]);
    });
    rows.push(['', '', '', 'ИТОГО Инвестор возвратные:', totals.investorReturnable]);
    rows.push([]);
    
    // Инвесторские невозвратные
    rows.push(['═══ ИНВЕСТОР: НЕВОЗВРАТНЫЕ ═══']);
    rows.push(['Дата', 'Смена', 'Категория', 'Описание', 'Сумма']);
    expenses.filter(e => getCategoryGroup(e.category) === 'investorNonReturnable').forEach(e => {
      rows.push([
        format(new Date(e.created_at), 'dd.MM.yyyy'),
        e.shift === 'day' ? 'День' : 'Ночь',
        getCategoryLabel(e.category),
        e.description || '',
        e.amount
      ]);
    });
    rows.push(['', '', '', 'ИТОГО Инвестор невозвратные:', totals.investorNonReturnable]);
    rows.push([]);
    
    // Итого
    rows.push(['═══ ОБЩИЙ ИТОГ ═══']);
    rows.push(['Оборотные (закупки)', '', '', '', totals.returnable]);
    rows.push(['Невозвратные (операционные)', '', '', '', totals.nonReturnable]);
    rows.push(['Инвестор: возвратные', '', '', '', totals.investorReturnable]);
    rows.push(['Инвестор: невозвратные', '', '', '', totals.investorNonReturnable]);
    rows.push(['', '', '', 'ВСЕГО:', grandTotal]);
    
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Расходы');
    XLSX.writeFile(wb, `expenses_${format(dateFrom, 'yyyy-MM-dd')}_${format(dateTo, 'yyyy-MM-dd')}.xlsx`);
    
    toast.success('Экспорт завершен');
  };

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-4 items-end justify-between">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex gap-1">
              <Button size="sm" variant={datePreset === 'today' ? 'default' : 'outline'} onClick={() => applyDatePreset('today')}>
                Сегодня
              </Button>
              <Button size="sm" variant={datePreset === 'week' ? 'default' : 'outline'} onClick={() => applyDatePreset('week')}>
                Неделя
              </Button>
              <Button size="sm" variant={datePreset === 'month' ? 'default' : 'outline'} onClick={() => applyDatePreset('month')}>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-orange-500" />
              <div>
                <div className="text-xs text-muted-foreground">Оборотные</div>
                <div className="text-lg font-bold">₱{totals.returnable.toLocaleString()}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/20">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2">
              <Wrench className="w-5 h-5 text-red-500" />
              <div>
                <div className="text-xs text-muted-foreground">Невозвратные</div>
                <div className="text-lg font-bold">₱{totals.nonReturnable.toLocaleString()}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
              <div>
                <div className="text-xs text-muted-foreground">Инвестор ↺</div>
                <div className="text-lg font-bold">₱{totals.investorReturnable.toLocaleString()}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-teal-500/10 to-teal-500/5 border-teal-500/20">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-teal-500" />
              <div>
                <div className="text-xs text-muted-foreground">Инвестор ✗</div>
                <div className="text-lg font-bold">₱{totals.investorNonReturnable.toLocaleString()}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
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
              <SelectTrigger className="w-56 bg-background">
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

      {/* Expenses Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Расходы ({filteredExpenses.length})</span>
            <span className="text-muted-foreground">Всего: ₱{grandTotal.toLocaleString()}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredExpenses.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Нет расходов</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left py-3 px-4 font-semibold">Дата</th>
                    <th className="text-left py-3 px-4 font-semibold">Категория</th>
                    <th className="text-left py-3 px-4 font-semibold">Описание</th>
                    <th className="text-right py-3 px-4 font-semibold">Сумма</th>
                    <th className="py-3 px-4 w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.map((expense) => (
                    <tr key={expense.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4">
                        <div>{format(new Date(expense.created_at), 'dd.MM.yyyy')}</div>
                        <div className="text-xs text-muted-foreground">
                          {expense.shift === 'day' ? '☀️ День' : '🌙 Ночь'}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge className={cn("border", getCategoryColor(expense.category))}>
                          {getCategoryLabel(expense.category)}
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
          )}
        </CardContent>
      </Card>

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
                  <SelectItem value="" disabled className="text-muted-foreground font-semibold">— Оборотные —</SelectItem>
                  {EXPENSE_CATEGORIES.returnable.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                  <SelectItem value="" disabled className="text-muted-foreground font-semibold">— Невозвратные —</SelectItem>
                  {EXPENSE_CATEGORIES.nonReturnable.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                  <SelectItem value="" disabled className="text-muted-foreground font-semibold">— Инвестор: Возвратные —</SelectItem>
                  {EXPENSE_CATEGORIES.investorReturnable.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                  <SelectItem value="" disabled className="text-muted-foreground font-semibold">— Инвестор: Невозвратные —</SelectItem>
                  {EXPENSE_CATEGORIES.investorNonReturnable.map(cat => (
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
                  {EXPENSE_CATEGORIES.returnable.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                  <SelectItem value="" disabled className="text-muted-foreground font-semibold">— Невозвратные —</SelectItem>
                  {EXPENSE_CATEGORIES.nonReturnable.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                  <SelectItem value="" disabled className="text-muted-foreground font-semibold">— Инвестор: Возвратные —</SelectItem>
                  {EXPENSE_CATEGORIES.investorReturnable.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                  <SelectItem value="" disabled className="text-muted-foreground font-semibold">— Инвестор: Невозвратные —</SelectItem>
                  {EXPENSE_CATEGORIES.investorNonReturnable.map(cat => (
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
