import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ScoreboardPage from './ScoreboardPage';

describe('ScoreboardPage', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <ScoreboardPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Scoreboard')).toBeInTheDocument();
  });
});
