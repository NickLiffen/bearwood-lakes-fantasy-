vi.mock('../../../hooks/useApiClient', () => ({
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
import TeamOfTheWeekModal from './TeamOfTheWeekModal';

describe('TeamOfTheWeekModal', () => {
  it('renders modal with header', () => {
    render(
      <MemoryRouter>
        <TeamOfTheWeekModal date="2026-03-21" season="2026" onClose={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByText('⭐ Team of the Week')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    render(
      <MemoryRouter>
        <TeamOfTheWeekModal date="2026-03-21" season="2026" onClose={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByText('Loading dream team...')).toBeInTheDocument();
  });

  it('renders close button', () => {
    render(
      <MemoryRouter>
        <TeamOfTheWeekModal date="2026-03-21" season="2026" onClose={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByText('Close')).toBeInTheDocument();
  });
});
