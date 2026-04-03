// PDF parser for ECG tournament leaderboard format
// Extracts tournament metadata and golfer scores from PDF text

import * as pdfjsLib from 'pdfjs-dist';

// Configure pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

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

/**
 * Extract text from a PDF file using pdfjs-dist.
 */
export async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pageTexts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .filter((item) => 'str' in item)
      .map((item) => (item as { str: string }).str)
      .join(' ');
    pageTexts.push(text);
  }

  return pageTexts.join('\n');
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
 * Looks for keywords like "Stableford" or "Medal".
 */
export function detectScoringFormat(text: string): 'stableford' | 'medal' {
  const lower = text.toLowerCase();
  if (lower.includes('medal')) return 'medal';
  return 'stableford';
}

/**
 * Parse the extracted PDF text lines into structured tournament data.
 * This is the pure parsing logic, separated from PDF extraction for testability.
 */
export function parseTournamentText(rawText: string): ParsedTournament {
  // Normalize the text: split into lines, remove empty lines
  const lines = rawText
    .split('\n')
    .flatMap((line) => line.split(/(?<=\d)\s{2,}(?=\d)/)) // Split on double spaces between numbers (page artifacts)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let name = '';
  let dateStr = '';
  let scoringFormat: 'stableford' | 'medal' = 'stableford';
  const golfers: ParsedGolfer[] = [];

  // Data row pattern: supports positive scores (stableford) and negative scores (medal)
  const dataRowRegex = /^(\d+)\s+(.+?)\s+(-?\d+)\s+£[\d,.]+$/;

  // Date pattern: "3 April 2026"
  const datePattern = /^\d{1,2}\s+\w+\s+\d{4}$/;

  for (const line of lines) {
    // Skip repeated headers and known non-data lines
    if (line.startsWith('Pos.') || line.startsWith('Total Purse')) continue;
    if (line.includes('Leaderboard') && !dataRowRegex.test(line)) continue;

    // Try to extract tournament name (first non-data, non-date line)
    if (!name && !dataRowRegex.test(line) && !datePattern.test(line)) {
      // The title line contains the tournament name (e.g., "Friday Bank Holiday Roll Up 03/04/2026")
      if (line.match(/\d{2}\/\d{2}\/\d{2,4}/)) {
        name = line.replace(/\s*\d{2}\/\d{2}\/\d{2,4}\s*$/, '').trim();
      }
      continue;
    }

    // Try to extract date
    if (!dateStr && datePattern.test(line)) {
      dateStr = parseEcgDate(line);
      continue;
    }

    // Detect scoring format from format line (e.g., "Individual Stableford")
    if (line.toLowerCase().includes('stableford') || line.toLowerCase().includes('medal')) {
      if (!dataRowRegex.test(line)) {
        scoringFormat = detectScoringFormat(line);
        continue;
      }
    }

    // Try to parse as data row
    const match = line.match(dataRowRegex);
    if (match) {
      const position = parseInt(match[1], 10);
      const fullName = match[2].trim();
      const rawScore = parseInt(match[3], 10);

      // Split name: last word is lastName, rest is firstName
      const nameParts = fullName.split(/\s+/);
      const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
      const firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : fullName;

      golfers.push({ position, firstName, lastName, rawScore });
    }
  }

  return { name, date: dateStr, scoringFormat, golfers };
}

/**
 * Full pipeline: extract text from PDF file and parse into tournament data.
 */
export async function parsePdfTournament(file: File): Promise<ParsedTournament> {
  const text = await extractTextFromPdf(file);
  return parseTournamentText(text);
}
