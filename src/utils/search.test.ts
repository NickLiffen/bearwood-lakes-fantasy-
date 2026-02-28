import { matchesSearch } from './search';

describe('matchesSearch', () => {
  it('returns true for empty query', () => {
    expect(matchesSearch('Rory McIlroy', '')).toBe(true);
  });

  it('returns true for whitespace-only query', () => {
    expect(matchesSearch('Rory McIlroy', '   ')).toBe(true);
  });

  it('matches a single token at start of word', () => {
    expect(matchesSearch('Matthew Green', 'matt')).toBe(true);
  });

  it('does not match a token in the middle of a word', () => {
    expect(matchesSearch('Matthew Green', 'att')).toBe(false);
  });

  it('matches multiple tokens against different words', () => {
    expect(matchesSearch('Matthew Green', 'm green')).toBe(true);
  });

  it('returns false when one token does not match any word start', () => {
    expect(matchesSearch('Matthew Green', 'm blue')).toBe(false);
  });

  it('is case insensitive', () => {
    expect(matchesSearch('Rory McIlroy', 'RORY')).toBe(true);
    expect(matchesSearch('TIGER WOODS', 'tiger')).toBe(true);
  });

  it('matches full word as prefix of itself', () => {
    expect(matchesSearch('Tiger Woods', 'tiger woods')).toBe(true);
  });

  it('returns false for non-matching single token', () => {
    expect(matchesSearch('Tiger Woods', 'phil')).toBe(false);
  });

  it('handles extra whitespace in query', () => {
    expect(matchesSearch('Tiger Woods', '  tiger   woods  ')).toBe(true);
  });

  it('handles single character text', () => {
    expect(matchesSearch('A', 'a')).toBe(true);
    expect(matchesSearch('A', 'b')).toBe(false);
  });

  it('returns true when query matches only first word', () => {
    expect(matchesSearch('Jon Rahm', 'jon')).toBe(true);
  });

  it('returns true when query matches only second word', () => {
    expect(matchesSearch('Jon Rahm', 'rah')).toBe(true);
  });
});
