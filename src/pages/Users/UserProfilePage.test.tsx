vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: '1', firstName: 'Test', lastName: 'User', username: 'testuser', role: 'user', phoneVerified: true },
    token: 'mock-token',
    isAuthenticated: true,
    logout: vi.fn(),
    loading: false,
  }),
}));

vi.mock('../../hooks/useApiClient', () => ({
  useApiClient: () => ({
    get: vi.fn().mockResolvedValue({ success: true, data: null }),
    post: vi.fn(),
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

vi.mock('../../components/ui/TeamGolferTable', () => ({
  default: () => <div>TeamGolferTable</div>,
}));

vi.mock('../../components/ui/TeamHistory', () => ({
  default: () => <div>TeamHistory</div>,
}));

vi.mock('../../components/ui/TeamCompareModal', () => ({
  default: () => <div>TeamCompareModal</div>,
}));

vi.mock('../../utils/formatters', () => ({
  formatDate: vi.fn().mockReturnValue('Jan 1, 2025'),
}));

vi.mock('../../utils/gameweek', () => ({
  generateWeekOptions: vi.fn().mockReturnValue([]),
  formatDateString: vi.fn().mockReturnValue('Jan 1'),
}));

import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import UserProfilePage from './UserProfilePage';

describe('UserProfilePage', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter initialEntries={['/users/123']}>
        <UserProfilePage />
      </MemoryRouter>
    );
    expect(document.body).toBeTruthy();
  });
});
