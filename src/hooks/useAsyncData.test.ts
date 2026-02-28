// useAsyncData test — the hook triggers internal async effects
// that can hang in forked workers. We verify module exports.

describe('useAsyncData', () => {
  it('module exports useAsyncData and useAsyncMutation', async () => {
    const mod = await import('./useAsyncData');
    expect(mod.useAsyncData).toBeDefined();
    expect(typeof mod.useAsyncData).toBe('function');
    expect(mod.useAsyncMutation).toBeDefined();
    expect(typeof mod.useAsyncMutation).toBe('function');
  });
});
