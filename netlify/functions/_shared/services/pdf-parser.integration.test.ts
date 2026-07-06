// Integration test: runs the full parsePdfBuffer pipeline against a real PDF file
// Does NOT mock unpdf — exercises the actual PDF extraction + gap-based reconstruction

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parsePdfBuffer } from './pdf-parser.service';

describe('parsePdfBuffer integration', () => {
  it('parses the Masters Score PDF (spaced-character format) end-to-end', async () => {
    const fixturePath = resolve(import.meta.dirname, '__fixtures__/masters-score.pdf');
    const buffer = Buffer.from(readFileSync(fixturePath));

    const result = await parsePdfBuffer(buffer);

    // Should detect stableford scoring
    expect(result.scoringFormat).toBe('stableford');

    // Should extract tournament name from the header line
    expect(result.name).toBeTruthy();
    expect(result.name.toLowerCase()).toContain('stableford');

    // No date in this PDF
    expect(result.date).toBe('');

    // Should extract all 116 golfers
    expect(result.golfers.length).toBe(116);

    // First golfer: John Pulley with 41 points
    expect(result.golfers[0].position).toBe(1);
    expect(result.golfers[0].firstName).toBe('John');
    expect(result.golfers[0].lastName).toBe('Pulley');
    expect(result.golfers[0].rawScore).toBe(41);

    // Tied positions: T24 should parse as position 24
    const tied = result.golfers.filter((g) => g.position === 24);
    expect(tied.length).toBe(2);
    expect(tied.map((g) => g.lastName).sort()).toEqual(['Mason', 'Thomas']);

    // Hyphenated name: Jude Steinborn-Busse
    const jude = result.golfers.find((g) => g.lastName === 'Steinborn-Busse');
    expect(jude).toBeDefined();
    expect(jude!.firstName).toBe('Jude');
    expect(jude!.rawScore).toBe(34);

    // Last golfer: Brian Hargreaves with 0 points
    const last = result.golfers[result.golfers.length - 1];
    expect(last.position).toBe(116);
    expect(last.firstName).toBe('Brian');
    expect(last.lastName).toBe('Hargreaves');
    expect(last.rawScore).toBe(0);

    // Multi-word first names: Samuel Rhys Thomas
    const samuel = result.golfers.find((g) => g.lastName === 'Thomas');
    expect(samuel).toBeDefined();
    expect(samuel!.firstName).toBe('Samuel Rhys');

    // O'Neill apostrophe name
    const kevin = result.golfers.find((g) => g.lastName === "O'Neill");
    expect(kevin).toBeDefined();
    expect(kevin!.firstName).toBe('Kevin');
  });

  it('parses the 2-day Ladies Club Championship (nett) PDF end-to-end', async () => {
    const fixturePath = resolve(import.meta.dirname, '__fixtures__/ladies-club-champs-2day.pdf');
    const buffer = Buffer.from(readFileSync(fixturePath));

    const result = await parsePdfBuffer(buffer);

    // "(Nett)" title → medal scoring
    expect(result.scoringFormat).toBe('medal');
    expect(result.name).toBe('Ladies Club Championship');
    expect(result.golfers).toHaveLength(10);

    // rawScore is the To-Par(Nett) value, e.g. Lucie Robson +8
    expect(result.golfers[0]).toEqual({
      position: 1,
      firstName: 'Lucie',
      lastName: 'Robson',
      rawScore: 8,
    });
    expect(result.golfers[9]).toEqual({
      position: 10,
      firstName: 'Jo',
      lastName: 'Angel',
      rawScore: 31,
    });
  });

  it('parses the 2-day Mens Club Championships (nett, $ purse) PDF end-to-end', async () => {
    const fixturePath = resolve(import.meta.dirname, '__fixtures__/mens-club-champs-2day.pdf');
    const buffer = Buffer.from(readFileSync(fixturePath));

    const result = await parsePdfBuffer(buffer);

    expect(result.scoringFormat).toBe('medal');
    expect(result.name).toBe('Mens Club Championships');

    // Winner is level par (E → 0)
    expect(result.golfers[0]).toEqual({
      position: 1,
      firstName: 'Reahgan',
      lastName: 'Quartermaine',
      rawScore: 0,
    });
    // A known mid-field entry
    const nick = result.golfers.find((g) => g.lastName === 'Liffen');
    expect(nick).toBeDefined();
    expect(nick!.firstName).toBe('Nick');
  });

  it('parses the 2-day Seniors Club Championship (nett) PDF and excludes NR/WD/DNF', async () => {
    const fixturePath = resolve(import.meta.dirname, '__fixtures__/seniors-club-champs-2day.pdf');
    const buffer = Buffer.from(readFileSync(fixturePath));

    const result = await parsePdfBuffer(buffer);

    expect(result.scoringFormat).toBe('medal');
    expect(result.name).toBe("Seniors' Club Championship");

    // Only the 25 players who returned a valid 2-round score — NR/WD/DNF excluded
    expect(result.golfers).toHaveLength(25);

    expect(result.golfers[0]).toEqual({
      position: 1,
      firstName: 'Jit',
      lastName: 'Aujla',
      rawScore: 6,
    });
    // No incomplete-round players should appear
    expect(result.golfers.some((g) => g.lastName === 'Kates')).toBe(false);
    expect(result.golfers.some((g) => g.lastName === 'Owen')).toBe(false);
  });
});
