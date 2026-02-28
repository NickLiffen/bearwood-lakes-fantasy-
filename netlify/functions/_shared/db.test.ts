describe('db', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('throws descriptive error when MONGODB_URI is missing', async () => {
    vi.stubEnv('MONGODB_URI', '');

    const { connectToDatabase } = await import('./db');

    await expect(connectToDatabase()).rejects.toThrow('Missing required environment variable: MONGODB_URI');
  });
});
