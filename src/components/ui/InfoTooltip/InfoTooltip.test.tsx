import { render, screen, fireEvent } from '@testing-library/react';
import InfoTooltip from './InfoTooltip';

describe('InfoTooltip', () => {
  it('renders trigger button', () => {
    render(<InfoTooltip text="Help text" />);
    expect(screen.getByLabelText('More info')).toBeInTheDocument();
  });

  it('does not show tooltip by default', () => {
    render(<InfoTooltip text="Help text" />);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows tooltip on click', () => {
    render(<InfoTooltip text="Help text" />);
    fireEvent.click(screen.getByLabelText('More info'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Help text');
  });

  it('hides tooltip on second click', () => {
    render(<InfoTooltip text="Help text" />);
    const button = screen.getByLabelText('More info');
    fireEvent.click(button);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.click(button);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
