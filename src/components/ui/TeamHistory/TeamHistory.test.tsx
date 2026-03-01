import { render, screen } from '@testing-library/react';
import TeamHistory from './TeamHistory';
import type { HistoryEntry } from './TeamHistory';

const mockHistory: HistoryEntry[] = [
  {
    changedAt: '2025-03-15T10:00:00Z',
    reason: 'Initial team',
    totalSpent: 40000000,
    golferCount: 6,
    addedGolfers: [{ id: '1', name: 'Tiger Woods' }],
    removedGolfers: [],
  },
];

describe('TeamHistory', () => {
  it('renders history entries', () => {
    render(<TeamHistory history={mockHistory} />);
    expect(screen.getByText('📜 Team History')).toBeInTheDocument();
    expect(screen.getByText('Initial team')).toBeInTheDocument();
    expect(screen.getByText('+ Tiger Woods')).toBeInTheDocument();
  });

  it('returns null when history is empty', () => {
    const { container } = render(<TeamHistory history={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
