export interface QueueEntry {
  id: string;
  name: string;
  timerId: string;
  timestamp: number;
  hours: number; // prepaid hours (1-5)
}

export interface QueueState {
  [timerId: string]: QueueEntry[];
}
