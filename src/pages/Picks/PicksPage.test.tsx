import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PicksPage from './PicksPage';

describe('PicksPage', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <PicksPage />
      </MemoryRouter>
    );
    expect(screen.getByText('My Picks')).toBeInTheDocument();
  });
});
