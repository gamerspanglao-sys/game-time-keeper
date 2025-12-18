import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Clock, Play, Square, DollarSign, RefreshCw, 
  UserCheck, UserMinus, Banknote, Package,
  Send, CheckCircle, XCircle, Edit, Trash2, Plus,
  Timer, Users, AlertTriangle, Zap, RotateCcw,
  UserPlus, UserCog, Settings, ShoppingCart
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ActivityEntry {
  id: string;
  timer_name: string;
  timer_id: string;
  action: string;
  timestamp: number;
  created_at: string;
}

type FilterModule = 'all' | 'Timer' | 'Queue' | 'Shift' | 'Expense' | 'Cash' | 'Inventory' | 'Payroll' | 'Admin' | 'System';

export function ActivityLog() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterModule>('all');

  useEffect(() => {
    loadEntries();
    
    const channel = supabase
      .channel('activity-log-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_log' }, () => {
        loadEntries();
      })
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadEntries = async () => {
    try {
      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(200);
      
      if (error) throw error;
      setEntries(data || []);
    } catch (error) {
      console.error('Error loading activity log:', error);
    } finally {
      setLoading(false);
    }
  };

  const getModuleFromAction = (action: string): FilterModule => {
    if (action.startsWith('timer_') || action === 'start' || action === 'stop' || action === 'extended' || action === 'started' || action === 'stopped') return 'Timer';
    if (action.startsWith('queue_')) return 'Queue';
    if (action.startsWith('shift_')) return 'Shift';
    if (action.startsWith('expense_')) return 'Expense';
    if (action.startsWith('cash_')) return 'Cash';
    if (action.startsWith('inventory_') || action === 'receipt') return 'Inventory';
    if (action.startsWith('salary_') || action.startsWith('bonus_') || action.startsWith('shortage_')) return 'Payroll';
    if (action.startsWith('sync_') || action.startsWith('telegram_') || action.startsWith('purchase_')) return 'System';
    if (action.includes('employee_') || action === 'shifts_reset') return 'Admin';
    return 'System';
  };

  const filteredEntries = filter === 'all' 
    ? entries 
    : entries.filter(e => getModuleFromAction(e.action) === filter);

  const getActionIcon = (action: string) => {
    switch (action) {
      // Timer
      case 'timer_start':
      case 'start':
      case 'started':
        return <Play className="w-3.5 h-3.5 text-green-500" />;
      case 'timer_stop':
      case 'stop':
      case 'stopped':
        return <Square className="w-3.5 h-3.5 text-red-500" />;
      case 'timer_extend':
      case 'extended':
        return <Plus className="w-3.5 h-3.5 text-blue-500" />;
      case 'timer_reset':
        return <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />;
      case 'timer_promo':
        return <Zap className="w-3.5 h-3.5 text-amber-500" />;
      case 'timer_adjust':
        return <Settings className="w-3.5 h-3.5 text-purple-500" />;
      case 'payment':
        return <DollarSign className="w-3.5 h-3.5 text-amber-500" />;
      
      // Queue
      case 'queue_add':
        return <UserPlus className="w-3.5 h-3.5 text-blue-500" />;
      case 'queue_remove':
        return <UserMinus className="w-3.5 h-3.5 text-orange-500" />;
      case 'queue_clear':
        return <Trash2 className="w-3.5 h-3.5 text-red-500" />;
      
      // Shift
      case 'shift_start':
        return <UserCheck className="w-3.5 h-3.5 text-green-500" />;
      case 'shift_end':
        return <UserMinus className="w-3.5 h-3.5 text-orange-500" />;
      case 'shift_close':
        return <CheckCircle className="w-3.5 h-3.5 text-blue-500" />;
      
      // Expense
      case 'expense_add':
        return <Plus className="w-3.5 h-3.5 text-red-500" />;
      case 'expense_delete':
        return <Trash2 className="w-3.5 h-3.5 text-red-500" />;
      case 'expense_approve':
        return <CheckCircle className="w-3.5 h-3.5 text-green-500" />;
      
      // Cash
      case 'cash_received':
        return <Banknote className="w-3.5 h-3.5 text-green-500" />;
      case 'cash_approve':
        return <CheckCircle className="w-3.5 h-3.5 text-green-500" />;
      case 'cash_edit':
        return <Edit className="w-3.5 h-3.5 text-amber-500" />;
      case 'cash_handover_add':
        return <Plus className="w-3.5 h-3.5 text-green-500" />;
      case 'cash_handover_delete':
        return <Trash2 className="w-3.5 h-3.5 text-red-500" />;
      
      // Inventory
      case 'receipt':
        return <Package className="w-3.5 h-3.5 text-blue-500" />;
      case 'inventory_ok':
        return <CheckCircle className="w-3.5 h-3.5 text-green-500" />;
      case 'inventory_diff':
        return <XCircle className="w-3.5 h-3.5 text-amber-500" />;
      
      // Payroll
      case 'salary_paid':
        return <DollarSign className="w-3.5 h-3.5 text-green-500" />;
      case 'bonus_add':
        return <Plus className="w-3.5 h-3.5 text-amber-500" />;
      case 'shortage_assign':
        return <AlertTriangle className="w-3.5 h-3.5 text-red-500" />;
      
      // Admin
      case 'shift_edit':
        return <Edit className="w-3.5 h-3.5 text-amber-500" />;
      case 'shift_delete':
        return <Trash2 className="w-3.5 h-3.5 text-red-500" />;
      case 'shifts_reset':
        return <RotateCcw className="w-3.5 h-3.5 text-red-500" />;
      case 'employee_add':
        return <UserPlus className="w-3.5 h-3.5 text-green-500" />;
      case 'employee_edit':
        return <UserCog className="w-3.5 h-3.5 text-amber-500" />;
      case 'employee_delete':
        return <Trash2 className="w-3.5 h-3.5 text-red-500" />;
      
      // System
      case 'sync_loyverse':
        return <RefreshCw className="w-3.5 h-3.5 text-blue-500" />;
      case 'sync_sheets':
        return <RefreshCw className="w-3.5 h-3.5 text-green-500" />;
      case 'telegram_sent':
        return <Send className="w-3.5 h-3.5 text-blue-500" />;
      case 'purchase_generate':
        return <ShoppingCart className="w-3.5 h-3.5 text-purple-500" />;
      case 'purchase_send':
        return <Send className="w-3.5 h-3.5 text-purple-500" />;
      
      default:
        return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
    }
  };

  const getActionBadge = (action: string) => {
    const badgeStyles: Record<string, { bg: string; text: string; label: string }> = {
      // Timer
      'timer_start': { bg: 'bg-green-500/20', text: 'text-green-600', label: 'Start' },
      'start': { bg: 'bg-green-500/20', text: 'text-green-600', label: 'Start' },
      'started': { bg: 'bg-green-500/20', text: 'text-green-600', label: 'Start' },
      'timer_stop': { bg: 'bg-red-500/20', text: 'text-red-600', label: 'Stop' },
      'stop': { bg: 'bg-red-500/20', text: 'text-red-600', label: 'Stop' },
      'stopped': { bg: 'bg-red-500/20', text: 'text-red-600', label: 'Stop' },
      'timer_extend': { bg: 'bg-blue-500/20', text: 'text-blue-600', label: 'Extend' },
      'extended': { bg: 'bg-blue-500/20', text: 'text-blue-600', label: 'Extend' },
      'timer_reset': { bg: 'bg-muted', text: 'text-muted-foreground', label: 'Reset' },
      'timer_promo': { bg: 'bg-amber-500/20', text: 'text-amber-600', label: 'Promo' },
      'timer_adjust': { bg: 'bg-purple-500/20', text: 'text-purple-600', label: 'Adjust' },
      'payment': { bg: 'bg-amber-500/20', text: 'text-amber-600', label: 'Payment' },
      
      // Queue
      'queue_add': { bg: 'bg-blue-500/20', text: 'text-blue-600', label: 'Queue +' },
      'queue_remove': { bg: 'bg-orange-500/20', text: 'text-orange-600', label: 'Queue -' },
      'queue_clear': { bg: 'bg-red-500/20', text: 'text-red-600', label: 'Clear Queue' },
      
      // Shift
      'shift_start': { bg: 'bg-green-500/20', text: 'text-green-600', label: 'Shift Start' },
      'shift_end': { bg: 'bg-orange-500/20', text: 'text-orange-600', label: 'Shift End' },
      'shift_close': { bg: 'bg-blue-500/20', text: 'text-blue-600', label: 'Shift Close' },
      
      // Expense
      'expense_add': { bg: 'bg-red-500/20', text: 'text-red-600', label: '+ Expense' },
      'expense_delete': { bg: 'bg-red-500/20', text: 'text-red-600', label: '- Expense' },
      'expense_approve': { bg: 'bg-green-500/20', text: 'text-green-600', label: 'Approved' },
      
      // Cash
      'cash_received': { bg: 'bg-green-500/20', text: 'text-green-600', label: 'Cash In' },
      'cash_approve': { bg: 'bg-green-500/20', text: 'text-green-600', label: 'Approved' },
      'cash_edit': { bg: 'bg-amber-500/20', text: 'text-amber-600', label: 'Edited' },
      'cash_handover_add': { bg: 'bg-green-500/20', text: 'text-green-600', label: '+ Handover' },
      'cash_handover_delete': { bg: 'bg-red-500/20', text: 'text-red-600', label: '- Handover' },
      
      // Inventory
      'receipt': { bg: 'bg-blue-500/20', text: 'text-blue-600', label: 'Receipt' },
      'inventory_ok': { bg: 'bg-green-500/20', text: 'text-green-600', label: 'Check ✓' },
      'inventory_diff': { bg: 'bg-amber-500/20', text: 'text-amber-600', label: 'Difference' },
      
      // Payroll
      'salary_paid': { bg: 'bg-green-500/20', text: 'text-green-600', label: 'Salary' },
      'bonus_add': { bg: 'bg-amber-500/20', text: 'text-amber-600', label: 'Bonus' },
      'shortage_assign': { bg: 'bg-red-500/20', text: 'text-red-600', label: 'Shortage' },
      
      // Admin
      'shift_edit': { bg: 'bg-amber-500/20', text: 'text-amber-600', label: 'Edit Shift' },
      'shift_delete': { bg: 'bg-red-500/20', text: 'text-red-600', label: 'Delete Shift' },
      'shifts_reset': { bg: 'bg-red-500/20', text: 'text-red-600', label: 'Reset All' },
      'employee_add': { bg: 'bg-green-500/20', text: 'text-green-600', label: '+ Employee' },
      'employee_edit': { bg: 'bg-amber-500/20', text: 'text-amber-600', label: 'Edit Employee' },
      'employee_delete': { bg: 'bg-red-500/20', text: 'text-red-600', label: '- Employee' },
      
      // System
      'sync_loyverse': { bg: 'bg-blue-500/20', text: 'text-blue-600', label: 'Loyverse' },
      'sync_sheets': { bg: 'bg-green-500/20', text: 'text-green-600', label: 'Sheets' },
      'telegram_sent': { bg: 'bg-blue-500/20', text: 'text-blue-600', label: 'Telegram' },
      'purchase_generate': { bg: 'bg-purple-500/20', text: 'text-purple-600', label: 'Generate' },
      'purchase_send': { bg: 'bg-purple-500/20', text: 'text-purple-600', label: 'Send Order' },
    };

    const style = badgeStyles[action] || { bg: 'bg-muted', text: 'text-muted-foreground', label: action };
    return <Badge className={`${style.bg} ${style.text} text-xs`}>{style.label}</Badge>;
  };

  const getModuleColor = (module: FilterModule): string => {
    const colors: Record<FilterModule, string> = {
      'all': 'bg-muted',
      'Timer': 'bg-green-500/20 text-green-600',
      'Queue': 'bg-blue-500/20 text-blue-600',
      'Shift': 'bg-orange-500/20 text-orange-600',
      'Expense': 'bg-red-500/20 text-red-600',
      'Cash': 'bg-emerald-500/20 text-emerald-600',
      'Inventory': 'bg-cyan-500/20 text-cyan-600',
      'Payroll': 'bg-amber-500/20 text-amber-600',
      'Admin': 'bg-purple-500/20 text-purple-600',
      'System': 'bg-slate-500/20 text-slate-600',
    };
    return colors[module];
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Activity Log</h2>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as FilterModule)}>
            <SelectTrigger className="w-[130px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="Timer">Timer</SelectItem>
              <SelectItem value="Queue">Queue</SelectItem>
              <SelectItem value="Shift">Shift</SelectItem>
              <SelectItem value="Expense">Expense</SelectItem>
              <SelectItem value="Cash">Cash</SelectItem>
              <SelectItem value="Inventory">Inventory</SelectItem>
              <SelectItem value="Payroll">Payroll</SelectItem>
              <SelectItem value="Admin">Admin</SelectItem>
              <SelectItem value="System">System</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={loadEntries}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Module badges */}
      <div className="flex flex-wrap gap-2">
        {(['Timer', 'Queue', 'Shift', 'Expense', 'Cash', 'Inventory', 'Payroll', 'Admin', 'System'] as FilterModule[]).map(mod => {
          const count = entries.filter(e => getModuleFromAction(e.action) === mod).length;
          if (count === 0) return null;
          return (
            <Badge 
              key={mod} 
              className={`${getModuleColor(mod)} cursor-pointer`}
              onClick={() => setFilter(filter === mod ? 'all' : mod)}
            >
              {mod} ({count})
            </Badge>
          );
        })}
      </div>
      
      <Card>
        <ScrollArea className="h-[500px]">
          <CardContent className="p-0">
            {filteredEntries.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No activity yet
              </div>
            ) : (
              <div className="divide-y">
                {filteredEntries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between p-3 hover:bg-secondary/30">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                        {getActionIcon(entry.action)}
                      </div>
                      <div>
                        <div className="font-medium text-sm">{entry.timer_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(entry.timestamp), 'dd MMM HH:mm:ss')}
                        </div>
                      </div>
                    </div>
                    {getActionBadge(entry.action)}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </ScrollArea>
      </Card>
    </div>
  );
}
