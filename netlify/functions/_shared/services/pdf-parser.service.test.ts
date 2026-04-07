import { vi } from 'vitest';

// Mock unpdf — tests only exercise the pure text-parsing functions
vi.mock('unpdf', () => ({
  getDocumentProxy: vi.fn(),
}));

import { parseTournamentText, parseEcgDate, detectScoringFormat } from './pdf-parser.service';

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

  it('correctly parses golfer names', () => {
    const result = parseTournamentText(sampleText);
    expect(result.golfers[2]).toEqual({
      position: 3,
      firstName: 'Andrew',
      lastName: 'Newell',
      rawScore: 38,
    });
  });

  it('handles multi-page text with repeated headers', () => {
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

  it('handles negative scores for medal format', () => {
    const medalText = `Weekend Medal 05/04/2026
5 April 2026
Individual Medal
Pos. Player Nett Score Purse
1 John Smith -2 £50.00
2 Jane Doe 0 £30.00
3 Bob Brown 3 £20.00`;

    const result = parseTournamentText(medalText);
    expect(result.golfers).toHaveLength(3);
    expect(result.golfers[0].rawScore).toBe(-2);
    expect(result.golfers[1].rawScore).toBe(0);
    expect(result.golfers[2].rawScore).toBe(3);
    expect(result.scoringFormat).toBe('medal');
  });

  it('parses to-par format leaderboard (no purse column)', () => {
    const toParText = `Bank Holiday Opt in Stableford - 06/04/26
6 April 2026
Roll Up Stableford - 06/04/26 Leaderboard
Individual Stableford
Stableford Points
Pos. Player Total Stableford Points Thru
(To Par)
1 Tony Grover -4 40 F
2 Stuart Yemm -4 40 F
3 Chris Duncan -1 37 F
4 Deborah James -1 37 F
5 Amal Sharma E 36 F`;

    const result = parseTournamentText(toParText);
    expect(result.name).toBe('Bank Holiday Opt in Stableford');
    expect(result.date).toBe('2026-04-06');
    expect(result.scoringFormat).toBe('stableford');
    expect(result.golfers).toHaveLength(5);
    expect(result.golfers[0]).toEqual({
      position: 1,
      firstName: 'Tony',
      lastName: 'Grover',
      rawScore: 40,
    });
    expect(result.golfers[4]).toEqual({
      position: 5,
      firstName: 'Amal',
      lastName: 'Sharma',
      rawScore: 36,
    });
  });

  it('uses total stableford points, not to-par value, as rawScore', () => {
    const text = `Test 01/01/26
1 January 2026
1 Player One +3 33 F
2 Player Two E 36 F
3 Player Three -2 38 F`;

    const result = parseTournamentText(text);
    expect(result.golfers[0].rawScore).toBe(33);
    expect(result.golfers[1].rawScore).toBe(36);
    expect(result.golfers[2].rawScore).toBe(38);
  });

  it('skips withdrawn players with no position in to-par format', () => {
    const text = `Test 01/01/26
1 January 2026
1 Player One -4 40 F
2 Player Two +1 35 F
James Johnson - 0 -
Jit Aujla - 0 -`;

    const result = parseTournamentText(text);
    expect(result.golfers).toHaveLength(2);
  });

  it('strips trailing dash separator from tournament name', () => {
    const text = `Bank Holiday Opt in Stableford - 06/04/26
6 April 2026
1 Player One -4 40 F`;

    const result = parseTournamentText(text);
    expect(result.name).toBe('Bank Holiday Opt in Stableford');
  });

  it('handles full to-par format multi-page leaderboard (real PDF output)', () => {
    const realToParOutput = `Bank Holiday Opt in Stableford - 06/04/26
6 April 2026
Roll Up Stableford - 06/04/26 Leaderboard
Individual Stableford
Stableford Points
Pos. Player Total Stableford Points Thru
(To Par)
1 Tony Grover -4 40 F
2 Stuart Yemm -4 40 F
3 Chris Duncan -1 37 F
4 Deborah James -1 37 F
5 Amal Sharma E 36 F
6 Renee Bansal E 36 F
7 Matthew Pulford E 36 F
8 James Short E 36 F
9 Darren Garner +1 35 F
10 Matthew Forde +1 35 F
11 Ian Ross +2 34 F
12 Angus Blest +2 34 F
13 Aidan Sinclair +2 34 F
14 Phil Monkhouse +2 34 F
15 Jake Miles +3 33 F
16 Nathan Runnicles +3 33 F
17 Adam Pursey +3 33 F
18 Stuart Blackman +3 33 F
19 Leo Spicer +3 33 F
20 Nicholas Looby +3 33 F
21 David Robertson +3 33 F
22 Benjamin Stokes +3 33 F
23 Andy Robinson +3 33 F
24 David Smillie +4 32 F
25 Anne Smith +4 32 F
26 Finlay Scott +4 32 F
27 Steven Hearn +4 32 F
28 Ron Symons +4 32 F
29 Steve Smith +4 32 F
30 Kris Giebeler +4 32 F
31 Lewis Djemal +5 31 F
32 Max Watson +5 31 F
33 Joshua Smith +5 31 F
34 Steve Parkin +6 30 F
35 Ben Fitzgerald +6 30 F
Bank Holiday Opt in Stableford - 06/04/26
6 April 2026
Roll Up Stableford - 06/04/26 Leaderboard
36 Gareth Goodall +6 30 F
37 Joe Beck +6 30 F
38 Nigel Bolt +6 30 F
39 Jadon Johnson +6 30 F
40 Colin Rowland +7 29 F
41 David Stankard +7 29 F
42 Lesley Smillie +7 29 F
43 Tony Harrison +7 29 F
44 Tom Burrows +8 28 F
45 George Mackenzie +8 28 F
46 Lewis Brailli +8 28 F
47 Reahgan Quartermaine +8 28 F
48 Ker Anderson +8 28 F
49 Chris Owen +8 28 F
50 Keanu Mansour +9 27 F
51 Philip Mosedale +9 27 F
52 Mehrdad Reyhanifar +11 25 F
53 Keith Wright +14 22 F
54 Andrew Newell +19 17 F
James Johnson - 0 -
Jit Aujla - 0 -`;

    const result = parseTournamentText(realToParOutput);
    expect(result.name).toBe('Bank Holiday Opt in Stableford');
    expect(result.date).toBe('2026-04-06');
    expect(result.scoringFormat).toBe('stableford');
    expect(result.golfers).toHaveLength(54);
    expect(result.golfers[0]).toEqual({
      position: 1,
      firstName: 'Tony',
      lastName: 'Grover',
      rawScore: 40,
    });
    expect(result.golfers[53]).toEqual({
      position: 54,
      firstName: 'Andrew',
      lastName: 'Newell',
      rawScore: 17,
    });
  });

  it('handles text produced by position-based extraction (real PDF output)', () => {
    // This matches the actual output from extractTextFromPdfBuffer with the ECG leaderboard
    const realPdfOutput = `Friday Bank Holiday Roll Up 03/04/2026
3 April 2026
Weekend Roll Up - 03/04/26 Leaderboard
Individual Stableford
Pos. Player Stableford Points Purse
1 Ashley Brinsford 46 £130.00
2 David Husk 42 £80.00
3 Andrew Newell 38 £55.00
4 David Norbury 38 £0.00
5 Bradley Joyce 38 £0.00
6 David Bosomworth 37 £0.00
7 Dimi Lulov 37 £0.00
8 Adam Taylor 37 £0.00
9 George Hoque 37 £0.00
10 Steve Smith 36 £0.00
11 Matthew Green 36 £0.00
12 Stephen Vincent 36 £0.00
13 Alex Hoque 35 £0.00
14 Matthew Forde 35 £0.00
15 Edouard Little 35 £0.00
16 Nick Liffen 35 £0.00
17 Mehrdad Reyhanifar 34 £0.00
18 Paul Reeves 34 £0.00
19 David Nash 34 £0.00
20 Matthew Pulford 33 £0.00
21 David Smillie 33 £0.00
22 Neil Campling 33 £0.00
23 Andy Glen 33 £0.00
24 Ben Fitzgerald 33 £0.00
25 Duncan Scott 33 £0.00
26 Aidan Sinclair 33 £0.00
27 Gareth Goodall 33 £0.00
28 Gary Smithers 32 £0.00
29 Lesley Smillie 32 £0.00
30 Colin Rowland 32 £0.00
31 Gary Dalziel 32 £0.00
32 Ron Symons 32 £0.00
33 Lewis Brailli 32 £0.00
34 James Short 31 £0.00
35 Ed Saliba 31 £0.00
Friday Bank Holiday Roll Up 03/04/2026
3 April 2026
Weekend Roll Up - 03/04/26 Leaderboard
36 Jit Aujla 31 £0.00
37 Reahgan Quartermaine 31 £0.00
38 Benjamin Purcell 31 £0.00
39 Jason Bellissimo 30 £0.00
40 Martin Langhorn 30 £0.00
41 Andreas Hadjiphanis 30 £0.00
42 Tony Grover 30 £0.00
43 George Brash 30 £0.00
44 Jadon Johnson 30 £0.00
45 Kris Giebeler 30 £0.00
46 Benjamin Stokes 29 £0.00
47 Stuart Blackman 29 £0.00
48 Tom Burrows 28 £0.00
49 Nicholas Looby 28 £0.00
50 Jack Small 27 £0.00
51 Renee Bansal 27 £0.00
52 Roy Kates 27 £0.00
53 Lee Yates 27 £0.00
54 Brian Burchfield 25 £0.00
55 Tracy Vincent 25 £0.00
56 Philip Mosedale 25 £0.00
57 Richard Davis 24 £0.00
58 David Stankard 23 £0.00
Total Purse Allocated: £265.00`;

    const result = parseTournamentText(realPdfOutput);
    expect(result.name).toBe('Friday Bank Holiday Roll Up');
    expect(result.date).toBe('2026-04-03');
    expect(result.scoringFormat).toBe('stableford');
    expect(result.golfers).toHaveLength(58);
    expect(result.golfers[0]).toEqual({
      position: 1,
      firstName: 'Ashley',
      lastName: 'Brinsford',
      rawScore: 46,
    });
    expect(result.golfers[57]).toEqual({
      position: 58,
      firstName: 'David',
      lastName: 'Stankard',
      rawScore: 23,
    });
  });
});
