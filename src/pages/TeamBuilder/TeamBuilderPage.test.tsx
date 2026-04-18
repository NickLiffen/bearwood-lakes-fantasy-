const mockGet = vi.fn();
const mockPost = vi.fn();

const mockApiClient = {
  get: mockGet,
  post: mockPost,
  put: vi.fn(),
  del: vi.fn(),
  isAuthReady: true,
};

vi.mock('../../hooks/useApiClient', () => ({
  useApiClient: () => mockApiClient,
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

vi.mock('../../components/ui/Toast', () => ({
  default: () => null,
}));

vi.mock('../../utils/search', () => ({
  matchesSearch: vi.fn().mockReturnValue(true),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import TeamBuilderPage from './TeamBuilderPage';

const makeGolfer = (id: string, firstName: string, lastName: string, price = 8000000) => ({
  id,
  firstName,
  lastName,
  picture: '',
  price,
  isActive: true,
  stats2024: {
    timesBonusScored: 0,
    timesFinished1st: 0,
    timesFinished2nd: 0,
    timesFinished3rd: 0,
    timesPlayed: 5,
  },
  stats2025: {
    timesBonusScored: 0,
    timesFinished1st: 0,
    timesFinished2nd: 0,
    timesFinished3rd: 0,
    timesPlayed: 5,
  },
});

const allGolfers = [
  makeGolfer('g1', 'Rory', 'McIlroy', 10000000),
  makeGolfer('g2', 'Jon', 'Rahm', 9000000),
  makeGolfer('g3', 'Scottie', 'Scheffler', 9500000),
  makeGolfer('g4', 'Viktor', 'Hovland', 7000000),
  makeGolfer('g5', 'Collin', 'Morikawa', 7500000),
  makeGolfer('g6', 'Xander', 'Schauffele', 7000000),
  makeGolfer('g7', 'Brooks', 'Koepka', 6000000),
  makeGolfer('g8', 'Justin', 'Thomas', 6500000),
];

const existingTeam = allGolfers.slice(0, 6);

function setupMocks(
  options: {
    hasTeam?: boolean;
    captainId?: string | null;
    transfersOpen?: boolean;
  } = {}
) {
  const { hasTeam = false, captainId = null, transfersOpen = true } = options;

  mockGet.mockImplementation((endpoint: string) => {
    if (endpoint.startsWith('golfers-list')) {
      return Promise.resolve({ success: true, data: allGolfers });
    }
    if (endpoint === 'picks-get') {
      if (hasTeam) {
        return Promise.resolve({
          success: true,
          data: { golfers: existingTeam, captainId },
        });
      }
      return Promise.resolve({ success: true, data: null });
    }
    if (endpoint === 'settings-public') {
      return Promise.resolve({
        success: true,
        data: {
          transfersOpen,
          registrationOpen: true,
          currentSeason: 2025,
          allowNewTeamCreation: true,
        },
      });
    }
    return Promise.resolve({ success: true, data: null });
  });

  mockPost.mockResolvedValue({ success: true, data: {} });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <TeamBuilderPage />
    </MemoryRouter>
  );
}

describe('TeamBuilderPage', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockNavigate.mockReset();
  });

  it('renders without crashing', async () => {
    setupMocks();
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });
  });

  describe('Captain Toggle', () => {
    it('renders captain toggle buttons on filled team slots for existing teams', async () => {
      setupMocks({ hasTeam: true, transfersOpen: true });
      renderPage();

      await waitFor(() => {
        const captainButtons = screen.getAllByTitle('Make captain (2× points)');
        expect(captainButtons.length).toBe(6);
      });
    });

    it('shows active captain toggle when existing team has a captain', async () => {
      setupMocks({ hasTeam: true, captainId: 'g1', transfersOpen: true });
      renderPage();

      await waitFor(() => {
        const removeBtn = screen.getByTitle('Remove captain');
        expect(removeBtn).toBeInTheDocument();
        expect(removeBtn).toHaveClass('active');
      });
    });

    it('toggles captain when clicking the C button', async () => {
      setupMocks({ hasTeam: true, transfersOpen: true });
      renderPage();

      await waitFor(() => {
        expect(screen.getAllByTitle('Make captain (2× points)').length).toBe(6);
      });

      // Click first captain button
      const captainButtons = screen.getAllByTitle('Make captain (2× points)');
      fireEvent.click(captainButtons[0]);

      // Should now show 'Remove captain' for the clicked one
      await waitFor(() => {
        expect(screen.getByTitle('Remove captain')).toBeInTheDocument();
      });
    });

    it('clicking captain button does NOT remove the golfer from the team', async () => {
      setupMocks({ hasTeam: true, transfersOpen: true });
      renderPage();

      await waitFor(() => {
        expect(screen.getAllByTitle('Make captain (2× points)').length).toBe(6);
      });

      // All 6 golfers should be displayed
      const slotsBeforeClick =
        screen.getAllByTitle('Make captain (2× points)').length +
        screen.queryAllByTitle('Remove captain').length;
      expect(slotsBeforeClick).toBe(6);

      // Click captain toggle — should NOT remove golfer
      fireEvent.click(screen.getAllByTitle('Make captain (2× points)')[0]);

      // Still 6 captain buttons total (5 inactive + 1 active)
      await waitFor(() => {
        const inactive = screen.getAllByTitle('Make captain (2× points)');
        const active = screen.getAllByTitle('Remove captain');
        expect(inactive.length + active.length).toBe(6);
      });
    });

    it('preserves existing captain when saving without touching captain', async () => {
      setupMocks({ hasTeam: true, captainId: 'g1', transfersOpen: true });
      renderPage();

      await waitFor(() => {
        expect(screen.getByTitle('Remove captain')).toBeInTheDocument();
      });

      // Click Save without touching captain
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Save Team' })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save Team' }));

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith(
          'picks-save',
          expect.objectContaining({
            captainId: 'g1',
          })
        );
      });
    });

    it('sends new captain ID when captain is changed and save is clicked', async () => {
      setupMocks({ hasTeam: true, captainId: 'g1', transfersOpen: true });
      renderPage();

      await waitFor(() => {
        expect(screen.getByTitle('Remove captain')).toBeInTheDocument();
      });

      // Change captain — click a "Make captain" button (not g1, since g1 shows "Remove captain")
      const makeCaptainBtns = screen.getAllByTitle('Make captain (2× points)');
      fireEvent.click(makeCaptainBtns[0]);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Save Team' })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save Team' }));

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith(
          'picks-save',
          expect.objectContaining({
            captainId: expect.any(String),
          })
        );
        const callArgs = mockPost.mock.calls[0][1];
        expect(callArgs.captainId).not.toBe('g1');
      });
    });

    it('clears captain when that golfer is removed from the team', async () => {
      setupMocks({ hasTeam: true, captainId: 'g1', transfersOpen: true });
      renderPage();

      await waitFor(() => {
        expect(screen.getByTitle('Remove captain')).toBeInTheDocument();
      });

      // Remove g1 (the captain) via the remove button
      const removeButtons = screen.getAllByTitle('Remove golfer');
      fireEvent.click(removeButtons[0]);

      // Captain badge should be gone — no more "Remove captain"
      await waitFor(() => {
        expect(screen.queryByTitle('Remove captain')).not.toBeInTheDocument();
      });
    });
  });

  describe('Transfer Summary', () => {
    it('does NOT show transfer summary for new teams', async () => {
      setupMocks({ hasTeam: false });
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      });

      expect(screen.queryByText(/Transfer Summary/)).not.toBeInTheDocument();
    });

    it('does NOT show transfer summary when no changes are made to existing team', async () => {
      setupMocks({ hasTeam: true, transfersOpen: true });
      renderPage();

      await waitFor(() => {
        expect(screen.getAllByTitle('Remove golfer').length).toBe(6);
      });

      expect(screen.queryByText(/Transfer Summary/)).not.toBeInTheDocument();
    });

    it('shows transfer summary with removed golfer when a golfer is dropped', async () => {
      setupMocks({ hasTeam: true, transfersOpen: true });
      renderPage();

      await waitFor(() => {
        expect(screen.getAllByTitle('Remove golfer').length).toBe(6);
      });

      // Remove first golfer (McIlroy)
      const removeButtons = screen.getAllByTitle('Remove golfer');
      fireEvent.click(removeButtons[0]);

      // Transfer summary should appear showing removal
      await waitFor(() => {
        expect(screen.getByText(/Transfer Summary/)).toBeInTheDocument();
        expect(screen.getByText(/− Rory McIlroy/)).toBeInTheDocument();
      });
    });

    it('shows added golfer in transfer summary when a replacement is selected', async () => {
      setupMocks({ hasTeam: true, transfersOpen: true });
      renderPage();

      await waitFor(() => {
        expect(screen.getAllByTitle('Remove golfer').length).toBe(6);
      });

      // Remove first golfer (McIlroy)
      fireEvent.click(screen.getAllByTitle('Remove golfer')[0]);

      await waitFor(() => {
        expect(screen.getByText(/− Rory McIlroy/)).toBeInTheDocument();
      });

      // Add Koepka (g7, not in original team) via the golfer card → modal → "Add to Team"
      const koepkaCard = screen.getByText('Brooks Koepka').closest('.golfer-card-compact')!;
      fireEvent.click(koepkaCard);

      // Modal opens — click "Add to Team"
      await waitFor(() => {
        expect(screen.getByText(/Add to Team/)).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText(/Add to Team/));

      // Transfer summary should show both removed and added
      await waitFor(() => {
        expect(screen.getByText(/Transfer Summary/)).toBeInTheDocument();
        expect(screen.getByText(/− Rory McIlroy/)).toBeInTheDocument();
        expect(screen.getByText(/\+ Brooks Koepka/)).toBeInTheDocument();
      });
    });

    it('clears captain via handleToggleGolfer removal path (modal remove)', async () => {
      setupMocks({ hasTeam: true, captainId: 'g1', transfersOpen: true });
      renderPage();

      await waitFor(() => {
        expect(screen.getByTitle('Remove captain')).toBeInTheDocument();
      });

      // Open McIlroy's detail modal from the grid
      const mcilroyCard = screen.getByText('Rory McIlroy').closest('.golfer-card-compact')!;
      fireEvent.click(mcilroyCard);

      // Modal shows "Remove from Team" since g1 is already selected
      await waitFor(() => {
        expect(screen.getByText(/Remove from Team/)).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText(/Remove from Team/));

      // Captain should be cleared since g1 was removed via handleToggleGolfer
      await waitFor(() => {
        expect(screen.queryByTitle('Remove captain')).not.toBeInTheDocument();
      });
    });

    it('omits captainId from save body when captain has been transferred out (null-captain regression guard)', async () => {
      // Ed-style bug: captain transferred out used to send captainId:null,
      // which the backend apply honoured as "clear captain". Now we omit the
      // field entirely so the server's apply fallback reassigns a captain.
      setupMocks({ hasTeam: true, captainId: 'g1', transfersOpen: true });
      renderPage();

      await waitFor(() => {
        expect(screen.getByTitle('Remove captain')).toBeInTheDocument();
      });

      // Remove g1 (the captain) — replace with a different golfer so the team stays at TEAM_SIZE
      const removeButtons = screen.getAllByTitle('Remove golfer');
      fireEvent.click(removeButtons[0]);

      // Add Koepka to replace McIlroy
      const koepkaCard = screen.getByText('Brooks Koepka').closest('.golfer-card-compact')!;
      fireEvent.click(koepkaCard);
      await waitFor(() => {
        expect(screen.getByText(/Add to Team/)).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText(/Add to Team/));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Save Team' })).toBeInTheDocument();
      });
      mockPost.mockClear();
      fireEvent.click(screen.getByRole('button', { name: 'Save Team' }));

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith('picks-save', expect.any(Object));
      });
      const [endpoint, body] = mockPost.mock.calls[0];
      expect(endpoint).toBe('picks-save');
      expect(body).not.toHaveProperty('captainId');
      expect(body.golferIds).toHaveLength(6);
    });
  });
});
