import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TeamGolferTable from './TeamGolferTable';
import type { GolferData } from './TeamGolferTable';
import type { TournamentScore } from '@shared/types';

const mockWeekScores: TournamentScore[] = [
  {
    tournamentId: 't1',
    tournamentName: 'Weekend Medal',
    tournamentDate: '2026-04-05',
    tournamentType: 'weekend_medal',
    scoringFormat: 'medal',
    multiplier: 2,
    position: 1,
    basePoints: 10,
    bonusPoints: 3,
    multipliedPoints: 26,
    rawScore: 0,
    participated: true,
  },
];

const mockGolfers: GolferData[] = [
  {
    golfer: { id: '1', firstName: 'Tiger', lastName: 'Woods', picture: '' },
    weekPoints: 12,
    weekScores: mockWeekScores,
    isCaptain: false,
  },
];

const mockGolfersNoScores: GolferData[] = [
  {
    golfer: { id: '1', firstName: 'Tiger', lastName: 'Woods', picture: '' },
    weekPoints: 0,
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

  it('makes week points clickable when weekScores exist', () => {
    render(
      <MemoryRouter>
        <TeamGolferTable golfers={mockGolfers} weekLabel="Gameweek 3" />
      </MemoryRouter>
    );
    const scoreEl = screen.getByTitle('Click to see score breakdown');
    expect(scoreEl).toHaveClass('score-clickable');
  });

  it('does not make week points clickable when no weekScores', () => {
    render(
      <MemoryRouter>
        <TeamGolferTable golfers={mockGolfersNoScores} />
      </MemoryRouter>
    );
    expect(screen.queryByTitle('Click to see score breakdown')).not.toBeInTheDocument();
  });

  it('opens score breakdown modal when score is clicked', () => {
    render(
      <MemoryRouter>
        <TeamGolferTable golfers={mockGolfers} weekLabel="Gameweek 3" />
      </MemoryRouter>
    );
    const scoreEl = screen.getByTitle('Click to see score breakdown');
    fireEvent.click(scoreEl);
    expect(screen.getByText('📊 Score Breakdown')).toBeInTheDocument();
    // Tiger Woods appears in both table and modal — use getAllByText
    const tigerInstances = screen.getAllByText('Tiger Woods');
    expect(tigerInstances.length).toBe(2);
  });

  it('closes score breakdown modal when close button is clicked', () => {
    render(
      <MemoryRouter>
        <TeamGolferTable golfers={mockGolfers} weekLabel="Gameweek 3" />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTitle('Click to see score breakdown'));
    expect(screen.getByText('📊 Score Breakdown')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Close'));
    expect(screen.queryByText('📊 Score Breakdown')).not.toBeInTheDocument();
  });
});
