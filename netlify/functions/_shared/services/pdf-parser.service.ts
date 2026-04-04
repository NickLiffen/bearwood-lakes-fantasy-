// PDF Parser Service — extracts tournament data from ECG leaderboard PDFs
// Uses unpdf (serverless-friendly) with position-based text reconstruction

import { getDocumentProxy } from 'unpdf';
import type {
  ParsedGolfer,
  ParsedTournament,
} from '../../../../shared/types/parsed-tournament.types';

export type { ParsedGolfer, ParsedTournament };

interface TextItem {
  x: number;
  y: number;
  text: string;
}

/**
 * Extract text from a PDF buffer using position-based line reconstruction.
 *
 * PDF renderers emit text items in render order, which can place table columns
 * out of reading order. This function groups items by Y coordinate (within a
 * tolerance), sorts each row by X, and joins them into natural reading lines.
 */
export async function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
  const Y_TOLERANCE = 3; // pixels — groups items on the same visual line

  const doc = await getDocumentProxy(new Uint8Array(buffer));
  const pageTexts: string[] = [];

  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();

      const items: TextItem[] = [];
      for (const rawItem of content.items) {
        if (!('str' in rawItem)) continue;
        const s = (rawItem as { str: string }).str.trim();
        if (!s) continue;
        const transform = (rawItem as { transform: number[] }).transform;
        items.push({ x: transform[4], y: transform[5], text: s });
      }

      // Sort by Y descending (PDF coordinates go bottom-up, so top of page = highest Y)
      items.sort((a, b) => b.y - a.y);

      // Cluster items into rows using Y tolerance
      const rows: TextItem[][] = [];
      let currentRow: TextItem[] = [];
      let currentY: number | null = null;

      for (const item of items) {
        if (currentY === null || Math.abs(item.y - currentY) > Y_TOLERANCE) {
          if (currentRow.length > 0) rows.push(currentRow);
          currentRow = [item];
          currentY = item.y;
        } else {
          currentRow.push(item);
        }
      }
      if (currentRow.length > 0) rows.push(currentRow);

      // Sort items within each row by X (left to right), join into lines
      const lines = rows.map((row) => {
        row.sort((a, b) => a.x - b.x);
        return row.map((item) => item.text).join(' ');
      });

      pageTexts.push(lines.join('\n'));
    }

    return pageTexts.join('\n');
  } finally {
    await doc.destroy();
  }
}

/**
 * Parse a date string like "3 April 2026" into ISO format "2026-04-03".
 */
export function parseEcgDate(dateStr: string): string {
  const months: Record<string, string> = {
    january: '01',
    february: '02',
    march: '03',
    april: '04',
    may: '05',
    june: '06',
    july: '07',
    august: '08',
    september: '09',
    october: '10',
    november: '11',
    december: '12',
  };

  const trimmed = dateStr.trim();

  // Try "3 April 2026" format
  const longMatch = trimmed.match(/^(\d{1,2})\s+(\w+)\s+(\d{4})$/);
  if (longMatch) {
    const day = longMatch[1].padStart(2, '0');
    const monthKey = longMatch[2].toLowerCase();
    const month = months[monthKey];
    const year = longMatch[3];
    if (month) {
      return `${year}-${month}-${day}`;
    }
  }

  // Try "DD/MM/YYYY" format
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, '0');
    const month = slashMatch[2].padStart(2, '0');
    const year = slashMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Try "DD/MM/YY" format
  const shortSlashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (shortSlashMatch) {
    const day = shortSlashMatch[1].padStart(2, '0');
    const month = shortSlashMatch[2].padStart(2, '0');
    const year = `20${shortSlashMatch[3]}`;
    return `${year}-${month}-${day}`;
  }

  return trimmed;
}

/**
 * Detect scoring format from the PDF text.
 */
export function detectScoringFormat(text: string): 'stableford' | 'medal' {
  const lower = text.toLowerCase();
  if (lower.includes('medal')) return 'medal';
  return 'stableford';
}

/**
 * Parse extracted PDF text lines into structured tournament data.
 */
export function parseTournamentText(rawText: string): ParsedTournament {
  const lines = rawText
    .split('\n')
    .flatMap((line) => line.split(/(?<=\d)\s{2,}(?=\d)/))
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let name = '';
  let dateStr = '';
  let scoringFormat: 'stableford' | 'medal' = 'stableford';
  const golfers: ParsedGolfer[] = [];

  const dataRowRegex = /^(\d+)\s+(.+?)\s+(-?\d+)\s+£[\d,.]+$/;
  const datePattern = /^\d{1,2}\s+\w+\s+\d{4}$/;

  for (const line of lines) {
    if (line.startsWith('Pos.') || line.startsWith('Total Purse')) continue;
    if (line.includes('Leaderboard') && !dataRowRegex.test(line)) continue;

    if (!name && !dataRowRegex.test(line) && !datePattern.test(line)) {
      if (line.match(/\d{2}\/\d{2}\/\d{2,4}/)) {
        name = line.replace(/\s*\d{2}\/\d{2}\/\d{2,4}\s*$/, '').trim();
      }
      continue;
    }

    if (!dateStr && datePattern.test(line)) {
      dateStr = parseEcgDate(line);
      continue;
    }

    if (line.toLowerCase().includes('stableford') || line.toLowerCase().includes('medal')) {
      if (!dataRowRegex.test(line)) {
        scoringFormat = detectScoringFormat(line);
        continue;
      }
    }

    const match = line.match(dataRowRegex);
    if (match) {
      const position = parseInt(match[1], 10);
      const fullName = match[2].trim();
      const rawScore = parseInt(match[3], 10);

      const nameParts = fullName.split(/\s+/);
      const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
      const firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : fullName;

      golfers.push({ position, firstName, lastName, rawScore });
    }
  }

  return { name, date: dateStr, scoringFormat, golfers };
}

/**
 * Full pipeline: extract text from PDF buffer and parse into tournament data.
 */
export async function parsePdfBuffer(buffer: Buffer): Promise<ParsedTournament> {
  const text = await extractTextFromPdfBuffer(buffer);
  return parseTournamentText(text);
}
