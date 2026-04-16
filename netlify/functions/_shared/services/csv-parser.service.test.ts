import {
  parseTournamentCsv,
  parsePlayerName,
  detectScoringFormatFromHeader,
  parseCsvLine,
} from './csv-parser.service';

describe('parseCsvLine', () => {
  it('splits simple comma-separated values', () => {
    expect(parseCsvLine('1,John Pulley,41', ',')).toEqual(['1', 'John Pulley', '41']);
  });

  it('handles quoted fields containing delimiters', () => {
    expect(parseCsvLine('1,"Pulley, John",41', ',')).toEqual(['1', 'Pulley, John', '41']);
  });

  it('handles escaped quotes inside quoted fields', () => {
    expect(parseCsvLine('1,"O""Neill, Kevin",38', ',')).toEqual(['1', 'O"Neill, Kevin', '38']);
  });

  it('handles tab-delimited values', () => {
    expect(parseCsvLine('1\tJohn Pulley\t41', '\t')).toEqual(['1', 'John Pulley', '41']);
  });

  it('handles empty fields', () => {
    expect(parseCsvLine('1,,41', ',')).toEqual(['1', '', '41']);
  });
});

describe('parsePlayerName', () => {
  it('splits "John Pulley" into first and last', () => {
    expect(parsePlayerName('John Pulley')).toEqual({ firstName: 'John', lastName: 'Pulley' });
  });

  it('handles single-word names', () => {
    expect(parsePlayerName('Madonna')).toEqual({ firstName: 'Madonna', lastName: '' });
  });

  it('handles multi-part last names', () => {
    expect(parsePlayerName('Jude Steinborn-Busse')).toEqual({
      firstName: 'Jude',
      lastName: 'Steinborn-Busse',
    });
  });

  it('handles names with multiple spaces (first space is the split point)', () => {
    expect(parsePlayerName('Kevin O\'Neill')).toEqual({
      firstName: 'Kevin',
      lastName: "O'Neill",
    });
  });

  it('trims whitespace', () => {
    expect(parsePlayerName('  Nick Liffen  ')).toEqual({ firstName: 'Nick', lastName: 'Liffen' });
  });
});

describe('detectScoringFormatFromHeader', () => {
  it('detects stableford from "Stableford Points"', () => {
    expect(detectScoringFormatFromHeader('Position,Player,Stableford Points')).toBe('stableford');
  });

  it('detects medal from "Nett Score"', () => {
    expect(detectScoringFormatFromHeader('Position,Player,Nett Score')).toBe('medal');
  });

  it('detects medal from "Medal Score"', () => {
    expect(detectScoringFormatFromHeader('Position,Player,Medal Score')).toBe('medal');
  });

  it('defaults to stableford for unknown headers', () => {
    expect(detectScoringFormatFromHeader('Position,Player,Points')).toBe('stableford');
  });
});

describe('parseTournamentCsv', () => {
  it('parses standard 3-column CSV', () => {
    const csv = `Position,Player,Stableford Points
1,John Pulley,41
2,Alex Hoque,40
3,Paul Eggleton,40`;

    const result = parseTournamentCsv(csv);

    expect(result.name).toBe('');
    expect(result.date).toBe('');
    expect(result.scoringFormat).toBe('stableford');
    expect(result.golfers).toHaveLength(3);
    expect(result.golfers[0]).toEqual({
      position: 1,
      firstName: 'John',
      lastName: 'Pulley',
      rawScore: 41,
    });
  });

  it('handles UTF-8 BOM prefix', () => {
    const csv = '\uFEFFPosition,Player,Stableford Points\n1,Nick Liffen,34';

    const result = parseTournamentCsv(csv);

    expect(result.golfers).toHaveLength(1);
    expect(result.golfers[0].firstName).toBe('Nick');
  });

  it('handles tab-delimited input', () => {
    const csv = 'Position\tPlayer\tStableford Points\n1\tJohn Pulley\t41';

    const result = parseTournamentCsv(csv);

    expect(result.golfers).toHaveLength(1);
    expect(result.golfers[0]).toEqual({
      position: 1,
      firstName: 'John',
      lastName: 'Pulley',
      rawScore: 41,
    });
  });

  it('detects medal scoring format from header', () => {
    const csv = 'Position,Player,Nett Score\n1,John Pulley,-3';

    const result = parseTournamentCsv(csv);

    expect(result.scoringFormat).toBe('medal');
    expect(result.golfers[0].rawScore).toBe(-3);
  });

  it('handles tied positions', () => {
    const csv = `Position,Player,Stableford Points
5,Anne Smith,38
5,Bryan McSwiney,38
5,David Norbury,38`;

    const result = parseTournamentCsv(csv);

    expect(result.golfers).toHaveLength(3);
    expect(result.golfers.every((g) => g.position === 5)).toBe(true);
  });

  it('skips invalid rows (missing columns)', () => {
    const csv = `Position,Player,Stableford Points
1,John Pulley,41
bad row
2,Alex Hoque,40`;

    const result = parseTournamentCsv(csv);

    expect(result.golfers).toHaveLength(2);
  });

  it('skips rows with non-numeric position or score', () => {
    const csv = `Position,Player,Stableford Points
1,John Pulley,41
abc,Invalid Player,xyz
2,Alex Hoque,40`;

    const result = parseTournamentCsv(csv);

    expect(result.golfers).toHaveLength(2);
  });

  it('returns empty golfers for header-only CSV', () => {
    const csv = 'Position,Player,Stableford Points';

    const result = parseTournamentCsv(csv);

    expect(result.golfers).toHaveLength(0);
  });

  it('returns empty golfers for empty input', () => {
    const result = parseTournamentCsv('');

    expect(result.golfers).toHaveLength(0);
  });

  it('handles Windows line endings (CRLF)', () => {
    const csv = 'Position,Player,Stableford Points\r\n1,John Pulley,41\r\n2,Alex Hoque,40';

    const result = parseTournamentCsv(csv);

    expect(result.golfers).toHaveLength(2);
  });

  it('handles quoted values', () => {
    const csv = `Position,Player,Stableford Points
"1","John Pulley","41"`;

    const result = parseTournamentCsv(csv);

    expect(result.golfers).toHaveLength(1);
    expect(result.golfers[0]).toEqual({
      position: 1,
      firstName: 'John',
      lastName: 'Pulley',
      rawScore: 41,
    });
  });

  it('handles quoted player names with commas', () => {
    const csv = `Position,Player,Stableford Points
1,"Pulley, John",41
2,"O'Neill, Kevin",38`;

    const result = parseTournamentCsv(csv);

    expect(result.golfers).toHaveLength(2);
    expect(result.golfers[0]).toEqual({
      position: 1,
      firstName: 'Pulley,',
      lastName: 'John',
      rawScore: 41,
    });
  });

  it('handles T-prefix tied positions', () => {
    const csv = `Position,Player,Stableford Points
T24,Nick Liffen,34
T24,Steve Smith,34`;

    const result = parseTournamentCsv(csv);

    expect(result.golfers).toHaveLength(2);
    expect(result.golfers[0].position).toBe(24);
    expect(result.golfers[1].position).toBe(24);
  });

  it('handles large field sizes', () => {
    const rows = ['Position,Player,Stableford Points'];
    for (let i = 1; i <= 150; i++) {
      rows.push(`${i},Player ${i},${50 - Math.floor(i / 5)}`);
    }
    const csv = rows.join('\n');

    const result = parseTournamentCsv(csv);

    expect(result.golfers).toHaveLength(150);
  });

  it('handles zero scores', () => {
    const csv = `Position,Player,Stableford Points
132,Brian Hargreaves,0`;

    const result = parseTournamentCsv(csv);

    expect(result.golfers).toHaveLength(1);
    expect(result.golfers[0].rawScore).toBe(0);
  });

  it('handles negative scores (medal format)', () => {
    const csv = `Position,Player,Nett Score
1,John Pulley,-5
2,Alex Hoque,2`;

    const result = parseTournamentCsv(csv);

    expect(result.golfers[0].rawScore).toBe(-5);
    expect(result.golfers[1].rawScore).toBe(2);
  });

  it('skips rows with empty player name', () => {
    const csv = `Position,Player,Stableford Points
1,,41
2,Alex Hoque,40`;

    const result = parseTournamentCsv(csv);

    expect(result.golfers).toHaveLength(1);
    expect(result.golfers[0].firstName).toBe('Alex');
  });
});
