export interface TournamentParticipant {
  id: string;
  name: string;
  phone?: string;
  isPaid: boolean;
  registeredAt: number;
}

export interface Tournament {
  id: string;
  name: string;
  date: string;
  entryFee: number;
  participants: TournamentParticipant[];
  isActive: boolean;
  createdAt: number;
}

export const TOURNAMENT_ENTRY_FEE = 200; // pesos
