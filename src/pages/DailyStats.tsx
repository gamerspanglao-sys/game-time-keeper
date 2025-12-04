import { Layout } from '@/components/Layout';
import { AdminGuard } from '@/components/AdminGuard';
import { getCurrentDayStats, formatTime, getDailyPeriodKey, DEFAULT_TIMERS } from '@/lib/timerUtils';
import { BarChart3, Clock, Calendar } from 'lucide-react';
import { useMemo } from 'react';

const DailyStats = () => {
  return (
    <AdminGuard>
      <DailyStatsContent />
    </AdminGuard>
  );
};

const DailyStatsContent = () => {
  const stats = useMemo(() => getCurrentDayStats(), []);
  const periodKey = getDailyPeriodKey();

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
    if (!stats) return 0;
    return Object.values(stats.timers).reduce((acc, time) => acc + time, 0);
  };

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
          
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="w-4 h-4" />
            <span className="text-sm">{formatPeriod(periodKey)}</span>
          </div>

          <div className="mt-6 p-4 rounded-lg bg-secondary/50 border border-border">
            <p className="text-sm text-muted-foreground mb-1">Total Time Today</p>
            <p className="text-3xl font-mono font-bold text-primary">
              {formatTime(getTotalTime())}
            </p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4">
          {DEFAULT_TIMERS.map(timer => {
            const time = stats?.timers[timer.id] || 0;
            const percentage = getTotalTime() > 0 ? (time / getTotalTime()) * 100 : 0;

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

        {/* Info */}
        <div className="text-center text-sm text-muted-foreground py-4">
          <p>Statistics reset daily at 5:00 AM</p>
        </div>
      </div>
    </Layout>
  );
};

export default DailyStats;
