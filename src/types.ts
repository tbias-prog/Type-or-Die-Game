export interface GameWord {
  id: string;
  text: string;
  x: number; // percentage of stage width (e.g. 15 to 85)
  y: number; // percentage of stage height (e.g. -5 to 100)
  speed: number; // fall speed in percentage per second
  color: string; // glowing hex color
}

export interface LaserLine {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  progress: number;
  duration: number;
  color: string;
}

export interface SparkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  decay: number;
}

export interface LeaderboardEntry {
  player_name: string;
  score: number;
  date?: string;
}

export interface SyncHistoryEntry {
  timestamp: string;
  action: string;
  status: 'success' | 'failed';
  message: string;
}

export interface MatchHistoryEntry {
  id: number;
  score: number;
  wpm: number;
  accuracy: number;
  date: string;
}

export type GamePanel = 'start' | 'game' | 'gameover' | 'leaderboard' | 'history' | 'auth' | 'match_history';
