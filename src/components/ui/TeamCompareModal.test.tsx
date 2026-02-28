vi.mock('../../hooks/useApiClient', () => ({
  useApiClient: () => ({
    get: vi.fn().mockResolvedValue({ success: false, error: 'mock' }),
    post: vi.fn(),
    put: vi.fn(),
    del: vi.fn(),
    isAuthReady: true,
  }),
}));

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TeamCompareModal from './TeamCompareModal';

describe('TeamCompareModal', () => {
  it('renders modal with header', () => {
    render(
      <MemoryRouter>
        <TeamCompareModal targetUserId="user-2" onClose={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByText('⚖️ Team Comparison')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    render(
      <MemoryRouter>
        <TeamCompareModal targetUserId="user-2" onClose={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByText('Loading comparison...')).toBeInTheDocument();
  });
});
