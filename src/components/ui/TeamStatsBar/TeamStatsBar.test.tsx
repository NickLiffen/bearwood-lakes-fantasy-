import { render, screen } from '@testing-library/react';
import TeamStatsBar from './TeamStatsBar';

describe('TeamStatsBar', () => {
  it('renders week, month, and season points', () => {
    render(<TeamStatsBar weekPoints={10} monthPoints={50} seasonPoints={200} />);
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
  });

  it('renders labels', () => {
    render(<TeamStatsBar weekPoints={0} monthPoints={0} seasonPoints={0} />);
    expect(screen.getByText('Current Week')).toBeInTheDocument();
    expect(screen.getByText('Current Month')).toBeInTheDocument();
    expect(screen.getByText('Season Total')).toBeInTheDocument();
  });

  it('renders ranks when provided', () => {
    render(
      <TeamStatsBar
        weekPoints={0}
        monthPoints={0}
        seasonPoints={0}
        weekRank={1}
        monthRank={3}
        seasonRank={5}
      />
    );
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#3')).toBeInTheDocument();
    expect(screen.getByText('#5')).toBeInTheDocument();
  });
});
