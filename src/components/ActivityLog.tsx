import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Clock, Play, Square, DollarSign, RefreshCw, 
  UserCheck, UserMinus, Banknote, Receipt, Package,
  Send, CheckCircle, XCircle, Edit, Trash2, Plus
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ActivityEntry {
  id: string;
  timer_name: string;
  timer_id: string;
  action: string;
  timestamp: number;
  created_at: string;
}

export function ActivityLog() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

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
        .limit(100);
      
      if (error) throw error;
      setEntries(data || []);
    } catch (error) {
      console.error('Error loading activity log:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      // Timer
      case 'start': return <Play className="w-3 h-3 text-green-500" />;
      case 'stop': return <Square className="w-3 h-3 text-red-500" />;
      case 'payment': return <DollarSign className="w-3 h-3 text-amber-500" />;
      
      // Shift
      case 'shift_start': return <UserCheck className="w-3 h-3 text-green-500" />;
      case 'shift_end': return <UserMinus className="w-3 h-3 text-orange-500" />;
      case 'shift_close': return <CheckCircle className="w-3 h-3 text-blue-500" />;
      
      // Expense
      case 'expense_add': return <Plus className="w-3 h-3 text-red-500" />;
      case 'expense_delete': return <Trash2 className="w-3 h-3 text-red-500" />;
      case 'expense_approve': return <CheckCircle className="w-3 h-3 text-green-500" />;
      
      // Cash
      case 'cash_received': return <Banknote className="w-3 h-3 text-green-500" />;
      case 'cash_approve': return <CheckCircle className="w-3 h-3 text-green-500" />;
      case 'cash_edit': return <Edit className="w-3 h-3 text-amber-500" />;
      
      // Inventory
      case 'receipt': return <Package className="w-3 h-3 text-blue-500" />;
      case 'inventory_ok': return <CheckCircle className="w-3 h-3 text-green-500" />;
      case 'inventory_diff': return <XCircle className="w-3 h-3 text-amber-500" />;
      
      // Payroll
      case 'salary_paid': return <DollarSign className="w-3 h-3 text-green-500" />;
      case 'bonus_add': return <Plus className="w-3 h-3 text-amber-500" />;
      
      // System
      case 'sync_loyverse': return <RefreshCw className="w-3 h-3 text-blue-500" />;
      case 'sync_sheets': return <RefreshCw className="w-3 h-3 text-green-500" />;
      case 'telegram_sent': return <Send className="w-3 h-3 text-blue-500" />;
      
      default: return <Clock className="w-3 h-3 text-muted-foreground" />;
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      // Timer
      case 'start': return <Badge className="bg-green-500 text-xs">Start</Badge>;
      case 'stop': return <Badge variant="destructive" className="text-xs">Stop</Badge>;
      case 'payment': return <Badge className="bg-amber-500/20 text-amber-600 text-xs">Payment</Badge>;
      
      // Shift
      case 'shift_start': return <Badge className="bg-green-500/20 text-green-600 text-xs">Shift Start</Badge>;
      case 'shift_end': return <Badge className="bg-orange-500/20 text-orange-600 text-xs">Shift End</Badge>;
      case 'shift_close': return <Badge className="bg-blue-500/20 text-blue-600 text-xs">Shift Close</Badge>;
      
      // Expense
      case 'expense_add': return <Badge className="bg-red-500/20 text-red-600 text-xs">+ Expense</Badge>;
      case 'expense_delete': return <Badge className="bg-red-500/20 text-red-600 text-xs">- Expense</Badge>;
      case 'expense_approve': return <Badge className="bg-green-500/20 text-green-600 text-xs">Approved</Badge>;
      
      // Cash
      case 'cash_received': return <Badge className="bg-green-500/20 text-green-600 text-xs">Cash In</Badge>;
      case 'cash_approve': return <Badge className="bg-green-500/20 text-green-600 text-xs">Approved</Badge>;
      case 'cash_edit': return <Badge className="bg-amber-500/20 text-amber-600 text-xs">Edited</Badge>;
      
      // Inventory
      case 'receipt': return <Badge className="bg-blue-500/20 text-blue-600 text-xs">Receipt</Badge>;
      case 'inventory_ok': return <Badge className="bg-green-500/20 text-green-600 text-xs">Инвент. ✓</Badge>;
      case 'inventory_diff': return <Badge className="bg-amber-500/20 text-amber-600 text-xs">Расхождение</Badge>;
      
      // Payroll
      case 'salary_paid': return <Badge className="bg-green-500/20 text-green-600 text-xs">Salary</Badge>;
      case 'bonus_add': return <Badge className="bg-amber-500/20 text-amber-600 text-xs">Bonus</Badge>;
      
      // System
      case 'sync_loyverse': return <Badge className="bg-blue-500/20 text-blue-600 text-xs">Loyverse</Badge>;
      case 'sync_sheets': return <Badge className="bg-green-500/20 text-green-600 text-xs">Sheets</Badge>;
      case 'telegram_sent': return <Badge className="bg-blue-500/20 text-blue-600 text-xs">Telegram</Badge>;
      
      default: return <Badge variant="outline" className="text-xs">{action}</Badge>;
    }
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
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Activity Log</h2>
        <Button variant="outline" size="sm" onClick={loadEntries}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>
      
      <Card>
        <ScrollArea className="h-[500px]">
          <CardContent className="p-0">
            {entries.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No activity yet
              </div>
            ) : (
              <div className="divide-y">
                {entries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between p-3 hover:bg-secondary/30">
                    <div className="flex items-center gap-3">
                      {getActionIcon(entry.action)}
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
