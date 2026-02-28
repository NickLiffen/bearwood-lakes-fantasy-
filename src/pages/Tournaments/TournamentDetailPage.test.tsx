vi.mock('../../hooks/useApiClient', () => ({
  useApiClient: () => ({
    get: vi.fn().mockResolvedValue({ success: true, data: null }),
    post: vi.fn(),
    put: vi.fn(),
    del: vi.fn(),
    isAuthReady: true,
  }),
}));

vi.mock('../../hooks/useDocumentTitle', () => ({
  useDocumentTitle: vi.fn(),
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: '1', firstName: 'Test', lastName: 'User', username: 'testuser', role: 'user', phoneVerified: true },
    logout: vi.fn(),
  }),
}));

vi.mock('../../components/layout/PageLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../components/ui/LoadingSpinner', () => ({
  default: () => <div>Loading...</div>,
}));

vi.mock('../../components/ui/DataTable', () => ({
  default: () => <div>DataTable</div>,
}));

vi.mock('../../utils/formatters', () => ({
  formatRawScore: vi.fn().mockReturnValue('0'),
}));

import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import TournamentDetailPage from './TournamentDetailPage';

describe('TournamentDetailPage', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter initialEntries={['/tournaments/123']}>
        <TournamentDetailPage />
      </MemoryRouter>
    );
    expect(document.body).toBeTruthy();
  });
});
