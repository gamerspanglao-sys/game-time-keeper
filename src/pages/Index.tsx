import { Layout } from '@/components/Layout';
import { TimerCard } from '@/components/TimerCard';
import { CurrentSessions } from '@/components/CurrentSessions';
import { OvertimeStats } from '@/components/OvertimeStats';
import { Button } from '@/components/ui/button';

import { useSupabaseTimers } from '@/hooks/useSupabaseTimers';
import { useTimerAlerts } from '@/hooks/useTimerAlerts';
import { useFullscreen } from '@/hooks/useFullscreen';
import { useSupabaseQueue } from '@/hooks/useSupabaseQueue';
import { useWakeLock } from '@/hooks/useWakeLock';
import { Layers, Gamepad, Crown, Loader2, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const Index = () => {
  const { 
    timers, 
    startTimer, 
    stopTimer, 
    extendTimer, 
    resetTimer, 
    setDuration, 
    adjustTime, 
    isLoading,
    isPaused,
    pauseAllTimers,
    resumeAllTimers,
  } = useSupabaseTimers();
  const { playConfirmSound, stopAlarm, stopAllAlarms, notifyQueueNext, reloadAudio } = useTimerAlerts();
  const { isFullscreen } = useFullscreen();
  const { getQueueForTimer, addToQueue, removeFromQueue } = useSupabaseQueue();
  
  // Keep screen awake when any timer is running
  const hasActiveTimers = timers.some(t => t.status === 'running' || t.status === 'warning' || t.status === 'finished');
  const activeTimersCount = timers.filter(t => t.status === 'running' || t.status === 'warning' || t.status === 'finished').length;
  useWakeLock(hasActiveTimers);

  const tableTimers = timers.filter(t => t.category === 'billiard');
  const playstationTimers = timers.filter(t => t.category === 'playstation');
  const vipTimers = timers.filter(t => t.category === 'vip');
  
  // Check if any timer is in finished state for screen flash effect
  const hasFinishedTimer = timers.some(t => t.status === 'finished');

  const handleReloadAudio = () => {
    reloadAudio();
    toast.success('Audio reloaded');
  };

  const compact = isFullscreen;

  if (isLoading) {
    return (
      <Layout 
        compact={compact}
        isPaused={isPaused}
        activeTimersCount={activeTimersCount}
        onPauseAll={pauseAllTimers}
        onResumeAll={resumeAllTimers}
      >
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading timers...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout 
      compact={compact}
      isPaused={isPaused}
      activeTimersCount={activeTimersCount}
      onPauseAll={pauseAllTimers}
      onResumeAll={resumeAllTimers}
    >
      {/* Full screen flash overlay for alerts */}
      {hasFinishedTimer && (
        <div className="fixed inset-0 bg-destructive pointer-events-none z-50 screen-flash" />
      )}
      <div className={cn("max-w-7xl mx-auto", compact ? "space-y-4" : "space-y-6")}>
        {/* Audio Reload Button */}
        <div className="flex justify-end">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleReloadAudio}
            className="gap-2"
          >
            <Volume2 className="w-4 h-4" />
            Reload Audio
          </Button>
        </div>

        {/* Current Sessions */}
        <CurrentSessions timers={timers} compact={compact} onReset={resetTimer} onStopAlarm={stopAlarm} />

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
                onAdjustTime={adjustTime}
                playConfirmSound={playConfirmSound}
                stopAlarm={stopAlarm}
                notifyQueueNext={notifyQueueNext}
                compact={compact}
                queue={getQueueForTimer(timer.id)}
                onAddToQueue={addToQueue}
                onRemoveFromQueue={removeFromQueue}
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
                onAdjustTime={adjustTime}
                playConfirmSound={playConfirmSound}
                stopAlarm={stopAlarm}
                notifyQueueNext={notifyQueueNext}
                compact={compact}
                queue={getQueueForTimer(timer.id)}
                onAddToQueue={addToQueue}
                onRemoveFromQueue={removeFromQueue}
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
                onAdjustTime={adjustTime}
                playConfirmSound={playConfirmSound}
                stopAlarm={stopAlarm}
                notifyQueueNext={notifyQueueNext}
                compact={compact}
                queue={getQueueForTimer(timer.id)}
                onAddToQueue={addToQueue}
                onRemoveFromQueue={removeFromQueue}
              />
            ))}
          </div>
        </section>

        {/* Overtime Stats - at the bottom */}
        <OvertimeStats compact={compact} />
      </div>
    </Layout>
  );
};

export default Index;
