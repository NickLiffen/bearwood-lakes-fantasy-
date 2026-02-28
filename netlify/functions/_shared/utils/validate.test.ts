import { z } from 'zod';
import { validateBody, validateBodySafe } from './validate';

const schema = z.object({ name: z.string(), age: z.number().optional() });

describe('validateBody', () => {
  it('throws when body is null', () => {
    expect(() => validateBody(schema, null)).toThrow('Request body is required');
  });

  it('throws when body is empty string', () => {
    expect(() => validateBody(schema, '')).toThrow('Request body is required');
  });

  it('throws on invalid JSON', () => {
    expect(() => validateBody(schema, '{not json')).toThrow();
  });

  it('throws on schema validation failure', () => {
    expect(() => validateBody(schema, JSON.stringify({ name: 123 }))).toThrow();
  });

  it('throws when required field is missing', () => {
    expect(() => validateBody(schema, JSON.stringify({ age: 5 }))).toThrow();
  });

  it('returns parsed data on valid input', () => {
    const result = validateBody(schema, JSON.stringify({ name: 'Alice', age: 30 }));
    expect(result).toEqual({ name: 'Alice', age: 30 });
  });

  it('strips unknown fields per Zod default', () => {
    const result = validateBody(schema, JSON.stringify({ name: 'Bob', extra: true }));
    expect(result).toEqual({ name: 'Bob' });
  });
});

describe('validateBodySafe', () => {
  it('returns error when body is null', () => {
    const result = validateBodySafe(schema, null);
    expect(result).toEqual({ success: false, error: 'Request body is required' });
  });

  it('returns error when body is empty string', () => {
    const result = validateBodySafe(schema, '');
    expect(result).toEqual({ success: false, error: 'Request body is required' });
  });

  it('returns error on invalid JSON', () => {
    const result = validateBodySafe(schema, '{bad}');
    expect(result).toEqual({ success: false, error: 'Invalid JSON body' });
  });

  it('returns error on schema validation failure', () => {
    const result = validateBodySafe(schema, JSON.stringify({ name: 42 }));
    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toBeTruthy();
  });

  it('returns parsed data on valid input', () => {
    const result = validateBodySafe(schema, JSON.stringify({ name: 'Carol' }));
    expect(result).toEqual({ success: true, data: { name: 'Carol' } });
  });

  it('returns data with optional fields', () => {
    const result = validateBodySafe(schema, JSON.stringify({ name: 'Dan', age: 25 }));
    expect(result).toEqual({ success: true, data: { name: 'Dan', age: 25 } });
  });
});
