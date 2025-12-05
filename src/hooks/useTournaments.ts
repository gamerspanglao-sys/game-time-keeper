import { useState, useEffect, useCallback } from 'react';
import { Tournament, TournamentParticipant, TOURNAMENT_ENTRY_FEE } from '@/types/tournament';

const STORAGE_KEY = 'gaming-tournaments';

function loadTournaments(): Tournament[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveTournaments(tournaments: Tournament[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tournaments));
}

export function useTournaments() {
  const [tournaments, setTournaments] = useState<Tournament[]>(() => loadTournaments());

  useEffect(() => {
    saveTournaments(tournaments);
  }, [tournaments]);

  const createTournament = useCallback((name: string, date: string) => {
    const newTournament: Tournament = {
      id: `tournament-${Date.now()}`,
      name,
      date,
      entryFee: TOURNAMENT_ENTRY_FEE,
      participants: [],
      isActive: true,
      createdAt: Date.now(),
    };
    setTournaments(prev => [newTournament, ...prev]);
    return newTournament.id;
  }, []);

  const addParticipant = useCallback((tournamentId: string, name: string, phone?: string) => {
    setTournaments(prev => prev.map(t => {
      if (t.id !== tournamentId) return t;
      const newParticipant: TournamentParticipant = {
        id: `participant-${Date.now()}`,
        name,
        phone,
        isPaid: false,
        registeredAt: Date.now(),
      };
      return { ...t, participants: [...t.participants, newParticipant] };
    }));
  }, []);

  const removeParticipant = useCallback((tournamentId: string, participantId: string) => {
    setTournaments(prev => prev.map(t => {
      if (t.id !== tournamentId) return t;
      return { ...t, participants: t.participants.filter(p => p.id !== participantId) };
    }));
  }, []);

  const togglePayment = useCallback((tournamentId: string, participantId: string) => {
    setTournaments(prev => prev.map(t => {
      if (t.id !== tournamentId) return t;
      return {
        ...t,
        participants: t.participants.map(p =>
          p.id === participantId ? { ...p, isPaid: !p.isPaid } : p
        ),
      };
    }));
  }, []);

  const closeTournament = useCallback((tournamentId: string) => {
    setTournaments(prev => prev.map(t =>
      t.id === tournamentId ? { ...t, isActive: false } : t
    ));
  }, []);

  const deleteTournament = useCallback((tournamentId: string) => {
    setTournaments(prev => prev.filter(t => t.id !== tournamentId));
  }, []);

  const getActiveTournament = useCallback(() => {
    return tournaments.find(t => t.isActive);
  }, [tournaments]);

  return {
    tournaments,
    createTournament,
    addParticipant,
    removeParticipant,
    togglePayment,
    closeTournament,
    deleteTournament,
    getActiveTournament,
  };
}
