import {
  parseTournamentCsv,
  parsePlayerName,
  detectScoringFormatFromHeader,
  parseCsvLine,
  parseMedalScore,
  mapHeaderColumns,
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
    expect(parsePlayerName("Kevin O'Neill")).toEqual({
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

describe('parseMedalScore', () => {
  it('parses signed integers', () => {
    expect(parseMedalScore('-3')).toBe(-3);
    expect(parseMedalScore('+1')).toBe(1);
    expect(parseMedalScore('0')).toBe(0);
  });

  it('treats E as level par (0)', () => {
    expect(parseMedalScore('E')).toBe(0);
    expect(parseMedalScore('e')).toBe(0);
  });

  it('returns NaN for empty or non-numeric values', () => {
    expect(Number.isNaN(parseMedalScore(''))).toBe(true);
    expect(Number.isNaN(parseMedalScore('DNF'))).toBe(true);
    expect(Number.isNaN(parseMedalScore('--2'))).toBe(true);
  });
});

describe('mapHeaderColumns', () => {
  it('maps the legacy Position/Player/Stableford layout', () => {
    const cols = mapHeaderColumns(['Position', 'Player', 'Stableford Points']);
    expect(cols.position).toBe(0);
    expect(cols.player).toBe(1);
    expect(cols.stableford).toBe(2);
    expect(cols.firstName).toBe(-1);
    expect(cols.lastName).toBe(-1);
    expect(cols.toPar).toBe(-1);
    expect(cols.totalNet).toBe(-1);
  });

  it('maps the split-name medal layout', () => {
    const cols = mapHeaderColumns([
      'Position',
      'First Name',
      'Last Name',
      'Total Net',
      'To Par',
      'Purse',
      'Division',
    ]);
    expect(cols.position).toBe(0);
    expect(cols.firstName).toBe(1);
    expect(cols.lastName).toBe(2);
    expect(cols.totalNet).toBe(3);
    expect(cols.toPar).toBe(4);
    expect(cols.player).toBe(-1);
  });

  it('is case-insensitive and ignores extra whitespace', () => {
    const cols = mapHeaderColumns(['  POSITION ', 'first name', '  Last  Name', 'TO PAR']);
    expect(cols.position).toBe(0);
    expect(cols.firstName).toBe(1);
    expect(cols.lastName).toBe(2);
    expect(cols.toPar).toBe(3);
  });
});

describe('parseTournamentCsv (split-name medal format)', () => {
  it('parses the combined male+female medal CSV exported by this app', () => {
    const csv = `Position,First Name,Last Name,Total Net,To Par
1,David,Smillie,64,-8
2,Aidan,Sinclair,68,-4
3,Martin,Langhorn,70,-2
7,Nick,Liffen,71,-1
8,Tracy,Vincent,71,-1
9,David,Husk,72,E
11,Matthew,Hele,73,+1`;

    const result = parseTournamentCsv(csv);

    expect(result.scoringFormat).toBe('medal');
    expect(result.golfers).toHaveLength(7);
    expect(result.golfers[0]).toEqual({
      position: 1,
      firstName: 'David',
      lastName: 'Smillie',
      rawScore: -8,
    });
    expect(result.golfers[5]).toEqual({
      position: 9,
      firstName: 'David',
      lastName: 'Husk',
      rawScore: 0,
    });
    expect(result.golfers[6].rawScore).toBe(1);
  });

  it('keeps last name in its own field rather than collapsing into first name', () => {
    const csv = `Position,First Name,Last Name,Total Net,To Par
1,Tracy,Vincent,71,-1`;

    const result = parseTournamentCsv(csv);

    expect(result.golfers[0].firstName).toBe('Tracy');
    expect(result.golfers[0].lastName).toBe('Vincent');
  });

  it('uses To Par over Total Net when both are present', () => {
    const csv = `Position,First Name,Last Name,Total Net,To Par
1,David,Smillie,64,-8`;

    const result = parseTournamentCsv(csv);

    expect(result.golfers[0].rawScore).toBe(-8);
  });

  it('falls back to Total Net when To Par column is absent', () => {
    const csv = `Position,First Name,Last Name,Total Net
1,David,Smillie,-8`;

    const result = parseTournamentCsv(csv);

    expect(result.scoringFormat).toBe('medal');
    expect(result.golfers[0].rawScore).toBe(-8);
  });

  it('tolerates extra trailing columns like Purse and Division', () => {
    const csv = `Position,First Name,Last Name,Total Net,To Par,Purse,Division
1,David,Smillie,64,-8,185.00,M
8,Tracy,Vincent,71,-1,29.00,F`;

    const result = parseTournamentCsv(csv);

    expect(result.golfers).toHaveLength(2);
    expect(result.golfers[1]).toEqual({
      position: 8,
      firstName: 'Tracy',
      lastName: 'Vincent',
      rawScore: -1,
    });
  });

  it('skips rows with non-numeric scores (e.g. WD/DNF)', () => {
    const csv = `Position,First Name,Last Name,Total Net,To Par
1,David,Smillie,64,-8
WD,Keith,Wright,WD,-
NR,Rod,Finch,NR,-
2,Aidan,Sinclair,68,-4`;

    const result = parseTournamentCsv(csv);

    expect(result.golfers).toHaveLength(2);
    expect(result.golfers.map((g) => g.lastName)).toEqual(['Smillie', 'Sinclair']);
  });
});
