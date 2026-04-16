// CSV Parser Service — extracts tournament data from leaderboard CSV files
// Supports 3-column format: Position, Player, Score

import type {
  ParsedGolfer,
  ParsedTournament,
} from '../../../../shared/types/parsed-tournament.types';

export type { ParsedGolfer, ParsedTournament };

/**
 * Split a full player name into firstName and lastName.
 * Uses the first space as the split point.
 */
export function parsePlayerName(player: string): { firstName: string; lastName: string } {
  const trimmed = player.trim();
  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex === -1) {
    return { firstName: trimmed, lastName: '' };
  }
  return {
    firstName: trimmed.substring(0, spaceIndex),
    lastName: trimmed.substring(spaceIndex + 1),
  };
}

/**
 * Detect scoring format from the CSV header row.
 * "Stableford Points" → stableford, "Nett Score" / "Medal" → medal.
 */
export function detectScoringFormatFromHeader(header: string): 'stableford' | 'medal' {
  const lower = header.toLowerCase();
  if (lower.includes('medal') || lower.includes('nett')) return 'medal';
  return 'stableford';
}

/**
 * Parse a tournament leaderboard CSV into structured data.
 *
 * Expected CSV format:
 *   Position,Player,Stableford Points
 *   1,John Pulley,41
 *   2,Alex Hoque,40
 *
 * Handles BOM prefix, tab or comma delimiters, and tied positions.
 * Returns empty name and date — the admin fills these in the review step.
 */
export function parseTournamentCsv(csvText: string): ParsedTournament {
  // Strip UTF-8 BOM if present
  const clean = csvText.replace(/^\uFEFF/, '');

  const lines = clean.split(/\r?\n/).filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { name: '', date: '', scoringFormat: 'stableford', golfers: [] };
  }

  // Detect delimiter from the header line
  const headerLine = lines[0];
  const delimiter = headerLine.includes('\t') ? '\t' : ',';

  // Detect scoring format from header
  const scoringFormat = detectScoringFormatFromHeader(headerLine);

  const golfers: ParsedGolfer[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(delimiter);
    if (parts.length < 3) continue;

    const positionStr = parts[0].trim().replace(/^"/, '').replace(/"$/, '');
    const playerStr = parts[1].trim().replace(/^"/, '').replace(/"$/, '');
    const scoreStr = parts[2].trim().replace(/^"/, '').replace(/"$/, '');

    const position = parseInt(positionStr, 10);
    const rawScore = parseInt(scoreStr, 10);

    if (isNaN(position) || isNaN(rawScore)) continue;
    if (!playerStr) continue;

    const { firstName, lastName } = parsePlayerName(playerStr);

    golfers.push({ position, firstName, lastName, rawScore });
  }

  // Name and date are left empty — admin fills these in the review step
  return { name: '', date: '', scoringFormat, golfers };
}
