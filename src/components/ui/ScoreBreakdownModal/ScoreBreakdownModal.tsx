import React, { useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getTournamentTypeLabel } from '@shared/types/tournament.types';
import type { TournamentScore } from '@shared/types';
import './ScoreBreakdownModal.css';

interface ScoreBreakdownModalProps {
  golferName: string;
  isCaptain: boolean;
  weekScores: TournamentScore[];
  weekLabel: string;
  weekPoints: number;
  onClose: () => void;
}

function formatPosition(position: number | null): string {
  if (position === null) return '—';

  const lastTwoDigits = Math.abs(position) % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
    return `${position}th`;
  }

  const lastDigit = Math.abs(position) % 10;
  if (lastDigit === 1) return `${position}st`;
  if (lastDigit === 2) return `${position}nd`;
  if (lastDigit === 3) return `${position}rd`;
  return `${position}th`;
}

function formatRawScore(rawScore: number | null, scoringFormat: string): string {
  if (rawScore === null) return '—';
  if (scoringFormat === 'medal') {
    if (rawScore === 0) return 'Level par';
    return rawScore > 0 ? `+${rawScore}` : `${rawScore}`;
  }
  return `${rawScore} pts`;
}

const ScoreBreakdownModal: React.FC<ScoreBreakdownModalProps> = ({
  golferName,
  isCaptain,
  weekScores,
  weekLabel,
  weekPoints,
  onClose,
}) => {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  const participated = weekScores.filter((s) => s.participated);
  const didNotPlay = weekScores.filter((s) => !s.participated);

  return (
    <div className="score-breakdown-overlay" onClick={onClose}>
      <div className="score-breakdown-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="breakdown-header-info">
            <h2>📊 Score Breakdown</h2>
            <p className="breakdown-golfer-name">
              {golferName}
              {isCaptain && <span className="captain-badge">👑 Captain</span>}
            </p>
            <p className="breakdown-week-label">{weekLabel}</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {weekScores.length === 0 ? (
            <div className="no-scores-state">
              <p>No tournaments this gameweek.</p>
            </div>
          ) : (
            <>
              {/* Tournament cards for participated events */}
              {participated.map((score) => {
                const preMultiplier = score.basePoints + score.bonusPoints;
                const afterTournamentMultiplier = preMultiplier * score.multiplier;
                const afterCaptain = isCaptain
                  ? afterTournamentMultiplier * 2
                  : afterTournamentMultiplier;

                return (
                  <div key={score.tournamentId} className="tournament-card">
                    <div className="tournament-card-header">
                      <span className="tournament-icon">⛳</span>
                      <div className="tournament-title-block">
                        <span className="tournament-name">{score.tournamentName}</span>
                        <span className="tournament-meta">
                          {getTournamentTypeLabel(score.tournamentType)}
                          {score.multiplier > 1 && ` · ${score.multiplier}× multiplier`}
                        </span>
                      </div>
                    </div>

                    <div className="score-rows">
                      {/* Position */}
                      <div className="score-row">
                        <span className="score-row-label">Position</span>
                        <span className="score-row-value">{formatPosition(score.position)}</span>
                        <span className="score-row-points">
                          {score.basePoints > 0 ? `+${score.basePoints}` : '0'} pts
                        </span>
                      </div>

                      {/* Raw Score / Bonus */}
                      <div className="score-row">
                        <span className="score-row-label">
                          {score.scoringFormat === 'stableford' ? 'Stableford' : 'Nett Score'}
                        </span>
                        <span className="score-row-value">
                          {formatRawScore(score.rawScore, score.scoringFormat)}
                        </span>
                        <span
                          className={`score-row-points ${score.bonusPoints > 0 ? 'bonus-earned' : ''}`}
                        >
                          {score.bonusPoints > 0 ? `+${score.bonusPoints}` : '0'} bonus
                        </span>
                      </div>

                      {/* Subtotal before multiplier */}
                      <div className="score-row subtotal-row">
                        <span className="score-row-label">Subtotal</span>
                        <span className="score-row-value">
                          ({score.basePoints} + {score.bonusPoints})
                        </span>
                        <span className="score-row-points">{preMultiplier} pts</span>
                      </div>

                      {/* Tournament multiplier (show only if > 1) */}
                      {score.multiplier > 1 && (
                        <div className="score-row multiplier-row">
                          <span className="score-row-label">
                            × {score.multiplier} ({getTournamentTypeLabel(score.tournamentType)})
                          </span>
                          <span className="score-row-value"></span>
                          <span className="score-row-points">{afterTournamentMultiplier} pts</span>
                        </div>
                      )}

                      {/* Captain multiplier (show only if captain) */}
                      {isCaptain && (
                        <div className="score-row captain-row">
                          <span className="score-row-label">× 2 (Captain) 👑</span>
                          <span className="score-row-value"></span>
                          <span className="score-row-points captain-points">
                            {afterCaptain} pts
                          </span>
                        </div>
                      )}

                      {/* Final for this tournament */}
                      <div className="score-row tournament-total-row">
                        <span className="score-row-label">Tournament Total</span>
                        <span className="score-row-value"></span>
                        <span className="score-row-points total-points">{afterCaptain} pts</span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Did not play events */}
              {didNotPlay.length > 0 && (
                <div className="did-not-play-section">
                  <h3 className="dnp-heading">Did Not Play</h3>
                  {didNotPlay.map((score) => (
                    <div key={score.tournamentId} className="dnp-item">
                      <span className="dnp-icon">🚫</span>
                      <span className="dnp-tournament">{score.tournamentName}</span>
                      <span className="dnp-points">0 pts</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="breakdown-footer">
          <div className="grand-total">
            <span className="grand-total-label">
              Gameweek Total
              {isCaptain && <span className="captain-indicator"> 👑</span>}
            </span>
            <span className="grand-total-value">{weekPoints} pts</span>
          </div>
          <Link to="/scoring" className="scoring-rules-link" onClick={onClose}>
            ℹ️ View full scoring rules →
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ScoreBreakdownModal;
