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
  width: number;
}

/**
 * Detect whether a row of text items contains spaced-out individual characters
 * (common in some PDF generators that render each glyph separately).
 */
function isSpacedCharRow(row: TextItem[]): boolean {
  if (row.length < 3) return false;
  const singleCharCount = row.filter((item) => item.text.length === 1).length;
  return singleCharCount > row.length * 0.7;
}

/**
 * Join row items using gap analysis to reconstruct words from individually-spaced characters.
 * Computes the whitespace between end of one item and start of next; inserts a space
 * only when the gap exceeds a threshold derived from the row's own character widths.
 */
export function joinRowByGaps(row: TextItem[]): string {
  if (row.length === 0) return '';
  if (row.length === 1) return row[0].text;

  // Compute median character width for an adaptive threshold
  const widths = row.map((item) => item.width).filter((w) => w > 0);
  widths.sort((a, b) => a - b);
  const medianWidth = widths.length > 0 ? widths[Math.floor(widths.length / 2)] : 5;

  // Threshold: whitespace larger than 30% of median char width → word boundary
  const threshold = medianWidth * 0.3;

  let result = row[0].text;
  for (let i = 1; i < row.length; i++) {
    const prev = row[i - 1];
    const curr = row[i];
    const whitespace = curr.x - (prev.x + prev.width);
    result += whitespace > threshold ? ' ' + curr.text : curr.text;
  }
  return result;
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
        const w = (rawItem as { width?: number }).width ?? 0;
        items.push({ x: transform[4], y: transform[5], text: s, width: w });
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
      // Uses gap-based reconstruction for rows with individually-spaced characters
      const lines = rows.map((row) => {
        row.sort((a, b) => a.x - b.x);
        if (isSpacedCharRow(row)) {
          return joinRowByGaps(row);
        }
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

  // Format A: purse column — e.g. "1 Ashley Brinsford 46 £130.00"
  const purseRowRegex = /^(T?\d+)\s+(.+?)\s+(-?\d+)\s+£[\d,.]+$/;
  // Format B: to-par + total + thru — e.g. "1  Tony Grover   -4 40  F"
  const toParRowRegex = /^(T?\d+)\s+(.+?)\s+([+-]?\d+|E)\s+(\d+)\s+F$/;
  // Format C: simple stableford — e.g. "1 John Pulley 41" or "T24 Trevor Mason 34"
  const simpleRowRegex = /^(T?\d+)\s+(.+?)\s+([+-]?\d{1,3})$/;

  const isDataRow = (line: string) =>
    purseRowRegex.test(line) || toParRowRegex.test(line) || simpleRowRegex.test(line);

  const datePattern = /^\d{1,2}\s+\w+\s+\d{4}$/;

  // Header-like patterns that should never be used as the tournament name
  const isHeaderLine = (line: string) => {
    const lower = line.toLowerCase();
    return (
      lower.includes('pos.') ||
      lower.includes('leaderboard') ||
      lower.includes('purse') ||
      lower.includes('thru') ||
      lower.startsWith('total ')
    );
  };

  for (const line of lines) {
    if (line.startsWith('Pos.') || line.startsWith('Total Purse')) continue;
    if (line.includes('Leaderboard') && !isDataRow(line)) continue;

    // Detect scoring format early — before name extraction so keywords
    // like "stableford" / "medal" are captured even in formats without dates
    if (line.toLowerCase().includes('stableford') || line.toLowerCase().includes('medal')) {
      if (!isDataRow(line)) {
        scoringFormat = detectScoringFormat(line);

        // Also use this line as the tournament name if we don't have one yet
        // and it's not a column header (e.g., "Men's Individual Stableford")
        if (!name && !isHeaderLine(line)) {
          if (line.match(/\d{2}\/\d{2}\/\d{2,4}/)) {
            // Line has an embedded date — strip it and trailing dashes
            name = line
              .replace(/\s*\d{2}\/\d{2}\/\d{2,4}\s*$/, '')
              .replace(/\s*[-–—]+\s*$/, '')
              .trim();
          } else {
            // No date — strip subtitle like " - Men's Individual"
            name = line.replace(/\s*[-–—]+\s+\w[\w\s']*$/, '').trim();
          }
        }
        continue;
      }
    }

    // Name extraction: either from a line with an embedded date, or as a fallback
    // for PDFs without dates (first non-data, non-header line)
    if (!name && !isDataRow(line) && !datePattern.test(line)) {
      if (line.match(/\d{2}\/\d{2}\/\d{2,4}/)) {
        name = line
          .replace(/\s*\d{2}\/\d{2}\/\d{2,4}\s*$/, '')
          .replace(/\s*[-–—]+\s*$/, '')
          .trim();
      }
      continue;
    }

    if (!dateStr && datePattern.test(line)) {
      dateStr = parseEcgDate(line);
      continue;
    }

    // Try all format regexes (most specific first)
    const match =
      line.match(purseRowRegex) || line.match(toParRowRegex) || line.match(simpleRowRegex);
    if (match) {
      const position = parseInt(match[1].replace(/^T/i, ''), 10);
      const fullName = match[2].trim();
      // For purse format, score is group 3; for to-par format, total points is group 4;
      // for simple format, score is group 3
      let rawScore: number;
      if (line.match(toParRowRegex) && match[4] !== undefined) {
        rawScore = parseInt(match[4], 10);
      } else {
        rawScore = parseInt(match[3], 10);
      }

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
