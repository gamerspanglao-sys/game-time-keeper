import { Layout } from '@/components/Layout';
import { TimerCard } from '@/components/TimerCard';
import { CurrentSessions } from '@/components/CurrentSessions';
import { useTimers } from '@/hooks/useTimers';
import { Layers, Gamepad, Crown } from 'lucide-react';

const Index = () => {
  const { timers, startTimer, pauseTimer, resumeTimer, stopTimer, resetTimer } = useTimers();

  const tableTimers = timers.filter(t => t.category === 'table');
  const playstationTimers = timers.filter(t => t.category === 'playstation');
  const vipTimers = timers.filter(t => t.category === 'vip');

  return (
    <Layout>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Current Sessions */}
        <CurrentSessions timers={timers} />

        {/* Billiard Tables */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-secondary border border-border">
              <Layers className="w-5 h-5 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Billiard Tables</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tableTimers.map(timer => (
              <TimerCard
                key={timer.id}
                timer={timer}
                onStart={startTimer}
                onPause={pauseTimer}
                onResume={resumeTimer}
                onStop={stopTimer}
                onReset={resetTimer}
              />
            ))}
          </div>
        </section>

        {/* PlayStation */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-secondary border border-border">
              <Gamepad className="w-5 h-5 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">PlayStation</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {playstationTimers.map(timer => (
              <TimerCard
                key={timer.id}
                timer={timer}
                onStart={startTimer}
                onPause={pauseTimer}
                onResume={resumeTimer}
                onStop={stopTimer}
                onReset={resetTimer}
              />
            ))}
          </div>
        </section>

        {/* VIP Rooms */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <Crown className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">VIP Rooms</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {vipTimers.map(timer => (
              <TimerCard
                key={timer.id}
                timer={timer}
                onStart={startTimer}
                onPause={pauseTimer}
                onResume={resumeTimer}
                onStop={stopTimer}
                onReset={resetTimer}
              />
            ))}
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default Index;
