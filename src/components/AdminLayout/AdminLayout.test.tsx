vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: '1', firstName: 'Admin', lastName: 'User', username: 'admin', role: 'admin' },
    logout: vi.fn(),
  }),
}));

describe('AdminLayout', () => {
  it('module exports a default component', async () => {
    const mod = await import('./AdminLayout');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });
});
