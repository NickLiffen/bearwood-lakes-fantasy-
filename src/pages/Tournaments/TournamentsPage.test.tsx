vi.mock('../../hooks/useApiClient', () => ({
  useApiClient: () => ({
    get: vi.fn().mockResolvedValue({ success: true, data: [] }),
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
    logout: vi.fn(),
  }),
}));

vi.mock('../../components/layout/PageLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../components/ui/LoadingSpinner', () => ({
  default: () => <div>Loading...</div>,
}));

vi.mock('../../components/ui/SearchBar', () => ({
  default: () => <div>SearchBar</div>,
}));

vi.mock('../../components/ui/SeasonSelector', () => ({
  default: () => <div>SeasonSelector</div>,
}));

vi.mock('../../components/ui/DataTable', () => ({
  default: () => <div>DataTable</div>,
}));

import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import TournamentsPage from './TournamentsPage';

describe('TournamentsPage', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <TournamentsPage />
      </MemoryRouter>
    );
    expect(document.body).toBeTruthy();
  });
});
