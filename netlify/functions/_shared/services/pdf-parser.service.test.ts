import { vi } from 'vitest';

// Mock unpdf — tests only exercise the pure text-parsing functions
vi.mock('unpdf', () => ({
  getDocumentProxy: vi.fn(),
}));

import {
  parseTournamentText,
  parseEcgDate,
  detectScoringFormat,
  joinRowByGaps,
} from './pdf-parser.service';

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

  it('parses medal-with-purse format using to-par as rawScore', () => {
    // Real layout from "26th May Midweek Medal.pdf" — rows have 5 fields:
    // position, name, to-par, total-net, £purse. Without the dedicated
    // medal-purse regex, the to-par value would be absorbed into the name and
    // the gross total would be used as the score.
    const text = `Midweek Medal
To Par Total
Pos. Player Purse
Net Net
1 Duncan Scott -4 68 £144.00
2 Stephen Vincent -1 71 £86.00
6 Adam Taylor E 72 £0.00
8 Trevor Denison +1 73 £0.00
27 John (Chas) Trayhorn +8 80 £0.00
40 Tony Grover +18 90 £0.00`;

    const result = parseTournamentText(text);

    expect(result.scoringFormat).toBe('medal');
    expect(result.golfers).toEqual([
      { position: 1, firstName: 'Duncan', lastName: 'Scott', rawScore: -4 },
      { position: 2, firstName: 'Stephen', lastName: 'Vincent', rawScore: -1 },
      { position: 6, firstName: 'Adam', lastName: 'Taylor', rawScore: 0 },
      { position: 8, firstName: 'Trevor', lastName: 'Denison', rawScore: 1 },
      { position: 27, firstName: 'John (Chas)', lastName: 'Trayhorn', rawScore: 8 },
      { position: 40, firstName: 'Tony', lastName: 'Grover', rawScore: 18 },
    ]);
  });

  it('skips withdrawn / no-return rows in medal-with-purse format', () => {
    // These rows don't start with a numeric position so none of the row
    // regexes should match.
    const text = `Midweek Medal
1 Duncan Scott -4 68 £144.00
WD Stephen Chambers - WD £0.00
NR Clive Chaffers - NR £0.00
NS Brian Kelly - NS £0.00`;

    const result = parseTournamentText(text);
    expect(result.golfers).toHaveLength(1);
    expect(result.golfers[0]).toEqual({
      position: 1,
      firstName: 'Duncan',
      lastName: 'Scott',
      rawScore: -4,
    });
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

  it('parses simple stableford format (no purse, no to-par)', () => {
    const simpleText = `Men's Individual Stableford - Men's Individual
Pos. Player Stableford Points
1 John Pulley 41
2 Paul Eggleton 40
3 Alex Hoque 40
4 David Norbury 38
5 Bryan McSwiney 38`;

    const result = parseTournamentText(simpleText);
    expect(result.scoringFormat).toBe('stableford');
    expect(result.golfers).toHaveLength(5);
    expect(result.golfers[0]).toEqual({
      position: 1,
      firstName: 'John',
      lastName: 'Pulley',
      rawScore: 41,
    });
    expect(result.golfers[4]).toEqual({
      position: 5,
      firstName: 'Bryan',
      lastName: 'McSwiney',
      rawScore: 38,
    });
  });

  it('extracts tournament name from scoring format line when no date is present', () => {
    const text = `Men's Individual Stableford - Men's Individual
Pos. Player Stableford Points
1 John Pulley 41`;

    const result = parseTournamentText(text);
    expect(result.name).toBe("Men's Individual Stableford");
    expect(result.date).toBe('');
  });

  it('handles tied positions with T prefix', () => {
    const text = `Men's Individual Stableford - Men's Individual
Pos. Player Stableford Points
1 John Pulley 41
2 Paul Eggleton 40
T24 Trevor Mason 34
T24 Samuel Rhys Thomas 34
26 David Bosomworth 34`;

    const result = parseTournamentText(text);
    expect(result.golfers).toHaveLength(5);
    expect(result.golfers[2]).toEqual({
      position: 24,
      firstName: 'Trevor',
      lastName: 'Mason',
      rawScore: 34,
    });
    expect(result.golfers[3]).toEqual({
      position: 24,
      firstName: 'Samuel Rhys',
      lastName: 'Thomas',
      rawScore: 34,
    });
  });

  it('handles score of 0 in simple format', () => {
    const text = `Men's Individual Stableford - Men's Individual
1 John Pulley 41
116 Brian Hargreaves 0`;

    const result = parseTournamentText(text);
    expect(result.golfers).toHaveLength(2);
    expect(result.golfers[1]).toEqual({
      position: 116,
      firstName: 'Brian',
      lastName: 'Hargreaves',
      rawScore: 0,
    });
  });

  it('does not misparse date lines as simple format data rows', () => {
    const text = `Some Tournament 03/04/2026
3 April 2026
Individual Stableford
1 John Smith 41`;

    const result = parseTournamentText(text);
    expect(result.date).toBe('2026-04-03');
    expect(result.golfers).toHaveLength(1);
    expect(result.golfers[0].firstName).toBe('John');
  });

  it('handles T prefix in purse format rows', () => {
    const text = `Friday Roll Up 03/04/2026
3 April 2026
Individual Stableford
T1 Ashley Brinsford 46 £130.00
T1 David Husk 46 £130.00
3 Andrew Newell 38 £55.00`;

    const result = parseTournamentText(text);
    expect(result.golfers).toHaveLength(3);
    expect(result.golfers[0].position).toBe(1);
    expect(result.golfers[1].position).toBe(1);
    expect(result.golfers[2].position).toBe(3);
  });

  it('handles full Masters Score format (116 golfers, no date, tied positions)', () => {
    // Reconstructed text from the spaced-character Masters Score PDF
    const mastersText = `Men's Individual Stableford - Men's Individual
Pos. Player Stableford Points
1 John Pulley 41
2 Paul Eggleton 40
3 Alex Hoque 40
4 David Norbury 38
5 Bryan McSwiney 38
6 Mehrdad Reyhanifar 38
7 Kris Giebeler 37
8 Tony Grover 37
9 Callum Ewart 36
10 Matthew Pulford 36
11 David Husk 36
12 Reahgan Quartermaine 36
13 Edouard Little 36
14 Kevin O'Neill 36
15 Duncan McDermott 36
16 Nick Wells 35
17 Paul Drake 35
18 Bradley Joyce 35
19 Roy Kates 35
20 Adam Taylor 35
21 Andrew Newell 35
22 David Robson 34
23 Jude Steinborn-Busse 34
T24 Trevor Mason 34
T24 Samuel Rhys Thomas 34
26 David Bosomworth 34
27 Steve Smith 34
28 Nick Liffen 34
29 Ben Fitzgerald 34
30 Nick Brister 34
31 David Smillie 34
32 Andy Robinson 34
33 Ron Symons 33
34 David Stankard 33
35 Jonathan Wilkes 33
36 Jason Bellissimo 33
37 Phil Monkhouse 33
38 Mark Symons 33
39 Keanu Mansour 33
40 Tony Harrison 32
41 Roger Whiteside 32
42 Paul Penny 32
43 Nigel Withey 32
44 Sanjeev Jain 32
45 Keith Wright 32
46 Nathan Runnicles 32
47 James Johnson 32
48 Andreas Hadjiphanis 32
49 David Nash 32
50 Gary Smithers 32
51 Mark Lardner 31
52 Jadon Johnson 31
53 George Hoque 31
54 Jason Cook 31
55 Matthew Hele 31
56 Benjamin Stokes 31
57 Nick Fraser 31
58 Neil Campling 30
59 Justin McKeegan 30
60 Renee Bansal 30
61 Gareth Goodall 30
62 James Dance 30
63 Mrinal Madina 30
64 Bhavesh Amin 30
65 Andrew Fletcher 30
66 Philip Mosedale 30
67 Paul McLean 30
68 Matthew Forde 30
69 John Burns 30
70 George McPherson 29
71 Paul Reeves 29
72 Stuart Brown 29
73 Max Watson 29
74 Stephen Jones 29
75 Nick Carter 29
76 Rikhil Bansal 28
77 Leo Spicer 28
78 Josh Hulyer 28
79 Andrew Hickmott 28
80 Ed Saliba 28
81 Bradley Chick 28
82 James Short 28
83 Jake Miles 27
84 Andrew Dance 27
85 Angus Blest 27
86 Chris Owen 27
87 James Kachel 27
88 David Simpson 27
89 Mark Williams 27
90 Richard Childs 26
91 Colin Rowland 26
92 Ryan Walker 26
93 Stuart Blackman 26
94 Martin Langhorn 26
95 Gary Dalziel 26
96 John Saunders 26
97 James Horseman 26
98 Aidan Sinclair 26
99 Robin Paul 26
100 Jamie Hillman 25
101 Jit Aujla 25
102 Carl Cooley 25
103 Nicholas Looby 24
104 Roger Hampson 24
105 Jeremy Hill 24
106 Clive Tyldesley 24
107 Nicholas Ludlam 23
108 Ker Anderson 23
109 Nick Wallace 23
110 Harry Lardner 23
111 Mark Sheppard 22
112 Jak Griffiths 22
113 Steve Ralls 21
114 Stephen Leversuch 20
115 Phil Bass 20
116 Brian Hargreaves 0`;

    const result = parseTournamentText(mastersText);
    expect(result.name).toBe("Men's Individual Stableford");
    expect(result.date).toBe('');
    expect(result.scoringFormat).toBe('stableford');
    expect(result.golfers).toHaveLength(116);
    expect(result.golfers[0]).toEqual({
      position: 1,
      firstName: 'John',
      lastName: 'Pulley',
      rawScore: 41,
    });
    expect(result.golfers[22]).toEqual({
      position: 23,
      firstName: 'Jude',
      lastName: 'Steinborn-Busse',
      rawScore: 34,
    });
    expect(result.golfers[23]).toEqual({
      position: 24,
      firstName: 'Trevor',
      lastName: 'Mason',
      rawScore: 34,
    });
    expect(result.golfers[24]).toEqual({
      position: 24,
      firstName: 'Samuel Rhys',
      lastName: 'Thomas',
      rawScore: 34,
    });
    expect(result.golfers[115]).toEqual({
      position: 116,
      firstName: 'Brian',
      lastName: 'Hargreaves',
      rawScore: 0,
    });
  });
});

describe('joinRowByGaps', () => {
  it('returns empty string for empty row', () => {
    expect(joinRowByGaps([])).toBe('');
  });

  it('returns single item text for single-item row', () => {
    expect(joinRowByGaps([{ x: 0, y: 0, text: 'Hello', width: 30 }])).toBe('Hello');
  });

  it('concatenates tightly-spaced characters into a word', () => {
    // Characters touching: gap equals 0 (next x = prev x + prev width)
    const row = [
      { x: 0, y: 0, text: 'J', width: 6 },
      { x: 6, y: 0, text: 'o', width: 6 },
      { x: 12, y: 0, text: 'h', width: 6 },
      { x: 18, y: 0, text: 'n', width: 6 },
    ];
    expect(joinRowByGaps(row)).toBe('John');
  });

  it('adds spaces between words with larger gaps', () => {
    // "John" then a gap, then "Pulley" then a big gap, then "41"
    const row = [
      { x: 0, y: 0, text: 'J', width: 6 },
      { x: 6, y: 0, text: 'o', width: 6 },
      { x: 12, y: 0, text: 'h', width: 6 },
      { x: 18, y: 0, text: 'n', width: 6 },
      // word gap: whitespace = 28 - 24 = 4 > threshold (~1.8)
      { x: 28, y: 0, text: 'P', width: 6 },
      { x: 34, y: 0, text: 'u', width: 6 },
      { x: 40, y: 0, text: 'l', width: 3 },
      { x: 43, y: 0, text: 'l', width: 3 },
      { x: 46, y: 0, text: 'e', width: 6 },
      { x: 52, y: 0, text: 'y', width: 5 },
    ];
    expect(joinRowByGaps(row)).toBe('John Pulley');
  });

  it('reconstructs position, name, and score with column gaps', () => {
    // Mimics real PDF: position "1" at x=44, name at x=85, score "41" at x=493
    const row = [
      { x: 44.2, y: 0, text: '1', width: 6.3 },
      // gap to name column: 85 - 50.5 = 34.5
      { x: 85, y: 0, text: 'J', width: 5.4 },
      { x: 90.4, y: 0, text: 'o', width: 5.9 },
      { x: 96.2, y: 0, text: 'h', width: 6 },
      { x: 102.2, y: 0, text: 'n', width: 6 },
      // word gap: 110.7 - 108.2 = 2.5
      { x: 110.7, y: 0, text: 'P', width: 6.4 },
      { x: 117, y: 0, text: 'u', width: 6 },
      { x: 123, y: 0, text: 'l', width: 2.9 },
      { x: 125.8, y: 0, text: 'l', width: 2.9 },
      { x: 128.6, y: 0, text: 'e', width: 5.8 },
      { x: 134.3, y: 0, text: 'y', width: 5.2 },
      // gap to score column: 492.9 - 139.5 = 353.4
      { x: 492.9, y: 0, text: '4', width: 5.4 },
      { x: 498.4, y: 0, text: '1', width: 5.4 },
    ];
    expect(joinRowByGaps(row)).toBe('1 John Pulley 41');
  });

  it('handles tied position T24', () => {
    const row = [
      { x: 38.1, y: 0, text: 'T', width: 6 },
      { x: 44.1, y: 0, text: '2', width: 6.3 },
      { x: 50.4, y: 0, text: '4', width: 6.3 },
      // gap to name: 85 - 56.7 = 28.3
      { x: 85, y: 0, text: 'T', width: 6 },
      { x: 90.5, y: 0, text: 'r', width: 3.9 },
      { x: 94.3, y: 0, text: 'e', width: 5.8 },
      { x: 100, y: 0, text: 'v', width: 5.2 },
      { x: 105.1, y: 0, text: 'o', width: 5.9 },
      { x: 111, y: 0, text: 'r', width: 3.9 },
      // word gap
      { x: 117.3, y: 0, text: 'M', width: 8.5 },
      { x: 125.8, y: 0, text: 'a', width: 5.6 },
      { x: 131.4, y: 0, text: 's', width: 5.1 },
      { x: 136.6, y: 0, text: 'o', width: 5.9 },
      { x: 142.4, y: 0, text: 'n', width: 6 },
      // score column
      { x: 492.9, y: 0, text: '3', width: 5.4 },
      { x: 498.4, y: 0, text: '4', width: 5.4 },
    ];
    expect(joinRowByGaps(row)).toBe('T24 Trevor Mason 34');
  });

  it('handles double-digit position like 10', () => {
    const row = [
      { x: 41.1, y: 0, text: '1', width: 6.3 },
      { x: 47.4, y: 0, text: '0', width: 6.3 },
      // gap to name
      { x: 85, y: 0, text: 'M', width: 8.5 },
      { x: 93.5, y: 0, text: 'a', width: 5.6 },
      { x: 99.1, y: 0, text: 't', width: 3.7 },
      { x: 102.7, y: 0, text: 't', width: 3.7 },
      { x: 106.4, y: 0, text: 'h', width: 6 },
      { x: 112.4, y: 0, text: 'e', width: 5.8 },
      { x: 118.1, y: 0, text: 'w', width: 8.1 },
      // word gap
      { x: 128.6, y: 0, text: 'P', width: 6.4 },
      { x: 135, y: 0, text: 'u', width: 6 },
      { x: 141, y: 0, text: 'l', width: 2.9 },
      { x: 143.8, y: 0, text: 'f', width: 3.4 },
      { x: 147.2, y: 0, text: 'o', width: 5.9 },
      { x: 153.1, y: 0, text: 'r', width: 3.9 },
      { x: 156.8, y: 0, text: 'd', width: 6.1 },
      // score
      { x: 492.9, y: 0, text: '3', width: 5.4 },
      { x: 498.4, y: 0, text: '6', width: 5.4 },
    ];
    expect(joinRowByGaps(row)).toBe('10 Matthew Pulford 36');
  });
});
