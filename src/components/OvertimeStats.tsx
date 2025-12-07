import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, RotateCcw, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { getDailyPeriodKey } from '@/lib/timerUtils';

interface OvertimeEntry {
  timerId: string;
  timerName: string;
  overtimeMinutes: number;
  timestamp: number;
}

interface OvertimeStatsProps {
  compact?: boolean;
}

const ADMIN_PASSWORD = '8808';

export function OvertimeStats({ compact }: OvertimeStatsProps) {
  const [overtimeData, setOvertimeData] = useState<OvertimeEntry[]>([]);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // Load overtime data from daily_stats
  const loadOvertimeData = async () => {
    try {
      const periodKey = getDailyPeriodKey();
      const { data } = await supabase
        .from('daily_stats')
        .select('*')
        .eq('period_key', periodKey)
        .maybeSingle();

      if (data) {
        const stats = data.timer_stats as Record<string, any>;
        if (stats.overtime) {
          setOvertimeData(stats.overtime as OvertimeEntry[]);
        } else {
          setOvertimeData([]);
        }
      }
    } catch (err) {
      console.error('Error loading overtime data:', err);
    }
  };

  useEffect(() => {
    loadOvertimeData();
    
    // Subscribe to changes
    const channel = supabase
      .channel('overtime-stats')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_stats' },
        () => loadOvertimeData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const totalOvertimeMinutes = overtimeData.reduce((sum, entry) => sum + entry.overtimeMinutes, 0);

  if (overtimeData.length === 0) return null;

  const handleResetClick = () => {
    setPassword('');
    setError('');
    setPasswordDialogOpen(true);
  };

  const handlePasswordSubmit = async () => {
    if (password === ADMIN_PASSWORD) {
      // Clear overtime data
      try {
        const periodKey = getDailyPeriodKey();
        const { data: existing } = await supabase
          .from('daily_stats')
          .select('*')
          .eq('period_key', periodKey)
          .maybeSingle();

        if (existing) {
          const stats = existing.timer_stats as Record<string, any>;
          delete stats.overtime;
          
          await supabase
            .from('daily_stats')
            .update({ 
              timer_stats: stats,
              updated_at: new Date().toISOString()
            })
            .eq('period_key', periodKey);
        }
        
        setOvertimeData([]);
        setPasswordDialogOpen(false);
        setPassword('');
      } catch (err) {
        console.error('Error clearing overtime:', err);
      }
    } else {
      setError('Wrong password');
    }
  };

  const formatMinutes = (minutes: number) => {
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    }
    return `${mins}m`;
  };

  return (
    <>
      <div className={cn(
        "gaming-card border-destructive/50 bg-destructive/5",
        compact && "p-3"
      )}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={cn(
              "rounded-lg bg-destructive/20 border border-destructive/30 p-2",
              compact && "p-1.5"
            )}>
              <AlertTriangle className={cn("text-destructive", compact ? "w-4 h-4" : "w-5 h-5")} />
            </div>
            <div>
              <h2 className={cn(
                "font-bold text-destructive",
                compact ? "text-sm" : "text-lg"
              )}>
                ⚠️ OVERTIME TODAY
              </h2>
              <p className="text-xs text-destructive/70">Close tables faster!</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetClick}
            className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>

        <div className="space-y-2">
          {overtimeData.map((entry, index) => (
            <div
              key={`${entry.timerId}-${index}`}
              className="flex items-center justify-between p-2 rounded-lg bg-destructive/10 border border-destructive/20"
            >
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-destructive" />
                <span className="font-medium text-sm">{entry.timerName}</span>
              </div>
              <span className="font-mono font-bold text-destructive">
                +{formatMinutes(entry.overtimeMinutes)}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-3 pt-3 border-t border-destructive/20 flex justify-between items-center">
          <span className="font-semibold text-destructive">TOTAL OVERTIME:</span>
          <span className="font-mono text-xl font-bold text-destructive animate-pulse">
            +{formatMinutes(totalOvertimeMinutes)}
          </span>
        </div>
      </div>

      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Admin Password Required</DialogTitle>
            <DialogDescription>
              Enter admin password to clear overtime statistics
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPasswordDialogOpen(false)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handlePasswordSubmit} className="flex-1 bg-destructive hover:bg-destructive/90">
                Clear Overtime
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}