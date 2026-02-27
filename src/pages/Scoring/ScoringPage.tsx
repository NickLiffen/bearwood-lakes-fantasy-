import React from 'react';
import PageLayout from '../../components/layout/PageLayout';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import './ScoringPage.css';

const ScoringPage: React.FC = () => {
  useDocumentTitle('Rules');

  return (
    <PageLayout activeNav="scoring">
      <div className="scoring-container">
        <div className="scoring-header">
          <h1>⛳ Rules & Scoring</h1>
          <p>
            Everything you need to know about the Bearwood Lakes Fantasy Golf League scoring system.
          </p>
        </div>

        {/* Section 1: Event Types */}
        <section className="scoring-section">
          <h2>🏆 Event Types</h2>
          <p>
            Tournaments are categorised into six types, each with a different points multiplier:
          </p>
          <div className="event-types-grid">
            <div className="event-card regular">
              <div className="event-multiplier">1×</div>
              <h3>Rollup Stableford</h3>
              <p className="event-example">Saturday & Sunday Rollups</p>
              <p className="event-desc">
                Standard stableford scoring. Points are calculated at face value.
              </p>
            </div>
            <div className="event-card regular">
              <div className="event-multiplier">1×</div>
              <h3>Weekday Medal</h3>
              <p className="event-example">Wednesday Medals</p>
              <p className="event-desc">
                Medal format at 1× multiplier. Nett score determines bonus points.
              </p>
            </div>
            <div className="event-card elevated">
              <div className="event-multiplier">2×</div>
              <h3>Weekend Medal</h3>
              <p className="event-example">Saturday & Sunday Medals</p>
              <p className="event-desc">
                Double points! Medal format with all points multiplied by 2.
              </p>
            </div>
            <div className="event-card signature">
              <div className="event-multiplier">3×</div>
              <h3>Presidents Cup</h3>
              <p className="event-example">Annual Presidents Cup</p>
              <p className="event-desc">
                Triple points! One of the biggest events of the season.
              </p>
            </div>
            <div className="event-card signature">
              <div className="event-multiplier">4×</div>
              <h3>Founders</h3>
              <p className="event-example">Founders Cup (Multi-Day)</p>
              <p className="event-desc">
                Quadruple points! A multi-day event with doubled bonus thresholds.
              </p>
            </div>
            <div className="event-card signature">
              <div className="event-multiplier">5×</div>
              <h3>Club Champs Nett</h3>
              <p className="event-example">Club Championships (Multi-Day)</p>
              <p className="event-desc">
                5× points! The pinnacle event of the season, played over multiple days.
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
              <p className="points-subtitle">Awarded based on scoring format and event duration</p>
              <div className="points-table">
                <div className="points-row highlight">
                  <span className="position" style={{ fontWeight: 600 }}>Single-Day Stableford</span>
                  <span className="points-value"></span>
                </div>
                <div className="points-row">
                  <span className="position">36+ stableford points</span>
                  <span className="points-value">+3 bonus</span>
                </div>
                <div className="points-row">
                  <span className="position">32-35 stableford points <em style={{ fontSize: '0.75em', color: '#9ca3af' }}>(aka a Sanjeev)</em></span>
                  <span className="points-value">+1 bonus</span>
                </div>
                <div className="points-row highlight">
                  <span className="position" style={{ fontWeight: 600 }}>Multi-Day Stableford</span>
                  <span className="points-value"></span>
                </div>
                <div className="points-row">
                  <span className="position">72+ stableford points</span>
                  <span className="points-value">+3 bonus</span>
                </div>
                <div className="points-row">
                  <span className="position">64-71 stableford points</span>
                  <span className="points-value">+1 bonus</span>
                </div>
                <div className="points-row highlight">
                  <span className="position" style={{ fontWeight: 600 }}>Single-Day Medal</span>
                  <span className="points-value"></span>
                </div>
                <div className="points-row">
                  <span className="position">Nett par or better (≤0)</span>
                  <span className="points-value">+3 bonus</span>
                </div>
                <div className="points-row">
                  <span className="position">Nett +1 to +4</span>
                  <span className="points-value">+1 bonus</span>
                </div>
                <div className="points-row highlight">
                  <span className="position" style={{ fontWeight: 600 }}>Multi-Day Medal</span>
                  <span className="points-value"></span>
                </div>
                <div className="points-row">
                  <span className="position">Nett par or better (≤0)</span>
                  <span className="points-value">+3 bonus</span>
                </div>
                <div className="points-row">
                  <span className="position">Nett +1 to +8</span>
                  <span className="points-value">+1 bonus</span>
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
            <div className="gameweek-item">
              <span className="gameweek-icon">📅</span>
              <div>
                <h3>Multi-Day Events</h3>
                <p>
                  Some events (Founders, Club Champs Nett) span multiple days. These use doubled
                  bonus point thresholds to reflect the combined scoring across rounds.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 5: Worked Examples */}
        <section className="scoring-section">
          <h2>📝 Worked Examples</h2>
          <div className="examples-grid">
            <div className="example-box">
              <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', color: 'var(--primary-green)' }}>⛳ Medal Example</h3>
              <p className="example-scenario">
                <strong>Matthew Green</strong> plays in a <strong>Weekend Medal</strong> (2×
                multiplier). He finishes <strong>1st</strong> with a nett score of{' '}
                <strong>-4</strong> (4 under par).
              </p>
              <div className="example-calc">
                <div className="calc-row">
                  <span>Position Points (1st)</span>
                  <span className="calc-value">10</span>
                </div>
                <div className="calc-row">
                  <span>Bonus Points (nett -4 ≤ 0)</span>
                  <span className="calc-value">+3</span>
                </div>
                <div className="calc-row calc-subtotal">
                  <span>Subtotal</span>
                  <span className="calc-value">13</span>
                </div>
                <div className="calc-row">
                  <span>Event Multiplier (Weekend Medal)</span>
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

            <div className="example-box">
              <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', color: 'var(--primary-green)' }}>🏌️ Stableford Example</h3>
              <p className="example-scenario">
                <strong>Nick Liffen</strong> plays in a <strong>Rollup Stableford</strong> (1×
                multiplier). He finishes <strong>2nd</strong> with{' '}
                <strong>39 stableford points</strong>.
              </p>
              <div className="example-calc">
                <div className="calc-row">
                  <span>Position Points (2nd)</span>
                  <span className="calc-value">7</span>
                </div>
                <div className="calc-row">
                  <span>Bonus Points (39 ≥ 36)</span>
                  <span className="calc-value">+3</span>
                </div>
                <div className="calc-row calc-subtotal">
                  <span>Subtotal</span>
                  <span className="calc-value">10</span>
                </div>
                <div className="calc-row">
                  <span>Event Multiplier (Rollup)</span>
                  <span className="calc-value">×1</span>
                </div>
                <div className="calc-row calc-total">
                  <span>Total Points</span>
                  <span className="calc-value">10 pts</span>
                </div>
                <div className="calc-row calc-captain">
                  <span>If Captain (×2)</span>
                  <span className="calc-value">20 pts 🔥</span>
                </div>
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
                <strong>Transfers</strong> — During pre-season, you have <strong>unlimited transfers</strong> to build your perfect squad. Once the season starts, you get <strong>1 transfer per week</strong>. Transfers must be made before <strong>8am on Saturday</strong> for them to take effect that gameweek. Any transfers made after 8am Saturday will apply to the following week's score.
              </p>
            </div>
          </div>
        </section>

      </div>
    </PageLayout>
  );
};

export default ScoringPage;
