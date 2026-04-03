import { vi } from 'vitest';

// Mock pdfjs-dist since it requires DOM APIs not available in Node.js test environment
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(),
}));

import { parseTournamentText, parseEcgDate, detectScoringFormat } from './pdfParser';

describe('parseEcgDate', () => {
  it('parses "3 April 2026" format', () => {
    expect(parseEcgDate('3 April 2026')).toBe('2026-04-03');
  });

  it('parses "15 January 2025" format', () => {
    expect(parseEcgDate('15 January 2025')).toBe('2025-01-15');
  });

  it('parses "DD/MM/YYYY" format', () => {
    expect(parseEcgDate('03/04/2026')).toBe('2026-04-03');
  });

  it('parses "DD/MM/YY" format', () => {
    expect(parseEcgDate('03/04/26')).toBe('2026-04-03');
  });

  it('returns input if format is unrecognized', () => {
    expect(parseEcgDate('2026-04-03')).toBe('2026-04-03');
  });
});

describe('detectScoringFormat', () => {
  it('detects stableford from "Individual Stableford"', () => {
    expect(detectScoringFormat('Individual Stableford')).toBe('stableford');
  });

  it('detects medal from "Nett Medal"', () => {
    expect(detectScoringFormat('Nett Medal')).toBe('medal');
  });

  it('defaults to stableford when no keywords found', () => {
    expect(detectScoringFormat('Some Other Format')).toBe('stableford');
  });
});

describe('parseTournamentText', () => {
  const sampleText = `Friday Bank Holiday Roll Up 03/04/2026
3 April 2026
Weekend Roll Up - 03/04/26 Leaderboard
Individual Stableford
Pos. Player Stableford Points Purse
1 Ashley Brinsford 46 £130.00
2 David Husk 42 £80.00
3 Andrew Newell 38 £55.00
4 David Norbury 38 £0.00
5 Bradley Joyce 38 £0.00`;

  it('extracts tournament name', () => {
    const result = parseTournamentText(sampleText);
    expect(result.name).toBe('Friday Bank Holiday Roll Up');
  });

  it('extracts date in ISO format', () => {
    const result = parseTournamentText(sampleText);
    expect(result.date).toBe('2026-04-03');
  });

  it('detects stableford scoring format', () => {
    const result = parseTournamentText(sampleText);
    expect(result.scoringFormat).toBe('stableford');
  });

  it('extracts all golfers', () => {
    const result = parseTournamentText(sampleText);
    expect(result.golfers).toHaveLength(5);
  });

  it('correctly parses first golfer', () => {
    const result = parseTournamentText(sampleText);
    expect(result.golfers[0]).toEqual({
      position: 1,
      firstName: 'Ashley',
      lastName: 'Brinsford',
      rawScore: 46,
    });
  });

  it('correctly parses golfer with multi-word first name', () => {
    // "Andrew Newell" → firstName: "Andrew", lastName: "Newell"
    const result = parseTournamentText(sampleText);
    expect(result.golfers[2]).toEqual({
      position: 3,
      firstName: 'Andrew',
      lastName: 'Newell',
      rawScore: 38,
    });
  });

  it('handles multi-page text', () => {
    const multiPageText = `Friday Bank Holiday Roll Up 03/04/2026
3 April 2026
Weekend Roll Up - 03/04/26 Leaderboard
Individual Stableford
Pos. Player Stableford Points Purse
1 Ashley Brinsford 46 £130.00
2 David Husk 42 £80.00
Friday Bank Holiday Roll Up 03/04/2026
3 April 2026
Weekend Roll Up - 03/04/26 Leaderboard
3 Andrew Newell 38 £55.00
4 David Norbury 38 £0.00`;

    const result = parseTournamentText(multiPageText);
    expect(result.golfers).toHaveLength(4);
    expect(result.golfers[2].position).toBe(3);
    expect(result.golfers[2].firstName).toBe('Andrew');
  });

  it('handles empty text', () => {
    const result = parseTournamentText('');
    expect(result.golfers).toHaveLength(0);
    expect(result.name).toBe('');
    expect(result.date).toBe('');
  });

  it('skips Total Purse line', () => {
    const textWithTotal = `Friday Bank Holiday Roll Up 03/04/2026
3 April 2026
Individual Stableford
1 Ashley Brinsford 46 £130.00
Total Purse Allocated: £265.00`;

    const result = parseTournamentText(textWithTotal);
    expect(result.golfers).toHaveLength(1);
  });
});
