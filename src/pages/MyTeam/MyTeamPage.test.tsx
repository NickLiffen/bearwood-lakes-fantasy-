const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn().mockResolvedValue({ success: true, data: null }),
  mockPost: vi.fn().mockResolvedValue({ success: true, data: null }),
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: '1',
      firstName: 'Test',
      lastName: 'User',
      username: 'testuser',
      role: 'user',
      phoneVerified: true,
    },
    token: 'mock-token',
    isAuthenticated: true,
    logout: vi.fn(),
    loading: false,
  }),
}));

vi.mock('../../hooks/useApiClient', () => ({
  useApiClient: () => ({
    get: mockGet,
    post: mockPost,
    put: vi.fn(),
    del: vi.fn(),
    isAuthReady: true,
  }),
}));

vi.mock('../../hooks/useActiveSeason', () => ({
  useActiveSeason: () => ({
    season: { id: 's1', name: '2025', isActive: true },
    loading: false,
    statsKey: 'stats2025',
  }),
}));

vi.mock('../../hooks/useDocumentTitle', () => ({
  useDocumentTitle: vi.fn(),
}));

vi.mock('../../components/layout/PageLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../components/ui/LoadingSpinner', () => ({
  default: () => <div>Loading...</div>,
}));

vi.mock('../../components/ui/PeriodNav', () => ({
  default: () => <div>PeriodNav</div>,
}));

vi.mock('../../components/ui/TeamStatsBar', () => ({
  default: () => <div>TeamStatsBar</div>,
}));

vi.mock('../../components/ui/TeamSection', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../components/ui/TeamHistory', () => ({
  default: () => <div>TeamHistory</div>,
}));

vi.mock('../../components/ui/TeamGolferTable', () => ({
  default: () => <div>TeamGolferTable</div>,
}));

vi.mock('../../components/ui/Toast', () => ({
  default: () => <div>Toast</div>,
}));

vi.mock('../../utils/gameweek', () => ({
  generateWeekOptions: vi.fn().mockReturnValue([]),
  formatDateString: vi.fn().mockReturnValue('Jan 1'),
}));

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import MyTeamPage from './MyTeamPage';

describe('MyTeamPage', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <MyTeamPage />
      </MemoryRouter>
    );
    expect(document.body).toBeTruthy();
  });

  it('renders golfer names in pending swap banner', async () => {
    mockGet.mockResolvedValueOnce({
      success: true,
      data: {
        hasTeam: true,
        transfersOpen: true,
        allowNewTeamCreation: true,
        maxTransfersPerWeek: 2,
        transfersUsedThisWeek: 0,
        unlimitedTransfers: false,
        team: {
          golfers: [
            {
              golfer: {
                id: 'g1',
                firstName: 'Rory',
                lastName: 'McIlroy',
                picture: '',
                price: 12_000_000,
                isActive: true,
                stats2024: {},
                stats2025: {},
                stats2026: {},
              },
              weekPoints: 50,
              monthPoints: 100,
              seasonPoints: 200,
              weekScores: [],
              seasonScores: [],
              isCaptain: false,
            },
          ],
          totals: { weekPoints: 50, monthPoints: 100, seasonPoints: 200, totalSpent: 12_000_000 },
          captainId: null,
          period: {
            weekStart: '2025-01-04T00:00:00Z',
            weekEnd: '2025-01-10T23:59:59Z',
            label: 'Jan 4 - Jan 10',
            gameweek: 1,
            hasPrevious: false,
            hasNext: true,
          },
          seasonStart: '2025-01-04T00:00:00Z',
          teamEffectiveStart: '2025-01-04T00:00:00Z',
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
        pendingChanges: {
          pendingGolferIds: ['g1', 'g3'],
          pendingCaptainId: null,
          pendingChangedAt: '2025-02-01T14:30:00Z',
          addedGolfers: [{ id: 'g3', name: 'Scottie Scheffler' }],
          removedGolfers: [{ id: 'g2', name: 'Tiger Woods' }],
        },
      },
    });

    render(
      <MemoryRouter>
        <MyTeamPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Swapping out Tiger Woods/)).toBeInTheDocument();
      expect(screen.getByText(/adding Scottie Scheffler/)).toBeInTheDocument();
    });
  });

  it('renders captain removal banner when pendingCaptainId is null', async () => {
    mockGet.mockResolvedValueOnce({
      success: true,
      data: {
        hasTeam: true,
        transfersOpen: true,
        allowNewTeamCreation: true,
        maxTransfersPerWeek: 2,
        transfersUsedThisWeek: 0,
        unlimitedTransfers: false,
        team: {
          golfers: [
            {
              golfer: {
                id: 'g1',
                firstName: 'Rory',
                lastName: 'McIlroy',
                picture: '',
                price: 12_000_000,
                isActive: true,
                stats2024: {},
                stats2025: {},
                stats2026: {},
              },
              weekPoints: 50,
              monthPoints: 100,
              seasonPoints: 200,
              weekScores: [],
              seasonScores: [],
              isCaptain: true,
            },
          ],
          totals: { weekPoints: 50, monthPoints: 100, seasonPoints: 200, totalSpent: 12_000_000 },
          captainId: 'g1',
          period: {
            weekStart: '2025-01-04T00:00:00Z',
            weekEnd: '2025-01-10T23:59:59Z',
            label: 'Jan 4 - Jan 10',
            gameweek: 1,
            hasPrevious: false,
            hasNext: true,
          },
          seasonStart: '2025-01-04T00:00:00Z',
          teamEffectiveStart: '2025-01-04T00:00:00Z',
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
        pendingChanges: {
          pendingGolferIds: null,
          pendingCaptainId: null,
          pendingChangedAt: '2025-02-01T14:30:00Z',
          addedGolfers: null,
          removedGolfers: null,
        },
      },
    });

    render(
      <MemoryRouter>
        <MyTeamPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Captain change scheduled: Rory McIlroy/)).toBeInTheDocument();
      expect(screen.getByText(/→ None/)).toBeInTheDocument();
    });
  });

  it('resolves new captain name from addedGolfers when captain is a swapped-in golfer', async () => {
    mockGet.mockResolvedValueOnce({
      success: true,
      data: {
        hasTeam: true,
        transfersOpen: true,
        allowNewTeamCreation: true,
        maxTransfersPerWeek: 2,
        transfersUsedThisWeek: 0,
        unlimitedTransfers: false,
        team: {
          golfers: [
            {
              golfer: {
                id: 'g1',
                firstName: 'Rory',
                lastName: 'McIlroy',
                picture: '',
                price: 12_000_000,
                isActive: true,
                stats2024: {},
                stats2025: {},
                stats2026: {},
              },
              weekPoints: 50,
              monthPoints: 100,
              seasonPoints: 200,
              weekScores: [],
              seasonScores: [],
              isCaptain: true,
            },
          ],
          totals: { weekPoints: 50, monthPoints: 100, seasonPoints: 200, totalSpent: 12_000_000 },
          captainId: 'g1',
          period: {
            weekStart: '2025-01-04T00:00:00Z',
            weekEnd: '2025-01-10T23:59:59Z',
            label: 'Jan 4 - Jan 10',
            gameweek: 1,
            hasPrevious: false,
            hasNext: true,
          },
          seasonStart: '2025-01-04T00:00:00Z',
          teamEffectiveStart: '2025-01-04T00:00:00Z',
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
        pendingChanges: {
          pendingGolferIds: ['g1', 'g3'],
          pendingCaptainId: 'g3',
          pendingChangedAt: '2025-02-01T14:30:00Z',
          addedGolfers: [{ id: 'g3', name: 'Scottie Scheffler' }],
          removedGolfers: [{ id: 'g2', name: 'Tiger Woods' }],
        },
      },
    });

    render(
      <MemoryRouter>
        <MyTeamPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Captain change scheduled: Rory McIlroy → Scottie Scheffler/)
      ).toBeInTheDocument();
    });
  });

  it('renders Make Captain button next to added golfer in pending banner', async () => {
    mockGet.mockResolvedValueOnce({
      success: true,
      data: {
        hasTeam: true,
        transfersOpen: true,
        allowNewTeamCreation: true,
        maxTransfersPerWeek: 2,
        transfersUsedThisWeek: 0,
        unlimitedTransfers: false,
        team: {
          golfers: [
            {
              golfer: {
                id: 'g1',
                firstName: 'Rory',
                lastName: 'McIlroy',
                picture: '',
                price: 12_000_000,
                isActive: true,
                stats2024: {},
                stats2025: {},
                stats2026: {},
              },
              weekPoints: 50,
              monthPoints: 100,
              seasonPoints: 200,
              weekScores: [],
              seasonScores: [],
              isCaptain: false,
            },
          ],
          totals: { weekPoints: 50, monthPoints: 100, seasonPoints: 200, totalSpent: 12_000_000 },
          captainId: null,
          period: {
            weekStart: '2025-01-04T00:00:00Z',
            weekEnd: '2025-01-10T23:59:59Z',
            label: 'Jan 4 - Jan 10',
            gameweek: 1,
            hasPrevious: false,
            hasNext: true,
          },
          seasonStart: '2025-01-04T00:00:00Z',
          teamEffectiveStart: '2025-01-04T00:00:00Z',
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
        pendingChanges: {
          pendingGolferIds: ['g1', 'g3'],
          pendingCaptainId: null,
          pendingChangedAt: '2025-02-01T14:30:00Z',
          addedGolfers: [{ id: 'g3', name: 'Scottie Scheffler' }],
          removedGolfers: [{ id: 'g2', name: 'Tiger Woods' }],
        },
      },
    });

    render(
      <MemoryRouter>
        <MyTeamPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Make Captain' })).toBeInTheDocument();
    });
  });

  it('renders captain badge instead of button when added golfer is pending captain', async () => {
    mockGet.mockResolvedValueOnce({
      success: true,
      data: {
        hasTeam: true,
        transfersOpen: true,
        allowNewTeamCreation: true,
        maxTransfersPerWeek: 2,
        transfersUsedThisWeek: 0,
        unlimitedTransfers: false,
        team: {
          golfers: [
            {
              golfer: {
                id: 'g1',
                firstName: 'Rory',
                lastName: 'McIlroy',
                picture: '',
                price: 12_000_000,
                isActive: true,
                stats2024: {},
                stats2025: {},
                stats2026: {},
              },
              weekPoints: 50,
              monthPoints: 100,
              seasonPoints: 200,
              weekScores: [],
              seasonScores: [],
              isCaptain: true,
            },
          ],
          totals: { weekPoints: 50, monthPoints: 100, seasonPoints: 200, totalSpent: 12_000_000 },
          captainId: 'g1',
          period: {
            weekStart: '2025-01-04T00:00:00Z',
            weekEnd: '2025-01-10T23:59:59Z',
            label: 'Jan 4 - Jan 10',
            gameweek: 1,
            hasPrevious: false,
            hasNext: true,
          },
          seasonStart: '2025-01-04T00:00:00Z',
          teamEffectiveStart: '2025-01-04T00:00:00Z',
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
        pendingChanges: {
          pendingGolferIds: ['g1', 'g3'],
          pendingCaptainId: 'g3',
          pendingChangedAt: '2025-02-01T14:30:00Z',
          addedGolfers: [{ id: 'g3', name: 'Scottie Scheffler' }],
          removedGolfers: [{ id: 'g2', name: 'Tiger Woods' }],
        },
      },
    });

    render(
      <MemoryRouter>
        <MyTeamPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      // The active pending captain badge is now a non-interactive indicator,
      // not a button — you swap captain by clicking C/Make Captain on another
      // golfer, never by "unsetting" the current one.
      const badge = screen.getByLabelText('Pending captain');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('pending-captain-badge');
      expect(badge.tagName).toBe('SPAN');
      // And there is no Remove/Unset affordance.
      expect(screen.queryByRole('button', { name: /Remove captain/i })).not.toBeInTheDocument();
    });
  });

  it('calls picks-save with pendingGolferIds when making pending golfer captain', async () => {
    mockPost.mockResolvedValueOnce({ success: true, data: {} });
    // Re-fetch after save
    mockGet
      .mockResolvedValueOnce({
        success: true,
        data: {
          hasTeam: true,
          transfersOpen: true,
          allowNewTeamCreation: true,
          maxTransfersPerWeek: 2,
          transfersUsedThisWeek: 0,
          unlimitedTransfers: false,
          team: {
            golfers: [
              {
                golfer: {
                  id: 'g1',
                  firstName: 'Rory',
                  lastName: 'McIlroy',
                  picture: '',
                  price: 12_000_000,
                  isActive: true,
                  stats2024: {},
                  stats2025: {},
                  stats2026: {},
                },
                weekPoints: 50,
                monthPoints: 100,
                seasonPoints: 200,
                weekScores: [],
                seasonScores: [],
                isCaptain: false,
              },
            ],
            totals: {
              weekPoints: 50,
              monthPoints: 100,
              seasonPoints: 200,
              totalSpent: 12_000_000,
            },
            captainId: null,
            period: {
              weekStart: '2025-01-04T00:00:00Z',
              weekEnd: '2025-01-10T23:59:59Z',
              label: 'Jan 4 - Jan 10',
              gameweek: 1,
              hasPrevious: false,
              hasNext: true,
            },
            seasonStart: '2025-01-04T00:00:00Z',
            teamEffectiveStart: '2025-01-04T00:00:00Z',
            createdAt: '2025-01-01',
            updatedAt: '2025-01-01',
          },
          pendingChanges: {
            pendingGolferIds: ['g1', 'g3'],
            pendingCaptainId: null,
            pendingChangedAt: '2025-02-01T14:30:00Z',
            addedGolfers: [{ id: 'g3', name: 'Scottie Scheffler' }],
            removedGolfers: [{ id: 'g2', name: 'Tiger Woods' }],
          },
        },
      })
      .mockResolvedValue({ success: true, data: null });

    render(
      <MemoryRouter>
        <MyTeamPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Make Captain' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Make Captain' }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('picks-save', {
        golferIds: ['g1', 'g3'],
        captainId: 'g3',
      });
    });
  });

  it('does NOT post captainId:null when pending captain is re-clicked (toggle-bug regression)', async () => {
    // This is the bug Ed Saliba hit: his pending captain was set to Tony Grover,
    // then a second click (within 6s) silently set it to null, which the apply
    // honored. We now render the active pending captain as a non-interactive
    // span with no onClick, so no post can fire from re-clicking it.
    mockGet.mockResolvedValueOnce({
      success: true,
      data: {
        hasTeam: true,
        transfersOpen: true,
        allowNewTeamCreation: true,
        maxTransfersPerWeek: 2,
        transfersUsedThisWeek: 0,
        unlimitedTransfers: false,
        team: {
          golfers: [
            {
              golfer: {
                id: 'g1',
                firstName: 'Rory',
                lastName: 'McIlroy',
                picture: '',
                price: 12_000_000,
                isActive: true,
                stats2024: {},
                stats2025: {},
                stats2026: {},
              },
              weekPoints: 0,
              monthPoints: 0,
              seasonPoints: 0,
              weekScores: [],
              seasonScores: [],
              isCaptain: true,
            },
          ],
          totals: { weekPoints: 0, monthPoints: 0, seasonPoints: 0, totalSpent: 12_000_000 },
          captainId: 'g1',
          period: {
            weekStart: '2025-01-04T00:00:00Z',
            weekEnd: '2025-01-10T23:59:59Z',
            label: 'Jan 4 - Jan 10',
            gameweek: 1,
            hasPrevious: false,
            hasNext: true,
          },
          seasonStart: '2025-01-04T00:00:00Z',
          teamEffectiveStart: '2025-01-04T00:00:00Z',
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
        },
        pendingChanges: {
          pendingGolferIds: ['g1', 'g3'],
          pendingCaptainId: 'g3',
          pendingChangedAt: '2025-02-01T14:30:00Z',
          addedGolfers: [{ id: 'g3', name: 'Scottie Scheffler' }],
          removedGolfers: [{ id: 'g2', name: 'Tiger Woods' }],
        },
      },
    });

    mockPost.mockClear();
    render(
      <MemoryRouter>
        <MyTeamPage />
      </MemoryRouter>
    );

    const badge = await screen.findByLabelText('Pending captain');
    // Click the badge — should be a no-op (it's a span, not a button)
    fireEvent.click(badge);
    // Give React a chance to flush
    await new Promise((r) => setTimeout(r, 50));

    // Critically: no picks-save call should have fired at all, and in
    // particular no captainId:null call.
    expect(mockPost).not.toHaveBeenCalled();
    // And no call should ever pass captainId:null even if future refactors
    // wire an onClick back in.
    const nullCaptainCalls = mockPost.mock.calls.filter(
      ([endpoint, body]: [string, Record<string, unknown>]) =>
        endpoint === 'picks-save' && body?.captainId === null
    );
    expect(nullCaptainCalls).toHaveLength(0);
  });
});
