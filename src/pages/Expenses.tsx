import { useState, useEffect } from 'react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { Loader2, Pencil, Trash2, Plus, Receipt, Search, CalendarIcon, Filter } from 'lucide-react';
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

const CATEGORY_LABELS: Record<string, string> = {
  purchases: 'Закупки',
  salaries: 'Зарплаты',
  other: 'Прочее',
  employee_food: 'Еда сотрудников',
  food_hunters: 'Food Hunters',
  advance: 'Аванс'
};

const CATEGORY_COLORS: Record<string, string> = {
  purchases: 'bg-orange-500/20 text-orange-500',
  salaries: 'bg-blue-500/20 text-blue-500',
  other: 'bg-purple-500/20 text-purple-500',
  employee_food: 'bg-green-500/20 text-green-500',
  food_hunters: 'bg-pink-500/20 text-pink-500',
  advance: 'bg-cyan-500/20 text-cyan-500'
};

type DatePreset = 'today' | 'week' | 'month' | 'custom';

export default function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  
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

  const filteredExpenses = expenses.filter(e => {
    const matchesSearch = !searchTerm || 
      e.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || e.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

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
        toast.error('Enter valid amount');
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
                           editingExpense.category === 'salaries' ? 'salaries' : 'other_expenses';
            updates[oldField] = Math.max(0, (record[oldField] || 0) - editingExpense.amount);
            
            const newField = editCategory === 'purchases' ? 'purchases' : 
                           editCategory === 'salaries' ? 'salaries' : 'other_expenses';
            updates[newField] = (record[newField] || 0) + newAmount;
          } else if (amountDiff !== 0) {
            const field = editCategory === 'purchases' ? 'purchases' : 
                         editCategory === 'salaries' ? 'salaries' : 'other_expenses';
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

      toast.success('Expense updated');
      setShowEditDialog(false);
      loadExpenses();
    } catch (error) {
      console.error('Error updating expense:', error);
      toast.error('Failed to update');
    }
  };

  const deleteExpense = async (expense: Expense) => {
    if (!confirm('Delete this expense?')) return;

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
                     expense.category === 'salaries' ? 'salaries' : 'other_expenses';
        await supabase
          .from('cash_register')
          .update({ [field]: Math.max(0, (record[field] || 0) - expense.amount) })
          .eq('id', record.id);
      }

      toast.success('Deleted');
      loadExpenses();
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast.error('Failed to delete');
    }
  };

  const addExpense = async () => {
    const amount = parseInt(newAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Enter valid amount');
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
                   newCategory === 'salaries' ? 'salaries' : 'other_expenses';
      
      const { data: record } = await supabase
        .from('cash_register')
        .select(field)
        .eq('id', existing.id)
        .single();

      await supabase
        .from('cash_register')
        .update({ [field]: ((record as any)?.[field] || 0) + amount })
        .eq('id', existing.id);

      toast.success('Expense added');
      setShowAddDialog(false);
      setNewAmount('');
      setNewDescription('');
      loadExpenses();
    } catch (error) {
      console.error('Error adding expense:', error);
      toast.error('Failed to add expense');
    }
  };

  const totalAmount = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  
  // Category totals
  const categoryTotals = filteredExpenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-4 p-4">
      {/* Date Filter Header */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-4 items-end justify-between">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex gap-1">
              <Button 
                size="sm" 
                variant={datePreset === 'today' ? 'default' : 'outline'}
                onClick={() => applyDatePreset('today')}
              >
                Today
              </Button>
              <Button 
                size="sm" 
                variant={datePreset === 'week' ? 'default' : 'outline'}
                onClick={() => applyDatePreset('week')}
              >
                This Week
              </Button>
              <Button 
                size="sm" 
                variant={datePreset === 'month' ? 'default' : 'outline'}
                onClick={() => applyDatePreset('month')}
              >
                This Month
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
                <PopoverContent className="w-auto p-0" align="start">
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
                <PopoverContent className="w-auto p-0" align="start">
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
          
          <Button onClick={() => setShowAddDialog(true)} className="gap-2">
            <Plus className="w-4 h-4" />Add Expense
          </Button>
        </div>
      </Card>

      {/* Search and Filter */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-48 pl-9"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Category</Label>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
          <CardContent className="py-3 px-4">
            <div className="text-sm text-muted-foreground">Total</div>
            <div className="text-xl font-bold">₱{totalAmount.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">{filteredExpenses.length} items</div>
          </CardContent>
        </Card>
        
        {Object.entries(categoryTotals).slice(0, 3).map(([cat, total]) => (
          <Card key={cat} className="border-border/50">
            <CardContent className="py-3 px-4">
              <div className="text-sm text-muted-foreground">{CATEGORY_LABELS[cat] || cat}</div>
              <div className="text-xl font-bold">₱{total.toLocaleString()}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Expenses List */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredExpenses.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No expenses found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left py-3 px-4 font-semibold">Date</th>
                    <th className="text-left py-3 px-4 font-semibold">Shift</th>
                    <th className="text-left py-3 px-4 font-semibold">Category</th>
                    <th className="text-left py-3 px-4 font-semibold">Description</th>
                    <th className="text-right py-3 px-4 font-semibold">Amount</th>
                    <th className="py-3 px-4 w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.map((expense) => (
                    <tr key={expense.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4">{format(new Date(expense.created_at), 'dd.MM.yyyy')}</td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="text-xs">
                          {expense.shift === 'day' ? '☀️ День' : '🌙 Ночь'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge className={CATEGORY_COLORS[expense.category] || 'bg-muted text-muted-foreground'}>
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
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={editCategory} onValueChange={setEditCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount (₱)</Label>
              <Input
                type="number"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
              <Button onClick={saveEdit}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Shift</Label>
                <Select value={newShift} onValueChange={(v) => setNewShift(v as 'day' | 'night')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">☀️ День</SelectItem>
                    <SelectItem value="night">🌙 Ночь</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount (₱)</Label>
              <Input
                type="number"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
              <Button onClick={addExpense}>Add</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
