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
    isAdmin: false,
    logout: vi.fn(),
    loading: false,
  }),
}));

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

let capturedDataTableProps: Record<string, unknown> | null = null;
vi.mock('../../components/ui/DataTable', () => ({
  default: (props: Record<string, unknown>) => {
    capturedDataTableProps = props;
    return <div>DataTable</div>;
  },
}));

vi.mock('../../components/ui/InfoTooltip', () => ({
  default: () => <div>InfoTooltip</div>,
}));

vi.mock('../../utils/formatters', () => ({
  formatPrice: vi.fn((v: number) => `£${v}`),
}));

vi.mock('../../utils/search', () => ({
  matchesSearch: vi.fn().mockReturnValue(true),
}));

import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import GolfersPage from './GolfersPage';

describe('GolfersPage', () => {
  beforeEach(() => {
    capturedDataTableProps = null;
  });

  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <GolfersPage />
      </MemoryRouter>
    );
    expect(document.body).toBeTruthy();
  });

  it('passes a podiums column to DataTable', async () => {
    render(
      <MemoryRouter>
        <GolfersPage />
      </MemoryRouter>
    );

    await vi.waitFor(() => {
      expect(capturedDataTableProps).not.toBeNull();
    });

    const columns = capturedDataTableProps!.columns as { key: string; sortable?: boolean }[];
    const podiumsColumn = columns.find((c) => c.key === 'podiums');
    expect(podiumsColumn).toBeDefined();
    expect(podiumsColumn!.sortable).toBe(true);
  });
});
