import { render, screen, fireEvent } from '@testing-library/react';
import PeriodNav from './PeriodNav';

const defaultProps = {
  id: 'period-nav',
  options: [
    { value: '2025-01-01', label: 'Week 1' },
    { value: '2025-01-08', label: 'Week 2' },
  ],
  selectedDate: '2025-01-01',
  hasPrevious: true,
  hasNext: true,
  onNavigate: vi.fn(),
  onSelect: vi.fn(),
};

describe('PeriodNav', () => {
  it('renders navigation buttons and select', () => {
    render(<PeriodNav {...defaultProps} />);
    expect(screen.getByLabelText('Previous period')).toBeInTheDocument();
    expect(screen.getByLabelText('Next period')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('disables previous button when hasPrevious is false', () => {
    render(<PeriodNav {...defaultProps} hasPrevious={false} />);
    expect(screen.getByLabelText('Previous period')).toBeDisabled();
  });

  it('disables next button when hasNext is false', () => {
    render(<PeriodNav {...defaultProps} hasNext={false} />);
    expect(screen.getByLabelText('Next period')).toBeDisabled();
  });

  it('calls onNavigate with prev', () => {
    const onNavigate = vi.fn();
    render(<PeriodNav {...defaultProps} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByLabelText('Previous period'));
    expect(onNavigate).toHaveBeenCalledWith('prev');
  });

  it('calls onSelect when dropdown changes', () => {
    const onSelect = vi.fn();
    render(<PeriodNav {...defaultProps} onSelect={onSelect} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2025-01-08' } });
    expect(onSelect).toHaveBeenCalledWith('2025-01-08');
  });
});
