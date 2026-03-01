import { render, screen } from '@testing-library/react';
import TeamSection from './TeamSection';

describe('TeamSection', () => {
  it('renders first name and team value', () => {
    render(
      <TeamSection firstName="Nick" teamValue={35000000}>
        <div>Team content</div>
      </TeamSection>
    );
    expect(screen.getByText(/Nick's Team/)).toBeInTheDocument();
    expect(screen.getByText('£35.0M team value')).toBeInTheDocument();
    expect(screen.getByText('Team content')).toBeInTheDocument();
  });
});
