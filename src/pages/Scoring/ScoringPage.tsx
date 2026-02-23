import React from 'react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import './ScoringPage.css';

const ScoringPage: React.FC = () => {
  useDocumentTitle('How Scoring Works');

  return (
    <div className="scoring-page">
      {/* Simple nav */}
      <nav className="scoring-nav">
        <Link to="/" className="scoring-nav-brand">
          <img src="/bearwood_lakes_logo.png" alt="Bearwood Lakes" width="40" height="40" />
          <span>Bearwood Lakes Fantasy</span>
        </Link>
        <Link to="/" className="scoring-back-link">
          ← Back to Home
        </Link>
      </nav>

      <div className="scoring-container">
        <div className="scoring-header">
          <h1>⛳ How Scoring Works</h1>
          <p>
            Everything you need to know about the Bearwood Lakes Fantasy Golf League scoring system.
          </p>
        </div>

        {/* Section 1: Event Types */}
        <section className="scoring-section">
          <h2>🏆 Event Types</h2>
          <p>
            Tournaments are categorised into three types, each with a different points multiplier:
          </p>
          <div className="event-types-grid">
            <div className="event-card regular">
              <div className="event-multiplier">1×</div>
              <h3>Regular Events</h3>
              <p className="event-example">Weekend Rollups</p>
              <p className="event-desc">
                Standard scoring. Points are calculated at face value.
              </p>
            </div>
            <div className="event-card elevated">
              <div className="event-multiplier">2×</div>
              <h3>Elevated Events</h3>
              <p className="event-example">Sunday Medals, Black Swan Events</p>
              <p className="event-desc">
                Double points! All points earned are multiplied by 2.
              </p>
            </div>
            <div className="event-card signature">
              <div className="event-multiplier">3×</div>
              <h3>Signature Events</h3>
              <p className="event-example">Club Champs, Presidents Cup, Founders Cup</p>
              <p className="event-desc">
                Triple points! The biggest events of the season.
              </p>
            </div>
          </div>
        </section>

        {/* Section 2: Points */}
        <section className="scoring-section">
          <h2>📊 Points Breakdown</h2>
          <div className="points-grid">
            <div className="points-group">
              <h3>Position Points</h3>
              <p className="points-subtitle">Awarded based on finishing position</p>
              <div className="points-table">
                <div className="points-row gold">
                  <span className="position">🥇 1st Place</span>
                  <span className="points-value">10 points</span>
                </div>
                <div className="points-row silver">
                  <span className="position">🥈 2nd Place</span>
                  <span className="points-value">7 points</span>
                </div>
                <div className="points-row bronze">
                  <span className="position">🥉 3rd Place</span>
                  <span className="points-value">5 points</span>
                </div>
                <div className="points-row">
                  <span className="position">4th and below</span>
                  <span className="points-value">0 points</span>
                </div>
              </div>
            </div>
            <div className="points-group">
              <h3>Bonus Points</h3>
              <p className="points-subtitle">Awarded for high stableford scores</p>
              <div className="points-table">
                <div className="points-row highlight">
                  <span className="position">36+ stableford points</span>
                  <span className="points-value">+3 bonus</span>
                </div>
                <div className="points-row">
                  <span className="position">32-35 stableford points</span>
                  <span className="points-value">+1 bonus</span>
                </div>
                <div className="points-row">
                  <span className="position">Below 32 points</span>
                  <span className="points-value">+0 bonus</span>
                </div>
              </div>
            </div>
          </div>
          <div className="formula-box">
            <strong>Final Score</strong> = (Position Points + Bonus Points) × Event Multiplier
          </div>
        </section>

        {/* Section 3: Captain */}
        <section className="scoring-section">
          <h2>👑 Captain</h2>
          <div className="captain-card">
            <div className="captain-icon">2×</div>
            <div className="captain-info">
              <h3>Choose Your Captain Wisely</h3>
              <p>
                Pick one golfer from your team as captain. Your captain's score is{' '}
                <strong>doubled</strong> every gameweek.
              </p>
              <p className="captain-tip">
                💡 Tip: Choose your most consistent performer — someone who plays regularly and
                scores well.
              </p>
            </div>
          </div>
        </section>

        {/* Section 4: Gameweeks */}
        <section className="scoring-section">
          <h2>📅 Gameweeks</h2>
          <div className="gameweek-info">
            <div className="gameweek-item">
              <span className="gameweek-icon">📆</span>
              <div>
                <h3>52 Gameweeks Per Season</h3>
                <p>The season runs from April to March, split into 52 weekly periods.</p>
              </div>
            </div>
            <div className="gameweek-item">
              <span className="gameweek-icon">⏰</span>
              <div>
                <h3>Saturday 8am Start</h3>
                <p>Each gameweek begins on Saturday at 8am and runs until the following Friday.</p>
              </div>
            </div>
            <div className="gameweek-item">
              <span className="gameweek-icon">🏌️</span>
              <div>
                <h3>Multiple Tournaments</h3>
                <p>
                  There can be several tournaments in one gameweek. All points from every tournament
                  are combined into your gameweek total.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 5: Worked Example */}
        <section className="scoring-section">
          <h2>📝 Worked Example</h2>
          <div className="example-box">
            <p className="example-scenario">
              <strong>Matthew Green</strong> plays in a <strong>Sunday Medal</strong> (Elevated, 2×
              multiplier). He finishes <strong>1st</strong> with{' '}
              <strong>37 stableford points</strong>.
            </p>
            <div className="example-calc">
              <div className="calc-row">
                <span>Position Points (1st)</span>
                <span className="calc-value">10</span>
              </div>
              <div className="calc-row">
                <span>Bonus Points (37 ≥ 36)</span>
                <span className="calc-value">+3</span>
              </div>
              <div className="calc-row calc-subtotal">
                <span>Subtotal</span>
                <span className="calc-value">13</span>
              </div>
              <div className="calc-row">
                <span>Event Multiplier (Elevated)</span>
                <span className="calc-value">×2</span>
              </div>
              <div className="calc-row calc-total">
                <span>Total Points</span>
                <span className="calc-value">26 pts</span>
              </div>
              <div className="calc-row calc-captain">
                <span>If Captain (×2)</span>
                <span className="calc-value">52 pts 🔥</span>
              </div>
            </div>
          </div>
        </section>

        {/* Section 6: Team */}
        <section className="scoring-section">
          <h2>👥 Your Team</h2>
          <div className="team-rules">
            <div className="rule-item">
              <span className="rule-icon">💰</span>
              <p>
                <strong>£50M Budget</strong> — Spend wisely across your 6 golfers.
              </p>
            </div>
            <div className="rule-item">
              <span className="rule-icon">⛳</span>
              <p>
                <strong>6 Golfers</strong> — Pick exactly 6 golfers for your squad.
              </p>
            </div>
            <div className="rule-item">
              <span className="rule-icon">👑</span>
              <p>
                <strong>1 Captain</strong> — One golfer gets double points every week.
              </p>
            </div>
            <div className="rule-item">
              <span className="rule-icon">🔄</span>
              <p>
                <strong>Transfer Windows</strong> — Swap golfers during open transfer periods.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <div className="scoring-cta">
          <h2>Ready to Play?</h2>
          <p>Build your team and start competing!</p>
          <div className="scoring-cta-buttons">
            <Link to="/register" className="btn btn-primary btn-lg">
              Join the League
            </Link>
            <Link to="/golfers" className="btn btn-secondary btn-lg">
              Browse Golfers
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScoringPage;
