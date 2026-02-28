import { render, screen, fireEvent } from '@testing-library/react';
import { Select } from './Select';

const options = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
];

describe('Select', () => {
  it('renders options', () => {
    render(<Select name="test" options={options} value="a" onChange={vi.fn()} />);
    expect(screen.getByText('Option A')).toBeInTheDocument();
    expect(screen.getByText('Option B')).toBeInTheDocument();
  });

  it('renders placeholder option', () => {
    render(<Select name="test" options={options} value="" onChange={vi.fn()} placeholder="Choose..." />);
    expect(screen.getByText('Choose...')).toBeInTheDocument();
  });

  it('calls onChange on selection', () => {
    const onChange = vi.fn();
    render(<Select name="test" options={options} value="a" onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'b' } });
    expect(onChange).toHaveBeenCalled();
  });

  it('can be disabled', () => {
    render(<Select name="test" options={options} value="a" onChange={vi.fn()} disabled />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('displays error message', () => {
    render(<Select name="test" options={options} value="" onChange={vi.fn()} error="Required" />);
    expect(screen.getByText('Required')).toBeInTheDocument();
  });
});
