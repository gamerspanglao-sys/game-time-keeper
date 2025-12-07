import { Layout } from '@/components/Layout';
import { AdminGuard } from '@/components/AdminGuard';
import { formatTime, getDailyPeriodKey, DEFAULT_TIMERS } from '@/lib/timerUtils';
import { BarChart3, Clock, Calendar, ChevronLeft, ChevronRight, Loader2, AlertTriangle } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

interface OvertimeEntry {
  timerId: string;
  timerName: string;
  overtimeMinutes: number;
  timestamp: number;
}

interface DayStats {
  period_key: string;
  timer_stats: Record<string, any>;
  overtime?: OvertimeEntry[];
}

const DailyStats = () => {
  return (
    <AdminGuard>
      <DailyStatsContent />
    </AdminGuard>
  );
};

const DailyStatsContent = () => {
  const [allStats, setAllStats] = useState<DayStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const loadStats = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('daily_stats')
        .select('*')
        .order('period_key', { ascending: false })
        .limit(30);
      
      if (error) {
        console.error('Error loading stats:', error);
        return;
      }

      if (data) {
        const stats: DayStats[] = data.map(d => {
          const timerStats = d.timer_stats as Record<string, any> || {};
          return {
            period_key: d.period_key,
            timer_stats: timerStats,
            overtime: timerStats.overtime as OvertimeEntry[] || [],
          };
        });
        setAllStats(stats);
      }
    } catch (err) {
      console.error('Error in loadStats:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const currentStats = allStats[selectedIndex];
  const periodKey = currentStats?.period_key || getDailyPeriodKey();

  const formatPeriod = (dateStr: string) => {
    const date = new Date(dateStr);
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);

    const formatDate = (d: Date) => {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    return `${formatDate(date)} 5:00 AM — ${formatDate(nextDay)} 5:00 AM`;
  };

  const getTotalTime = () => {
    if (!currentStats) return 0;
    return Object.entries(currentStats.timer_stats)
      .filter(([key]) => key !== 'overtime')
      .reduce((acc, [_, time]) => acc + (typeof time === 'number' ? time : 0), 0);
  };

  const getTotalOvertime = () => {
    if (!currentStats?.overtime) return 0;
    return currentStats.overtime.reduce((acc, entry) => acc + entry.overtimeMinutes, 0);
  };

  const formatMinutes = (minutes: number) => {
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const canGoNewer = selectedIndex > 0;
  const canGoOlder = selectedIndex < allStats.length - 1;

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading statistics...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="gaming-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <BarChart3 className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Daily Activity</h1>
          </div>
          
          {/* Date Navigation */}
          <div className="flex items-center justify-between gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIndex(prev => prev + 1)}
              disabled={!canGoOlder}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Older
            </Button>
            
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span className="text-sm">{formatPeriod(periodKey)}</span>
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIndex(prev => prev - 1)}
              disabled={!canGoNewer}
            >
              Newer
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>

          <div className="mt-6 p-4 rounded-lg bg-secondary/50 border border-border">
            <p className="text-sm text-muted-foreground mb-1">Total Time</p>
            <p className="text-3xl font-mono font-bold text-primary">
              {formatTime(getTotalTime())}
            </p>
          </div>
        </div>

        {/* Overtime Section */}
        {currentStats?.overtime && currentStats.overtime.length > 0 && (
          <div className="gaming-card border-destructive/50 bg-destructive/5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-destructive/20 border border-destructive/30">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-destructive">Overtime Records</h2>
                <p className="text-sm text-destructive/70">Sessions that exceeded booked time</p>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              {currentStats.overtime.map((entry, index) => (
                <div
                  key={`${entry.timerId}-${index}`}
                  className="flex items-center justify-between p-3 rounded-lg bg-destructive/10 border border-destructive/20"
                >
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-destructive" />
                    <div>
                      <span className="font-medium">{entry.timerName}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        at {formatTimestamp(entry.timestamp)}
                      </span>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-destructive">
                    +{formatMinutes(entry.overtimeMinutes)}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-destructive/20 flex justify-between items-center">
              <span className="font-semibold text-destructive">TOTAL OVERTIME:</span>
              <span className="font-mono text-2xl font-bold text-destructive">
                +{formatMinutes(getTotalOvertime())}
              </span>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        {allStats.length === 0 ? (
          <div className="gaming-card flex flex-col items-center justify-center py-16 text-muted-foreground">
            <BarChart3 className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-lg">No statistics recorded</p>
            <p className="text-sm">Start using timers to see statistics here</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {DEFAULT_TIMERS.map(timer => {
              const time = typeof currentStats?.timer_stats[timer.id] === 'number' 
                ? currentStats.timer_stats[timer.id] 
                : 0;
              const totalTime = getTotalTime();
              const percentage = totalTime > 0 ? (time / totalTime) * 100 : 0;

              return (
                <div key={timer.id} className="gaming-card">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <span className="font-medium text-foreground">{timer.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      <span className="font-mono text-lg text-foreground">{formatTime(time)}</span>
                    </div>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  
                  {time > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {percentage.toFixed(1)}% of total time
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Info */}
        <div className="text-center text-sm text-muted-foreground py-4">
          <p>Statistics reset daily at 5:00 AM</p>
          {allStats.length > 0 && (
            <p className="mt-1">Viewing {allStats.length} day{allStats.length > 1 ? 's' : ''} of history</p>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default DailyStats;
