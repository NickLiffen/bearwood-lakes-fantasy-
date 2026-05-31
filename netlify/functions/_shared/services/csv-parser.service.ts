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
 * Medal indicators: "Medal", "Nett"/"Net Score", "To Par", "Total Net".
 * Otherwise defaults to stableford.
 */
export function detectScoringFormatFromHeader(header: string): 'stableford' | 'medal' {
  const lower = header.toLowerCase();
  if (
    lower.includes('medal') ||
    lower.includes('nett') ||
    lower.includes('to par') ||
    lower.includes('total net') ||
    /\bnet\s*score\b/.test(lower)
  ) {
    return 'medal';
  }
  return 'stableford';
}

type ColumnIndices = {
  position: number;
  player: number;
  firstName: number;
  lastName: number;
  stableford: number;
  toPar: number;
  totalNet: number;
};

const NOT_FOUND = -1;

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Map header cells to column indices by name. Supports both legacy
 * (Position, Player, Stableford Points / Nett Score) and split-name
 * (Position, First Name, Last Name, Total Net, To Par, ...) formats.
 */
export function mapHeaderColumns(headerCells: string[]): ColumnIndices {
  const indices: ColumnIndices = {
    position: NOT_FOUND,
    player: NOT_FOUND,
    firstName: NOT_FOUND,
    lastName: NOT_FOUND,
    stableford: NOT_FOUND,
    toPar: NOT_FOUND,
    totalNet: NOT_FOUND,
  };

  headerCells.forEach((raw, i) => {
    const h = normalizeHeader(raw);
    if (!h) return;

    if (h === 'position' || h === 'pos' || h === 'pos.' || h === 'place') {
      indices.position = i;
    } else if (h === 'player' || h === 'name' || h === 'full name') {
      indices.player = i;
    } else if (h === 'first name' || h === 'firstname' || h === 'given name') {
      indices.firstName = i;
    } else if (h === 'last name' || h === 'lastname' || h === 'surname' || h === 'family name') {
      indices.lastName = i;
    } else if (h.includes('stableford')) {
      indices.stableford = i;
    } else if (h === 'to par' || h === 'topar') {
      indices.toPar = i;
    } else if (
      h === 'total net' ||
      h === 'nett score' ||
      h === 'net score' ||
      h === 'nett' ||
      h === 'medal score' ||
      h === 'medal'
    ) {
      indices.totalNet = i;
    }
  });

  return indices;
}

/**
 * Parse a medal score cell. Accepts forms like "-3", "+2", "E", "0".
 * Returns NaN if the cell cannot be interpreted.
 */
export function parseMedalScore(value: string): number {
  const v = value.trim();
  if (!v) return NaN;
  if (v.toUpperCase() === 'E') return 0;
  // Allow leading +/- and digits only.
  if (!/^[+-]?\d+$/.test(v)) return NaN;
  return parseInt(v, 10);
}

/**
 * Parse a tournament leaderboard CSV into structured data.
 *
 * Supported headers:
 *   - Legacy:    Position, Player, Stableford Points | Nett Score
 *   - Split:     Position, First Name, Last Name, Total Net, To Par[, ...]
 *
 * For medal rows, the to-par value is preferred (e.g. -3, +1, E)
 * because that is what the scoring system stores in `rawScore`.
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
  const headerCells = parseCsvLine(headerLine, delimiter);
  const cols = mapHeaderColumns(headerCells);

  // Detect scoring format from header line
  const scoringFormat = detectScoringFormatFromHeader(headerLine);

  // Pick which column holds the score we want to load:
  // - medal: prefer "To Par" (signed value), fall back to "Total Net".
  // - stableford: use "Stableford Points".
  let scoreCol = NOT_FOUND;
  let scoreParser: (raw: string) => number = (raw) => parseInt(raw, 10);
  if (scoringFormat === 'medal') {
    if (cols.toPar !== NOT_FOUND) {
      scoreCol = cols.toPar;
      scoreParser = parseMedalScore;
    } else if (cols.totalNet !== NOT_FOUND) {
      scoreCol = cols.totalNet;
      scoreParser = parseMedalScore;
    }
  } else if (cols.stableford !== NOT_FOUND) {
    scoreCol = cols.stableford;
  }

  // If we cannot identify the named columns, fall back to the legacy
  // 3-column positional layout (Position, Player, Score).
  const useLegacyFallback =
    cols.position === NOT_FOUND ||
    (cols.player === NOT_FOUND && (cols.firstName === NOT_FOUND || cols.lastName === NOT_FOUND)) ||
    scoreCol === NOT_FOUND;

  const golfers: ParsedGolfer[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = parseCsvLine(line, delimiter);

    let positionStr: string;
    let firstName: string;
    let lastName: string;
    let scoreStr: string;

    if (useLegacyFallback) {
      if (parts.length < 3) continue;
      positionStr = (parts[0] ?? '').trim();
      const playerStr = (parts[1] ?? '').trim();
      scoreStr = (parts[2] ?? '').trim();
      if (!playerStr) continue;
      const split = parsePlayerName(playerStr);
      firstName = split.firstName;
      lastName = split.lastName;
    } else {
      positionStr = (parts[cols.position] ?? '').trim();
      scoreStr = (parts[scoreCol] ?? '').trim();

      if (cols.firstName !== NOT_FOUND && cols.lastName !== NOT_FOUND) {
        firstName = (parts[cols.firstName] ?? '').trim();
        lastName = (parts[cols.lastName] ?? '').trim();
      } else if (cols.player !== NOT_FOUND) {
        const playerStr = (parts[cols.player] ?? '').trim();
        if (!playerStr) continue;
        const split = parsePlayerName(playerStr);
        firstName = split.firstName;
        lastName = split.lastName;
      } else {
        continue;
      }
    }

    if (!firstName && !lastName) continue;

    // Strip optional "T" prefix for tied positions (e.g., "T24" → 24)
    const position = parseInt(positionStr.replace(/^T/i, ''), 10);
    const rawScore = scoringFormat === 'medal' ? scoreParser(scoreStr) : parseInt(scoreStr, 10);

    if (isNaN(position) || isNaN(rawScore)) continue;

    golfers.push({ position, firstName, lastName, rawScore });
  }

  // Name and date are left empty — admin fills these in the review step
  return { name: '', date: '', scoringFormat, golfers };
}
