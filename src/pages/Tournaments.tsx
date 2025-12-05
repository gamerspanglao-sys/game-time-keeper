import { useState } from 'react';
import { Layout } from '@/components/Layout';
import { useTournaments } from '@/hooks/useTournaments';
import { TOURNAMENT_ENTRY_FEE } from '@/types/tournament';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Trophy, 
  Plus, 
  UserPlus, 
  Trash2, 
  CheckCircle2, 
  XCircle,
  Users,
  Banknote,
  Calendar
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

const Tournaments = () => {
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

  const [showNewTournament, setShowNewTournament] = useState(false);
  const [newTournamentName, setNewTournamentName] = useState('');
  const [newTournamentDate, setNewTournamentDate] = useState('');
  
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [newParticipantName, setNewParticipantName] = useState('');
  const [newParticipantPhone, setNewParticipantPhone] = useState('');

  const activeTournament = getActiveTournament();
  const pastTournaments = tournaments.filter(t => !t.isActive);

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

  const totalPaid = activeTournament?.participants.filter(p => p.isPaid).length || 0;
  const totalParticipants = activeTournament?.participants.length || 0;
  const totalCollected = totalPaid * TOURNAMENT_ENTRY_FEE;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
              <Trophy className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Tournaments</h1>
              <p className="text-sm text-muted-foreground">Manage tournament participants</p>
            </div>
          </div>
          {!activeTournament && (
            <Button onClick={() => setShowNewTournament(true)} variant="default">
              <Plus className="w-4 h-4 mr-2" />
              New Tournament
            </Button>
          )}
        </div>

        {/* Active Tournament */}
        {activeTournament ? (
          <div className="gaming-card space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-foreground">{activeTournament.name}</h2>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                  <Calendar className="w-4 h-4" />
                  <span>{activeTournament.date}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => closeTournament(activeTournament.id)}
                >
                  Close Tournament
                </Button>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-secondary/50 rounded-lg p-3 text-center">
                <Users className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
                <div className="text-2xl font-bold text-foreground">{totalParticipants}</div>
                <div className="text-xs text-muted-foreground">Participants</div>
              </div>
              <div className="bg-success/10 rounded-lg p-3 text-center border border-success/20">
                <CheckCircle2 className="w-5 h-5 mx-auto text-success mb-1" />
                <div className="text-2xl font-bold text-success">{totalPaid}</div>
                <div className="text-xs text-muted-foreground">Paid</div>
              </div>
              <div className="bg-primary/10 rounded-lg p-3 text-center border border-primary/20">
                <Banknote className="w-5 h-5 mx-auto text-primary mb-1" />
                <div className="text-2xl font-bold text-primary">{totalCollected} ₱</div>
                <div className="text-xs text-muted-foreground">Collected</div>
              </div>
            </div>

            {/* Entry Fee */}
            <div className="text-center py-2 bg-warning/10 rounded-lg border border-warning/20">
              <span className="text-warning font-semibold">Entry Fee: {TOURNAMENT_ENTRY_FEE} ₱</span>
            </div>

            {/* Add Participant Button */}
            <Button 
              onClick={() => setShowAddParticipant(true)} 
              className="w-full"
              variant="outline"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Add Participant
            </Button>

            {/* Participants List */}
            <div className="space-y-2">
              {activeTournament.participants.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>No participants yet</p>
                </div>
              ) : (
                activeTournament.participants.map((participant, index) => (
                  <div 
                    key={participant.id}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border transition-all",
                      participant.isPaid 
                        ? "bg-success/5 border-success/30" 
                        : "bg-card border-border"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-xs font-medium">
                        {index + 1}
                      </span>
                      <div>
                        <div className="font-medium text-foreground">{participant.name}</div>
                        {participant.phone && (
                          <div className="text-xs text-muted-foreground">{participant.phone}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant={participant.isPaid ? "default" : "outline"}
                        size="sm"
                        onClick={() => togglePayment(activeTournament.id, participant.id)}
                        className={cn(
                          participant.isPaid && "bg-success hover:bg-success/90"
                        )}
                      >
                        {participant.isPaid ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 mr-1" />
                            Paid
                          </>
                        ) : (
                          <>
                            <XCircle className="w-4 h-4 mr-1" />
                            Not Paid
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeParticipant(activeTournament.id, participant.id)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="gaming-card text-center py-12">
            <Trophy className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No Active Tournament</h3>
            <p className="text-muted-foreground mb-4">Create a new tournament to start registering participants</p>
            <Button onClick={() => setShowNewTournament(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Tournament
            </Button>
          </div>
        )}

        {/* Past Tournaments */}
        {pastTournaments.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">Past Tournaments</h3>
            {pastTournaments.map(tournament => {
              const paid = tournament.participants.filter(p => p.isPaid).length;
              const total = tournament.participants.length;
              return (
                <div key={tournament.id} className="gaming-card p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-foreground">{tournament.name}</div>
                      <div className="text-sm text-muted-foreground">{tournament.date}</div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm font-medium text-foreground">{paid}/{total} paid</div>
                        <div className="text-xs text-primary">{paid * tournament.entryFee} ₱</div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteTournament(tournament.id)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Tournament Dialog */}
      <Dialog open={showNewTournament} onOpenChange={setShowNewTournament}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Tournament</DialogTitle>
            <DialogDescription>Start a new tournament with {TOURNAMENT_ENTRY_FEE} ₱ entry fee</DialogDescription>
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
              <Plus className="w-4 h-4 mr-2" />
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
            <DialogDescription>Register a new participant for the tournament</DialogDescription>
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
              onKeyDown={(e) => e.key === 'Enter' && handleAddParticipant()}
            />
            <Button onClick={handleAddParticipant} className="w-full">
              <UserPlus className="w-4 h-4 mr-2" />
              Add
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default Tournaments;
