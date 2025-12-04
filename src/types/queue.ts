export interface QueueEntry {
  id: string;
  name: string;
  timerId: string;
  timestamp: number;
}

export interface QueueState {
  [timerId: string]: QueueEntry[];
}
