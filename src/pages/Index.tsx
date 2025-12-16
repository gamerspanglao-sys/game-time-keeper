import { useState } from 'react';
import { Layout } from '@/components/Layout';
import { TimerCard } from '@/components/TimerCard';
import { CurrentSessions } from '@/components/CurrentSessions';
import { OvertimeStats } from '@/components/OvertimeStats';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

import { useSupabaseTimers } from '@/hooks/useSupabaseTimers';
import { useTimerAlerts } from '@/hooks/useTimerAlerts';
import { useFullscreen } from '@/hooks/useFullscreen';
import { useSupabaseQueue } from '@/hooks/useSupabaseQueue';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useTournaments } from '@/hooks/useTournaments';
import { TOURNAMENT_ENTRY_FEE } from '@/types/tournament';
import { Layers, Gamepad, Crown, Loader2, Volume2, Trophy, Plus, UserPlus, Trash2, CheckCircle2, XCircle, Users, Banknote, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
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
    startPromoTimer,
  } = useSupabaseTimers();
  const { playConfirmSound, stopAlarm, stopAllAlarms, notifyQueueNext, reloadAudio } = useTimerAlerts();
  const { isFullscreen } = useFullscreen();
  const { getQueueForTimer, addToQueue, removeFromQueue } = useSupabaseQueue();
  
  // Tournament state
  const {
    tournaments,
    createTournament,
    addParticipant,
    removeParticipant,
    togglePayment,
    closeTournament,
    deleteTournament,
    getActiveTournament,
  } = useTournaments();

  const [showTournaments, setShowTournaments] = useState(false);
  const [showNewTournament, setShowNewTournament] = useState(false);
  const [newTournamentName, setNewTournamentName] = useState('');
  const [newTournamentDate, setNewTournamentDate] = useState('');
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [newParticipantName, setNewParticipantName] = useState('');
  const [newParticipantPhone, setNewParticipantPhone] = useState('');

  const activeTournament = getActiveTournament();
  const pastTournaments = tournaments.filter(t => !t.isActive);
  const totalPaid = activeTournament?.participants.filter(p => p.isPaid).length || 0;
  const totalParticipants = activeTournament?.participants.length || 0;
  const totalCollected = totalPaid * TOURNAMENT_ENTRY_FEE;

  const handleCreateTournament = () => {
    if (newTournamentName.trim()) {
      createTournament(newTournamentName.trim(), newTournamentDate || new Date().toISOString().split('T')[0]);
      setNewTournamentName('');
      setNewTournamentDate('');
      setShowNewTournament(false);
    }
  };

  const handleAddParticipant = () => {
    if (activeTournament && newParticipantName.trim()) {
      addParticipant(activeTournament.id, newParticipantName.trim(), newParticipantPhone.trim() || undefined);
      setNewParticipantName('');
      setNewParticipantPhone('');
      setShowAddParticipant(false);
    }
  };
  
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
                onStartPromo={timer.id === 'vip-super' ? startPromoTimer : undefined}
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

        {/* Tournaments Section */}
        {!compact && (
          <section className="gaming-card">
            <button
              onClick={() => setShowTournaments(!showTournaments)}
              className="w-full flex items-center justify-between p-4"
            >
              <div className="flex items-center gap-3">
                <Trophy className="w-5 h-5 text-primary" />
                <div className="text-left">
                  <h2 className="font-semibold text-foreground">Tournaments</h2>
                  {activeTournament && (
                    <p className="text-xs text-muted-foreground">
                      {activeTournament.name} • {totalPaid}/{totalParticipants} paid • {totalCollected}₱
                    </p>
                  )}
                </div>
              </div>
              {showTournaments ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>

            {showTournaments && (
              <div className="px-4 pb-4 space-y-4">
                {activeTournament ? (
                  <>
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-secondary/50 rounded-lg p-3 text-center">
                        <Users className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
                        <div className="text-xl font-bold">{totalParticipants}</div>
                        <div className="text-xs text-muted-foreground">Players</div>
                      </div>
                      <div className="bg-green-500/10 rounded-lg p-3 text-center border border-green-500/20">
                        <CheckCircle2 className="w-4 h-4 mx-auto text-green-500 mb-1" />
                        <div className="text-xl font-bold text-green-500">{totalPaid}</div>
                        <div className="text-xs text-muted-foreground">Paid</div>
                      </div>
                      <div className="bg-primary/10 rounded-lg p-3 text-center border border-primary/20">
                        <Banknote className="w-4 h-4 mx-auto text-primary mb-1" />
                        <div className="text-xl font-bold text-primary">{totalCollected}₱</div>
                        <div className="text-xs text-muted-foreground">Total</div>
                      </div>
                    </div>

                    {/* Add Participant */}
                    <Button onClick={() => setShowAddParticipant(true)} className="w-full" variant="outline">
                      <UserPlus className="w-4 h-4 mr-2" />
                      Add Participant
                    </Button>

                    {/* Participants List */}
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {activeTournament.participants.map((participant, index) => (
                        <div
                          key={participant.id}
                          className={cn(
                            "flex items-center justify-between p-2 rounded-lg border",
                            participant.isPaid ? "bg-green-500/5 border-green-500/30" : "bg-card border-border"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-xs">
                              {index + 1}
                            </span>
                            <span className="font-medium text-sm">{participant.name}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant={participant.isPaid ? "default" : "outline"}
                              size="sm"
                              onClick={() => togglePayment(activeTournament.id, participant.id)}
                              className={cn("h-7 text-xs", participant.isPaid && "bg-green-500 hover:bg-green-600")}
                            >
                              {participant.isPaid ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeParticipant(activeTournament.id, participant.id)}
                              className="h-7 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Close Tournament */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => closeTournament(activeTournament.id)}
                    >
                      Close Tournament
                    </Button>
                  </>
                ) : (
                  <div className="text-center py-6">
                    <Trophy className="w-10 h-10 mx-auto mb-2 text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground mb-3">No active tournament</p>
                    <Button onClick={() => setShowNewTournament(true)} size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      Create Tournament
                    </Button>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Overtime Stats - at the bottom */}
        <OvertimeStats compact={compact} />
      </div>

      {/* New Tournament Dialog */}
      <Dialog open={showNewTournament} onOpenChange={setShowNewTournament}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Tournament</DialogTitle>
            <DialogDescription>Entry fee: {TOURNAMENT_ENTRY_FEE}₱</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <Input
              placeholder="Tournament name"
              value={newTournamentName}
              onChange={(e) => setNewTournamentName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateTournament()}
            />
            <Input
              type="date"
              value={newTournamentDate}
              onChange={(e) => setNewTournamentDate(e.target.value)}
            />
            <Button onClick={handleCreateTournament} className="w-full">
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Participant Dialog */}
      <Dialog open={showAddParticipant} onOpenChange={setShowAddParticipant}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Participant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <Input
              placeholder="Name"
              value={newParticipantName}
              onChange={(e) => setNewParticipantName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddParticipant()}
            />
            <Input
              placeholder="Phone (optional)"
              value={newParticipantPhone}
              onChange={(e) => setNewParticipantPhone(e.target.value)}
            />
            <Button onClick={handleAddParticipant} className="w-full">
              Add
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default Index;
