// Admin: Upload tournament results via PDF (ECG leaderboard format)

import React, { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../../../components/AdminLayout/AdminLayout';
import { useApiClient } from '../../../hooks/useApiClient';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';
import { parsePdfTournament, type ParsedGolfer } from './utils/pdfParser';
import {
  TOURNAMENT_TYPE_CONFIG,
  type TournamentType,
  type ScoringFormat,
} from '../../../../shared/types/tournament.types';

interface UploadResult {
  tournamentCreated: boolean;
  tournamentName: string;
  golfersCreated: number;
  golfersMatched: number;
  newGolferNames: string[];
  scoresEntered: number;
  summary: string;
}

interface ExistingGolfer {
  id: string;
  firstName: string;
  lastName: string;
}

interface EditableGolfer extends ParsedGolfer {
  isNew: boolean;
}

type Step = 'upload' | 'review' | 'results';

const TournamentUploadPage: React.FC = () => {
  const { post, get, isAuthReady } = useApiClient();
  useDocumentTitle('Admin: Tournament Upload');

  // Step management
  const [step, setStep] = useState<Step>('upload');

  // Upload state
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');

  // Review state
  const [tournamentName, setTournamentName] = useState('');
  const [tournamentDate, setTournamentDate] = useState('');
  const [tournamentType, setTournamentType] = useState<TournamentType>('rollup_stableford');
  const [scoringFormat, setScoringFormat] = useState<ScoringFormat>('stableford');
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [golfers, setGolfers] = useState<EditableGolfer[]>([]);
  const [existingGolfers, setExistingGolfers] = useState<ExistingGolfer[]>([]);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [results, setResults] = useState<UploadResult | null>(null);
  const [golfersLoaded, setGolfersLoaded] = useState(false);

  // Fetch existing golfers for matching
  const fetchExistingGolfers = useCallback(async () => {
    if (!isAuthReady) return;
    const response = await get<ExistingGolfer[]>('golfers-list');
    if (response.success && response.data) {
      setExistingGolfers(response.data);
    }
    setGolfersLoaded(true);
  }, [get, isAuthReady]);

  useEffect(() => {
    fetchExistingGolfers();
  }, [fetchExistingGolfers]);

  // Check if a golfer exists in the system (case-insensitive)
  const isGolferNew = useCallback(
    (firstName: string, lastName: string): boolean => {
      return !existingGolfers.some(
        (g) =>
          g.firstName.toLowerCase() === firstName.toLowerCase() &&
          g.lastName.toLowerCase() === lastName.toLowerCase()
      );
    },
    [existingGolfers]
  );

  // Handle PDF file selection and parsing
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setParseError('');
    setResults(null);
    setSubmitError('');

    if (!file) {
      setFileName('');
      return;
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setParseError('Please select a PDF file.');
      return;
    }

    setFileName(file.name);
    setParsing(true);

    // Wait for golfer list to load if not yet ready
    if (!golfersLoaded) {
      await fetchExistingGolfers();
    }

    try {
      const parsed = await parsePdfTournament(file);

      if (parsed.golfers.length === 0) {
        setParseError(
          'No golfer data found in the PDF. Please check the file is an ECG leaderboard.'
        );
        setParsing(false);
        return;
      }

      // Populate review form
      setTournamentName(parsed.name || file.name.replace('.pdf', ''));
      setTournamentDate(parsed.date);
      setScoringFormat(parsed.scoringFormat);
      setTournamentType('rollup_stableford');
      setIsMultiDay(false);

      // Mark golfers as new or existing
      const editableGolfers: EditableGolfer[] = parsed.golfers.map((g) => ({
        ...g,
        isNew: isGolferNew(g.firstName, g.lastName),
      }));
      setGolfers(editableGolfers);

      setStep('review');
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : 'Failed to parse PDF. Is this an ECG leaderboard?'
      );
    } finally {
      setParsing(false);
    }
  };

  // Handle tournament type change — update scoring format based on config
  const handleTypeChange = (newType: TournamentType) => {
    setTournamentType(newType);
    const config = TOURNAMENT_TYPE_CONFIG[newType];
    if (config.forcedScoringFormat) {
      setScoringFormat(config.forcedScoringFormat);
    } else {
      setScoringFormat(config.defaultScoringFormat);
    }
    setIsMultiDay(config.defaultMultiDay);
  };

  // Update a golfer field
  const updateGolfer = (index: number, field: keyof EditableGolfer, value: string | number) => {
    setGolfers((prev) => {
      const updated = [...prev];
      const golfer = { ...updated[index] };

      if (field === 'firstName' || field === 'lastName') {
        (golfer[field] as string) = value as string;
        golfer.isNew = isGolferNew(
          field === 'firstName' ? (value as string) : golfer.firstName,
          field === 'lastName' ? (value as string) : golfer.lastName
        );
      } else if (field === 'position' || field === 'rawScore') {
        (golfer[field] as number) = value as number;
      }

      updated[index] = golfer;
      return updated;
    });
  };

  // Remove a golfer from the list
  const removeGolfer = (index: number) => {
    setGolfers((prev) => prev.filter((_, i) => i !== index));
  };

  // Submit the confirmed data
  const handleSubmit = async () => {
    if (!isAuthReady || golfers.length === 0) return;

    setSubmitting(true);
    setSubmitError('');

    try {
      const payload = {
        name: tournamentName,
        date: tournamentDate,
        tournamentType,
        scoringFormat,
        isMultiDay,
        golfers: golfers.map((g) => ({
          position: g.position,
          firstName: g.firstName,
          lastName: g.lastName,
          rawScore: g.rawScore,
        })),
      };

      const response = await post<UploadResult>('tournament-upload', payload);

      if (response.cancelled) return;

      if (response.success && response.data) {
        setResults(response.data);
        setStep('results');
      } else {
        setSubmitError(response.error || 'Failed to process tournament upload.');
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  // Reset to upload another PDF
  const handleReset = () => {
    setStep('upload');
    setFileName('');
    setParseError('');
    setTournamentName('');
    setTournamentDate('');
    setTournamentType('rollup_stableford');
    setScoringFormat('stableford');
    setIsMultiDay(false);
    setGolfers([]);
    setResults(null);
    setSubmitError('');

    // Reset the file input
    const fileInput = document.getElementById('pdf-file') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const newGolferCount = golfers.filter((g) => g.isNew).length;
  const typeConfig = TOURNAMENT_TYPE_CONFIG[tournamentType];

  return (
    <AdminLayout title="Tournament Upload">
      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="admin-card" style={{ marginBottom: '1.5rem' }}>
          <div className="admin-card-header">
            <h2>Upload Tournament PDF</h2>
          </div>
          <div className="admin-card-body">
            <div className="form-group">
              <label htmlFor="pdf-file">ECG Leaderboard PDF</label>
              <input
                id="pdf-file"
                type="file"
                accept=".pdf"
                className="form-input"
                onChange={handleFileChange}
                disabled={parsing}
              />
              <p style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                Upload an ECG tournament leaderboard PDF. The system will extract the tournament
                name, date, and all golfer scores automatically.
              </p>
            </div>
            {parsing && (
              <p style={{ color: '#2563eb', marginTop: '0.5rem' }}>⏳ Parsing PDF...</p>
            )}
          </div>
        </div>
      )}

      {/* Parse Error */}
      {parseError && (
        <div
          className="admin-card"
          style={{
            marginBottom: '1.5rem',
            border: '1px solid #fca5a5',
            background: '#fef2f2',
          }}
        >
          <div className="admin-card-body">
            <p style={{ color: '#dc2626', margin: 0 }}>❌ {parseError}</p>
          </div>
        </div>
      )}

      {/* Step 2: Review & Edit */}
      {step === 'review' && (
        <>
          {/* Tournament Info */}
          <div className="admin-card" style={{ marginBottom: '1.5rem' }}>
            <div className="admin-card-header">
              <h2>Tournament Details</h2>
              <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>
                Parsed from: {fileName}
              </span>
            </div>
            <div className="admin-card-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label htmlFor="tournament-name">Tournament Name</label>
                  <input
                    id="tournament-name"
                    type="text"
                    className="form-input"
                    value={tournamentName}
                    onChange={(e) => setTournamentName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="tournament-date">Date</label>
                  <input
                    id="tournament-date"
                    type="date"
                    className="form-input"
                    value={tournamentDate}
                    onChange={(e) => setTournamentDate(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="tournament-type">Tournament Type</label>
                  <select
                    id="tournament-type"
                    className="form-input"
                    value={tournamentType}
                    onChange={(e) => handleTypeChange(e.target.value as TournamentType)}
                  >
                    {Object.entries(TOURNAMENT_TYPE_CONFIG).map(([key, config]) => (
                      <option key={key} value={key}>
                        {config.label} ({config.multiplier}x)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="scoring-format">Scoring Format</label>
                  <select
                    id="scoring-format"
                    className="form-input"
                    value={scoringFormat}
                    disabled={!!typeConfig?.forcedScoringFormat}
                    onChange={(e) => setScoringFormat(e.target.value as ScoringFormat)}
                  >
                    <option value="stableford">Stableford</option>
                    <option value="medal">Medal</option>
                  </select>
                  {typeConfig?.forcedScoringFormat && (
                    <p style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                      Locked by tournament type
                    </p>
                  )}
                </div>
              </div>
              <div style={{ marginTop: '0.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={isMultiDay}
                    onChange={(e) => setIsMultiDay(e.target.checked)}
                  />
                  Multi-day tournament
                </label>
              </div>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="admin-card" style={{ marginBottom: '1.5rem' }}>
            <div className="admin-card-body">
              <div className="stats-row">
                <div className="stat-box">
                  <div className="stat-box-icon">🏌️</div>
                  <div className="stat-box-value">{golfers.length}</div>
                  <div className="stat-box-label">Total Golfers</div>
                </div>
                <div className="stat-box">
                  <div className="stat-box-icon">✅</div>
                  <div className="stat-box-value">{golfers.length - newGolferCount}</div>
                  <div className="stat-box-label">Existing</div>
                </div>
                <div className="stat-box">
                  <div className="stat-box-icon">🆕</div>
                  <div className="stat-box-value">{newGolferCount}</div>
                  <div className="stat-box-label">New Golfers</div>
                </div>
                <div className="stat-box">
                  <div className="stat-box-icon">✖️</div>
                  <div className="stat-box-value">{typeConfig?.multiplier ?? 1}x</div>
                  <div className="stat-box-label">Multiplier</div>
                </div>
              </div>
            </div>
          </div>

          {/* Golfer Table */}
          <div className="admin-card" style={{ marginBottom: '1.5rem' }}>
            <div className="admin-card-header">
              <h2>Golfer Scores</h2>
              {newGolferCount > 0 && (
                <span
                  style={{
                    background: '#fbbf24',
                    color: '#92400e',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '9999px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                  }}
                >
                  {newGolferCount} new golfer{newGolferCount !== 1 ? 's' : ''} will be created
                </span>
              )}
            </div>
            <div className="admin-card-body" style={{ overflowX: 'auto' }}>
              <table className="admin-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: '60px' }}>Pos</th>
                    <th>First Name</th>
                    <th>Last Name</th>
                    <th style={{ width: '80px' }}>Score</th>
                    <th style={{ width: '80px' }}>Status</th>
                    <th style={{ width: '50px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {golfers.map((golfer, index) => (
                    <tr
                      key={index}
                      style={{
                        backgroundColor: golfer.isNew ? '#fffbeb' : undefined,
                      }}
                    >
                      <td>
                        <input
                          type="number"
                          className="form-input"
                          value={golfer.position}
                          min={1}
                          style={{ width: '50px', padding: '0.25rem' }}
                          onChange={(e) =>
                            updateGolfer(index, 'position', parseInt(e.target.value, 10) || 1)
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="form-input"
                          value={golfer.firstName}
                          style={{ padding: '0.25rem' }}
                          onChange={(e) => updateGolfer(index, 'firstName', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="form-input"
                          value={golfer.lastName}
                          style={{ padding: '0.25rem' }}
                          onChange={(e) => updateGolfer(index, 'lastName', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="form-input"
                          value={golfer.rawScore}
                          style={{ width: '60px', padding: '0.25rem' }}
                          onChange={(e) => {
                            const { value } = e.target;
                            if (value === '') return;
                            const parsed = parseInt(value, 10);
                            if (!Number.isNaN(parsed)) {
                              updateGolfer(index, 'rawScore', parsed);
                            }
                          }}
                        />
                      </td>
                      <td>
                        {golfer.isNew ? (
                          <span
                            style={{
                              background: '#fbbf24',
                              color: '#92400e',
                              padding: '0.15rem 0.4rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                            }}
                          >
                            NEW
                          </span>
                        ) : (
                          <span
                            style={{
                              background: '#d1fae5',
                              color: '#065f46',
                              padding: '0.15rem 0.4rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                            }}
                          >
                            EXISTS
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          className="btn btn-danger"
                          style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}
                          onClick={() => removeGolfer(index)}
                          title="Remove golfer"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Submit Error */}
          {submitError && (
            <div
              className="admin-card"
              style={{
                marginBottom: '1.5rem',
                border: '1px solid #fca5a5',
                background: '#fef2f2',
              }}
            >
              <div className="admin-card-body">
                <p style={{ color: '#dc2626', margin: 0 }}>❌ {submitError}</p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
            <button className="btn btn-secondary" onClick={handleReset} disabled={submitting}>
              ← Back
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={submitting || golfers.length === 0 || !tournamentName || !tournamentDate}
            >
              {submitting ? 'Processing...' : `Confirm & Create Tournament (${golfers.length} golfers)`}
            </button>
          </div>
        </>
      )}

      {/* Step 3: Results */}
      {step === 'results' && results && (
        <>
          <div
            className="admin-card"
            style={{
              marginBottom: '1.5rem',
              border: '1px solid #86efac',
              background: '#f0fdf4',
            }}
          >
            <div className="admin-card-header">
              <h2>✅ Tournament Created Successfully</h2>
            </div>
            <div className="admin-card-body">
              <div className="stats-row">
                <div className="stat-box">
                  <div className="stat-box-icon">🏆</div>
                  <div className="stat-box-value">1</div>
                  <div className="stat-box-label">Tournament</div>
                </div>
                <div className="stat-box">
                  <div className="stat-box-icon">🆕</div>
                  <div className="stat-box-value">{results.golfersCreated}</div>
                  <div className="stat-box-label">Golfers Created</div>
                </div>
                <div className="stat-box">
                  <div className="stat-box-icon">✅</div>
                  <div className="stat-box-value">{results.golfersMatched}</div>
                  <div className="stat-box-label">Golfers Matched</div>
                </div>
                <div className="stat-box">
                  <div className="stat-box-icon">📝</div>
                  <div className="stat-box-value">{results.scoresEntered}</div>
                  <div className="stat-box-label">Scores Entered</div>
                </div>
              </div>

              {results.newGolferNames.length > 0 && (
                <div
                  style={{
                    marginTop: '1rem',
                    padding: '0.75rem',
                    background: '#fffbeb',
                    borderRadius: '8px',
                    border: '1px solid #fbbf24',
                  }}
                >
                  <p style={{ margin: 0, fontWeight: 600, color: '#92400e' }}>
                    🆕 New golfers created:
                  </p>
                  <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem', color: '#92400e' }}>
                    {results.newGolferNames.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                </div>
              )}

              <p style={{ marginTop: '1rem', color: '#374151' }}>{results.summary}</p>
            </div>
          </div>

          <button className="btn btn-primary" onClick={handleReset}>
            Upload Another Tournament
          </button>
        </>
      )}
    </AdminLayout>
  );
};

export default TournamentUploadPage;
