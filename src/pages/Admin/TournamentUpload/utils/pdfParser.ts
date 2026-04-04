// Type definitions for parsed tournament data (parsing now happens server-side)

export interface ParsedGolfer {
  position: number;
  firstName: string;
  lastName: string;
  rawScore: number;
}

export interface ParsedTournament {
  name: string;
  date: string; // ISO date string (YYYY-MM-DD)
  scoringFormat: 'stableford' | 'medal';
  golfers: ParsedGolfer[];
}

