import { Layout } from '@/components/Layout';
import { TimerCard } from '@/components/TimerCard';
import { CurrentSessions } from '@/components/CurrentSessions';
import { useTimers } from '@/hooks/useTimers';
import { useFullscreen } from '@/hooks/useFullscreen';
import { Layers, Gamepad, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';

const Index = () => {
  const { timers, startTimer, stopTimer, extendTimer, resetTimer, setDuration } = useTimers();
  const { isFullscreen } = useFullscreen();

  const tableTimers = timers.filter(t => t.category === 'table');
  const playstationTimers = timers.filter(t => t.category === 'playstation');
  const vipTimers = timers.filter(t => t.category === 'vip');

  const compact = isFullscreen;

  return (
    <Layout compact={compact}>
      <div className={cn("max-w-7xl mx-auto", compact ? "space-y-4" : "space-y-6")}>
        {/* Current Sessions */}
        <CurrentSessions timers={timers} compact={compact} />

        {/* Billiard Tables */}
        <section>
          <div className={cn("flex items-center gap-2 mb-3", compact && "mb-2")}>
            <Layers className={cn("text-muted-foreground", compact ? "w-4 h-4" : "w-5 h-5")} />
            <h2 className={cn("font-semibold text-foreground", compact ? "text-sm" : "text-lg")}>Billiard Tables</h2>
          </div>
          <div className={cn("grid gap-3", compact ? "grid-cols-3" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4")}>
            {tableTimers.map(timer => (
              <TimerCard
                key={timer.id}
                timer={timer}
                onStart={startTimer}
                onStop={stopTimer}
                onExtend={extendTimer}
                onReset={resetTimer}
                onSetDuration={setDuration}
                compact={compact}
              />
            ))}
          </div>
        </section>

        {/* PlayStation */}
        <section>
          <div className={cn("flex items-center gap-2 mb-3", compact && "mb-2")}>
            <Gamepad className={cn("text-muted-foreground", compact ? "w-4 h-4" : "w-5 h-5")} />
            <h2 className={cn("font-semibold text-foreground", compact ? "text-sm" : "text-lg")}>PlayStation</h2>
          </div>
          <div className={cn("grid gap-3", compact ? "grid-cols-3" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4")}>
            {playstationTimers.map(timer => (
              <TimerCard
                key={timer.id}
                timer={timer}
                onStart={startTimer}
                onStop={stopTimer}
                onExtend={extendTimer}
                onReset={resetTimer}
                onSetDuration={setDuration}
                compact={compact}
              />
            ))}
          </div>
        </section>

        {/* VIP Rooms */}
        <section>
          <div className={cn("flex items-center gap-2 mb-3", compact && "mb-2")}>
            <Crown className={cn("text-primary", compact ? "w-4 h-4" : "w-5 h-5")} />
            <h2 className={cn("font-semibold text-foreground", compact ? "text-sm" : "text-lg")}>VIP Rooms</h2>
          </div>
          <div className={cn("grid gap-3", compact ? "grid-cols-3" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4")}>
            {vipTimers.map(timer => (
              <TimerCard
                key={timer.id}
                timer={timer}
                onStart={startTimer}
                onStop={stopTimer}
                onExtend={extendTimer}
                onReset={resetTimer}
                onSetDuration={setDuration}
                compact={compact}
              />
            ))}
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default Index;
