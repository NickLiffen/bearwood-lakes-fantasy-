import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ScoreBreakdownModal from './ScoreBreakdownModal';
import type { TournamentScore } from '@shared/types';

const mockOnClose = vi.fn();

const baseTournamentScore: TournamentScore = {
  tournamentId: 't1',
  tournamentName: 'Weekend Medal',
  tournamentDate: '2026-04-05',
  tournamentType: 'weekend_medal',
  scoringFormat: 'medal',
  multiplier: 2,
  position: 2,
  basePoints: 7,
  bonusPoints: 1,
  multipliedPoints: 16,
  rawScore: 3,
  participated: true,
};

const dnpTournamentScore: TournamentScore = {
  tournamentId: 't2',
  tournamentName: 'Rollup Stableford',
  tournamentDate: '2026-04-06',
  tournamentType: 'rollup_stableford',
  scoringFormat: 'stableford',
  multiplier: 1,
  position: null,
  basePoints: 0,
  bonusPoints: 0,
  multipliedPoints: 0,
  rawScore: null,
  participated: false,
};

const renderModal = (props: Partial<React.ComponentProps<typeof ScoreBreakdownModal>> = {}) => {
  const defaults = {
    golferName: 'Tiger Woods',
    isCaptain: false,
    weekScores: [baseTournamentScore],
    weekLabel: 'Gameweek 3: Apr 5 - Apr 11',
    weekPoints: 16,
    onClose: mockOnClose,
  };
  return render(
    <MemoryRouter>
      <ScoreBreakdownModal {...defaults} {...props} />
    </MemoryRouter>
  );
};

describe('ScoreBreakdownModal', () => {
  beforeEach(() => {
    mockOnClose.mockClear();
  });

  it('renders golfer name and week label', () => {
    renderModal();
    expect(screen.getByText('Tiger Woods')).toBeInTheDocument();
    expect(screen.getByText('Gameweek 3: Apr 5 - Apr 11')).toBeInTheDocument();
  });

  it('renders tournament name and type', () => {
    renderModal();
    // Tournament name appears in the card header
    const tournamentNames = screen.getAllByText('Weekend Medal');
    expect(tournamentNames.length).toBeGreaterThanOrEqual(1);
  });

  it('shows position and base points', () => {
    renderModal();
    expect(screen.getByText('2nd')).toBeInTheDocument();
    expect(screen.getByText('+7 pts')).toBeInTheDocument();
  });

  it('shows bonus points when earned', () => {
    renderModal();
    expect(screen.getByText('+1 bonus')).toBeInTheDocument();
  });

  it('shows tournament multiplier when greater than 1', () => {
    renderModal();
    expect(screen.getByText(/× 2/)).toBeInTheDocument();
  });

  it('does not show captain multiplier row for non-captain', () => {
    renderModal({ isCaptain: false });
    expect(screen.queryByText(/× 2 \(Captain\)/)).not.toBeInTheDocument();
  });

  it('shows captain badge and multiplier row for captain', () => {
    renderModal({ isCaptain: true, weekPoints: 32 });
    expect(screen.getByText('👑 Captain')).toBeInTheDocument();
    expect(screen.getByText(/× 2 \(Captain\) 👑/)).toBeInTheDocument();
  });

  it('shows did-not-play section', () => {
    renderModal({ weekScores: [baseTournamentScore, dnpTournamentScore] });
    expect(screen.getByText('Did Not Play')).toBeInTheDocument();
    expect(screen.getByText('Rollup Stableford')).toBeInTheDocument();
  });

  it('shows grand total', () => {
    renderModal({ weekPoints: 16 });
    // The grand total label is always present
    expect(screen.getByText('Gameweek Total')).toBeInTheDocument();
    // The grand total value in the footer
    const grandTotalValue = document.querySelector('.grand-total-value');
    expect(grandTotalValue).toHaveTextContent('16 pts');
  });

  it('shows no-tournaments message when weekScores is empty', () => {
    renderModal({ weekScores: [], weekPoints: 0 });
    expect(screen.getByText('No tournaments this gameweek.')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    renderModal();
    fireEvent.click(screen.getByLabelText('Close'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when overlay is clicked', () => {
    renderModal();
    // Click the overlay (parent element with modal-overlay class)
    const overlay = document.querySelector('.score-breakdown-overlay');
    if (overlay) fireEvent.click(overlay);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on Escape key', () => {
    renderModal();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('shows scoring rules link', () => {
    renderModal();
    const link = screen.getByText(/View full scoring rules/);
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute('href', '/scoring');
  });

  it('shows stableford raw score format correctly', () => {
    const stablefordScore: TournamentScore = {
      ...baseTournamentScore,
      scoringFormat: 'stableford',
      rawScore: 36,
    };
    renderModal({ weekScores: [stablefordScore] });
    expect(screen.getByText('36 pts')).toBeInTheDocument();
  });
});
