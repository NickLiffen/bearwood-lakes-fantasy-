const mockFetch = vi.fn();
global.fetch = mockFetch;

import { api } from './api';

describe('api service', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: {} }),
    });
  });

  it('login calls auth-login with POST', async () => {
    await api.login('user', 'pass');
    expect(mockFetch).toHaveBeenCalledWith(
      '/.netlify/functions/auth-login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'user', password: 'pass' }),
      })
    );
  });

  it('register calls auth-register with POST', async () => {
    const data = { firstName: 'A', lastName: 'B', username: 'ab', email: 'a@b.com', password: 'p' };
    await api.register(data);
    expect(mockFetch).toHaveBeenCalledWith(
      '/.netlify/functions/auth-register',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('getUsers calls users-list', async () => {
    await api.getUsers();
    expect(mockFetch).toHaveBeenCalledWith('/.netlify/functions/users-list', undefined);
  });

  it('getGolfers calls golfers-list', async () => {
    await api.getGolfers();
    expect(mockFetch).toHaveBeenCalledWith('/.netlify/functions/golfers-list', undefined);
  });

  it('getMyPicks calls picks-get', async () => {
    await api.getMyPicks();
    expect(mockFetch).toHaveBeenCalledWith('/.netlify/functions/picks-get', undefined);
  });

  it('savePicks calls picks-save with POST', async () => {
    await api.savePicks(['g1', 'g2']);
    expect(mockFetch).toHaveBeenCalledWith(
      '/.netlify/functions/picks-save',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('getLeaderboard calls leaderboard endpoint', async () => {
    await api.getLeaderboard();
    expect(mockFetch).toHaveBeenCalledWith('/.netlify/functions/leaderboard', undefined);
  });

  it('getLeaderboard with week calls correct endpoint', async () => {
    await api.getLeaderboard(3);
    expect(mockFetch).toHaveBeenCalledWith('/.netlify/functions/leaderboard?week=3', undefined);
  });

  it('enterScores calls scores-enter with POST', async () => {
    await api.enterScores('g1', 1, 10);
    expect(mockFetch).toHaveBeenCalledWith(
      '/.netlify/functions/scores-enter',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('lockTransfers calls admin-lock-transfers with POST', async () => {
    await api.lockTransfers();
    expect(mockFetch).toHaveBeenCalledWith(
      '/.netlify/functions/admin-lock-transfers',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
