vi.mock('@/hooks/useAsyncData', () => ({
  useAsyncData: () => ({ data: null, loading: false, error: null }),
}));

import { render, screen, fireEvent } from '@testing-library/react';
import SeasonSelector from './SeasonSelector';

describe('SeasonSelector', () => {
  it('renders a select element', () => {
    render(<SeasonSelector value="overall" onChange={vi.fn()} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('calls onChange when selection changes', () => {
    const onChange = vi.fn();
    render(<SeasonSelector value="overall" onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'overall' } });
    expect(onChange).toHaveBeenCalled();
  });

  it('displays current value as fallback when seasons not loaded', () => {
    render(<SeasonSelector value="overall" onChange={vi.fn()} />);
    expect(screen.getByText('Overall')).toBeInTheDocument();
  });
});
