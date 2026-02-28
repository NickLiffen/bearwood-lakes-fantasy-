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

vi.mock('../../components/ui/Toast', () => ({
  default: () => <div>Toast</div>,
}));

vi.mock('../../utils/search', () => ({
  matchesSearch: vi.fn().mockReturnValue(true),
}));

import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import TeamBuilderPage from './TeamBuilderPage';

describe('TeamBuilderPage', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <TeamBuilderPage />
      </MemoryRouter>
    );
    expect(document.body).toBeTruthy();
  });
});
