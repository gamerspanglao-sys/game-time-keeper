import { Layout } from '@/components/Layout';
import { AdminGuard } from '@/components/AdminGuard';
import { formatTimestamp, isWithinCurrentPeriod } from '@/lib/timerUtils';
import { ScrollText, Play, Square, RotateCcw, Filter, Clock, AlertTriangle, Plus, Loader2 } from 'lucide-react';
import { useMemo, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { ActivityLogEntry } from '@/types/timer';

const ActivityLog = () => {
  return (
    <AdminGuard>
      <ActivityLogContent />
    </AdminGuard>
  );
};

const ActivityLogContent = () => {
  const [showTodayOnly, setShowTodayOnly] = useState(true);
  const [allLogs, setAllLogs] = useState<ActivityLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadActivityLog = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(500);
      
      if (error) {
        console.error('Error loading activity log:', error);
        return;
      }

      if (data) {
        const log: ActivityLogEntry[] = data.map(entry => ({
          id: entry.id,
          timestamp: Number(entry.timestamp),
          timerId: entry.timer_id,
          timerName: entry.timer_name,
          action: entry.action as ActivityLogEntry['action'],
        }));
        setAllLogs(log);
      }
    } catch (err) {
      console.error('Error in loadActivityLog:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActivityLog();
  }, [loadActivityLog]);

  const logs = useMemo(() => {
    if (showTodayOnly) {
      return allLogs.filter(log => isWithinCurrentPeriod(log.timestamp));
    }
    return allLogs;
  }, [allLogs, showTodayOnly]);

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'started':
        return <Play className="w-4 h-4 text-success" />;
      case 'stopped':
        return <Square className="w-4 h-4 text-destructive" />;
      case 'reset':
        return <RotateCcw className="w-4 h-4 text-muted-foreground" />;
      case 'finished':
        return <Clock className="w-4 h-4 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-warning" />;
      case 'extended':
        return <Plus className="w-4 h-4 text-primary" />;
      default:
        return null;
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'started': return 'Started';
      case 'stopped': return 'Stopped';
      case 'reset': return 'Reset';
      case 'finished': return 'Finished';
      case 'warning': return '5 min left';
      case 'extended': return 'Extended';
      default: return action;
    }
  };

  const getActionClass = (action: string) => {
    switch (action) {
      case 'started':
        return 'text-success';
      case 'stopped':
      case 'finished':
        return 'text-destructive';
      case 'warning':
        return 'text-warning';
      case 'extended':
        return 'text-primary';
      default:
        return 'text-muted-foreground';
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading activity log...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="gaming-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                <ScrollText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Activity Log</h1>
                <p className="text-sm text-muted-foreground">
                  {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
                </p>
              </div>
            </div>
            
            <Button
              variant={showTodayOnly ? 'timerActive' : 'timer'}
              size="sm"
              onClick={() => setShowTodayOnly(!showTodayOnly)}
            >
              <Filter className="w-4 h-4" />
              {showTodayOnly ? 'Today' : 'All'}
            </Button>
          </div>
        </div>

        {/* Log Entries */}
        {logs.length === 0 ? (
          <div className="gaming-card flex flex-col items-center justify-center py-16 text-muted-foreground">
            <ScrollText className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-lg">No activity recorded</p>
            <p className="text-sm">Start using timers to see activity here</p>
          </div>
        ) : (
          <div className="gaming-card p-0 overflow-hidden">
            <div className="max-h-[600px] overflow-y-auto scrollbar-thin">
              {logs.map((log, index) => (
                <div
                  key={log.id}
                  className={cn(
                    'flex items-center gap-4 px-6 py-4 transition-colors hover:bg-secondary/50',
                    index !== logs.length - 1 && 'border-b border-border'
                  )}
                >
                  {/* Icon */}
                  <div className="flex-shrink-0 p-2 rounded-lg bg-secondary">
                    {getActionIcon(log.action)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{log.timerName}</span>
                      <span className="text-muted-foreground">—</span>
                      <span className={cn('font-medium', getActionClass(log.action))}>
                        {getActionLabel(log.action)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground font-mono">
                      {formatTimestamp(log.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default ActivityLog;
