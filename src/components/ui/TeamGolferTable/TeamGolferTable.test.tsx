import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TeamGolferTable from './TeamGolferTable';
import type { GolferData } from './TeamGolferTable';

const mockGolfers: GolferData[] = [
  {
    golfer: { id: '1', firstName: 'Tiger', lastName: 'Woods', picture: '' },
    weekPoints: 12,
    isCaptain: false,
  },
];

describe('TeamGolferTable', () => {
  it('renders golfer names', () => {
    render(
      <MemoryRouter>
        <TeamGolferTable golfers={mockGolfers} />
      </MemoryRouter>
    );
    expect(screen.getByText('Tiger Woods')).toBeInTheDocument();
  });

  it('shows empty message when no golfers', () => {
    render(
      <MemoryRouter>
        <TeamGolferTable golfers={[]} />
      </MemoryRouter>
    );
    expect(screen.getByText('No golfers in this team.')).toBeInTheDocument();
  });

  it('renders week total when provided', () => {
    render(
      <MemoryRouter>
        <TeamGolferTable golfers={mockGolfers} weekTotal={24} />
      </MemoryRouter>
    );
    expect(screen.getByText('24 pts')).toBeInTheDocument();
  });
});
