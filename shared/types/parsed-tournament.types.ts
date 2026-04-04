// Parsed tournament data types — shared between frontend and backend

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
