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
 * Parse a single CSV line into fields, respecting quoted values.
 * Handles commas inside quoted fields (e.g., `"Pulley, John"`)
 * and escaped quotes (`""` inside quoted fields).
 */
export function parseCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i += 2;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
        }
      } else {
        current += char;
        i++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === delimiter) {
        fields.push(current);
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }
  }

  fields.push(current);
  return fields;
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

    const parts = parseCsvLine(line, delimiter);
    if (parts.length < 3) continue;

    const positionStr = parts[0].trim();
    const playerStr = parts[1].trim();
    const scoreStr = parts[2].trim();

    // Strip optional "T" prefix for tied positions (e.g., "T24" → 24)
    const position = parseInt(positionStr.replace(/^T/i, ''), 10);
    const rawScore = parseInt(scoreStr, 10);

    if (isNaN(position) || isNaN(rawScore)) continue;
    if (!playerStr) continue;

    const { firstName, lastName } = parsePlayerName(playerStr);

    golfers.push({ position, firstName, lastName, rawScore });
  }

  // Name and date are left empty — admin fills these in the review step
  return { name: '', date: '', scoringFormat, golfers };
}
