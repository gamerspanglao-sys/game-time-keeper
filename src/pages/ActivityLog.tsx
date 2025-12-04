import { Layout } from '@/components/Layout';
import { loadActivityLog, formatTimestamp, isWithinCurrentPeriod } from '@/lib/timerUtils';
import { ScrollText, Play, Pause, Square, RotateCcw, Filter } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ActivityLog = () => {
  const [showTodayOnly, setShowTodayOnly] = useState(true);
  const allLogs = useMemo(() => loadActivityLog(), []);

  const logs = useMemo(() => {
    if (showTodayOnly) {
      return allLogs.filter(log => isWithinCurrentPeriod(log.timestamp));
    }
    return allLogs;
  }, [allLogs, showTodayOnly]);

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'started':
      case 'resumed':
        return <Play className="w-4 h-4 text-success" />;
      case 'paused':
        return <Pause className="w-4 h-4 text-warning" />;
      case 'stopped':
        return <Square className="w-4 h-4 text-destructive" />;
      case 'reset':
        return <RotateCcw className="w-4 h-4 text-muted-foreground" />;
      default:
        return null;
    }
  };

  const getActionLabel = (action: string) => {
    return action.charAt(0).toUpperCase() + action.slice(1);
  };

  const getActionClass = (action: string) => {
    switch (action) {
      case 'started':
      case 'resumed':
        return 'text-success';
      case 'paused':
        return 'text-warning';
      case 'stopped':
        return 'text-destructive';
      default:
        return 'text-muted-foreground';
    }
  };

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
