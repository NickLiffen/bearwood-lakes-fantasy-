import { seasonUploadSchema } from './season-upload.validator';

describe('seasonUploadSchema', () => {
  it('rejects empty csvText', () => {
    const result = seasonUploadSchema.safeParse({ csvText: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing csvText', () => {
    const result = seasonUploadSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts non-empty csvText', () => {
    const result = seasonUploadSchema.safeParse({ csvText: 'Name,Score\nAlice,72' });
    expect(result.success).toBe(true);
  });

  it('returns parsed data on success', () => {
    const result = seasonUploadSchema.parse({ csvText: 'data' });
    expect(result.csvText).toBe('data');
  });
});
