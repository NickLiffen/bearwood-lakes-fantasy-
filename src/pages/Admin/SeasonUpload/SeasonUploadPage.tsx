// Admin: Upload prior season results via CSV

import React, { useState } from 'react';
import AdminLayout from '../../../components/AdminLayout/AdminLayout';
import { useApiClient } from '../../../hooks/useApiClient';
import { useDocumentTitle } from '../../../hooks/useDocumentTitle';

interface UploadResult {
  golfersCreated: number;
  golfersUpdated: number;
  tournamentsCreated: number;
  scoresEntered: number;
  summary: string;
}

interface CsvPreview {
  totalRows: number;
  uniqueDates: number;
  uniquePlayers: number;
}

const SeasonUploadPage: React.FC = () => {
  const { post, isAuthReady } = useApiClient();
  useDocumentTitle('Admin: Season Upload');
  const [csvText, setCsvText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<number>(0);
  const [totalTournaments, setTotalTournaments] = useState<number>(0);
  const [currentTournament, setCurrentTournament] = useState<string>('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setResults(null);
    setError('');
    setProgress(0);
    setTotalTournaments(0);
    setCurrentTournament('');

    if (!file) {
      setCsvText('');
      setFileName('');
      setPreview(null);
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvText(text);

      // Parse CSV for preview stats
      const lines = text.split('\n').filter((line) => line.trim() !== '');
      const dataRows = lines.slice(1); // skip header
      const dates = new Set<string>();
      const players = new Set<string>();

      dataRows.forEach((row) => {
        const cols = row.split(',');
        if (cols.length >= 4) {
          dates.add(cols[0].trim());
          players.add(cols[2].trim());
        }
      });

      setPreview({
        totalRows: dataRows.length,
        uniqueDates: dates.size,
        uniquePlayers: players.size,
      });
    };
    reader.readAsText(file);
  };

  const handleUpload = async () => {
    if (!csvText || !isAuthReady) return;

    setLoading(true);
    setError('');
    setResults(null);
    setProgress(0);
    setTotalTournaments(0);
    setCurrentTournament('');

    try {
      // Parse CSV client-side and group rows by date
      const lines = csvText.split('\n').filter((line) => line.trim() !== '');
      const headerLine = lines[0];
      const dataRows = lines.slice(1);

      const dateGroups = new Map<string, string[]>();
      for (const row of dataRows) {
        const cols = row.split(',');
        const dateStr = cols[0]?.trim().replace(/"/g, '') ?? '';
        if (!dateStr) continue;
        if (!dateGroups.has(dateStr)) {
          dateGroups.set(dateStr, []);
        }
        dateGroups.get(dateStr)!.push(row);
      }

      const groupEntries = Array.from(dateGroups.entries());
      setTotalTournaments(groupEntries.length);

      const aggregated: UploadResult = {
        golfersCreated: 0,
        golfersUpdated: 0,
        tournamentsCreated: 0,
        scoresEntered: 0,
        summary: '',
      };

      for (let i = 0; i < groupEntries.length; i++) {
        const [dateStr, rows] = groupEntries[i];
        setCurrentTournament(`${dateStr} Tournament`);

        const miniCsv = headerLine + '\n' + rows.join('\n');
        const result = await post<UploadResult>('season-upload', { csvText: miniCsv });

        if (result.cancelled) return;

        if (result.success && result.data) {
          aggregated.golfersCreated += result.data.golfersCreated;
          aggregated.golfersUpdated += result.data.golfersUpdated;
          aggregated.tournamentsCreated += result.data.tournamentsCreated;
          aggregated.scoresEntered += result.data.scoresEntered;
        } else {
          setLoading(false);
          setProgress(0);
          setTotalTournaments(0);
          setCurrentTournament('');
          setError(result.error || `Upload failed for tournament: ${dateStr}`);
          return;
        }

        setProgress(i + 1);
      }

      aggregated.summary =
        `Created ${aggregated.golfersCreated} golfers, updated ${aggregated.golfersUpdated}, ` +
        `created ${aggregated.tournamentsCreated} tournaments, entered ${aggregated.scoresEntered} scores.`;
      setResults(aggregated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminLayout title="Upload Prior Season">
      {/* File Input */}
      <div className="admin-card" style={{ marginBottom: '1.5rem' }}>
        <div className="admin-card-header">
          <h2>Season CSV Upload</h2>
        </div>
        <div className="admin-card-body">
          <div className="form-group">
            <label htmlFor="csv-file">CSV File</label>
            <input
              id="csv-file"
              type="file"
              accept=".csv"
              className="form-input"
              onChange={handleFileChange}
            />
            <p style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              Expected columns: Date, Position, Player, Stableford Points
            </p>
            <p style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              Tournaments are automatically matched to seasons based on their date.
            </p>
          </div>
        </div>
      </div>

      {/* Preview Section */}
      {preview && (
        <div className="admin-card" style={{ marginBottom: '1.5rem' }}>
          <div className="admin-card-header">
            <h2>Preview: {fileName}</h2>
          </div>
          <div className="admin-card-body">
            <div className="stats-row">
              <div className="stat-box">
                <div className="stat-box-icon">📄</div>
                <div className="stat-box-value">{preview.totalRows}</div>
                <div className="stat-box-label">Data Rows</div>
              </div>
              <div className="stat-box">
                <div className="stat-box-icon">🏆</div>
                <div className="stat-box-value">{preview.uniqueDates}</div>
                <div className="stat-box-label">Tournaments</div>
              </div>
              <div className="stat-box">
                <div className="stat-box-icon">🏌️</div>
                <div className="stat-box-value">{preview.uniquePlayers}</div>
                <div className="stat-box-label">Unique Golfers</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Button */}
      <div style={{ marginBottom: '1.5rem' }}>
        <button
          className="btn btn-primary"
          onClick={handleUpload}
          disabled={!csvText || loading || !isAuthReady}
        >
          {loading ? 'Uploading...' : 'Upload Season Data'}
        </button>
      </div>

      {/* Progress Bar */}
      {loading && totalTournaments > 0 && (
        <div className="admin-card" style={{ marginBottom: '1.5rem' }}>
          <div className="admin-card-header">
            <h2>Upload Progress</h2>
          </div>
          <div className="admin-card-body">
            <p style={{ marginBottom: '0.5rem', color: '#374151' }}>
              Processing tournament {progress + 1} of {totalTournaments}: {currentTournament}
            </p>
            <div
              style={{
                width: '100%',
                height: '24px',
                backgroundColor: '#e5e7eb',
                borderRadius: '12px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${(progress / totalTournaments) * 100}%`,
                  height: '100%',
                  backgroundColor: '#16a34a',
                  borderRadius: '12px',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <p style={{ marginTop: '0.5rem', color: '#6b7280', fontSize: '0.85rem' }}>
              {progress} of {totalTournaments} tournaments processed
            </p>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div
          className="admin-card"
          style={{
            marginBottom: '1.5rem',
            border: '1px solid #fca5a5',
            background: '#fef2f2',
          }}
        >
          <div className="admin-card-body">
            <p style={{ color: '#dc2626', margin: 0 }}>❌ {error}</p>
          </div>
        </div>
      )}

      {/* Results Summary */}
      {results && (
        <div className="admin-card" style={{ marginBottom: '1.5rem' }}>
          <div className="admin-card-header">
            <h2>Upload Results</h2>
          </div>
          <div className="admin-card-body">
            <div className="stats-row">
              <div className="stat-box">
                <div className="stat-box-icon">🆕</div>
                <div className="stat-box-value">{results.golfersCreated}</div>
                <div className="stat-box-label">Golfers Created</div>
              </div>
              <div className="stat-box">
                <div className="stat-box-icon">✏️</div>
                <div className="stat-box-value">{results.golfersUpdated}</div>
                <div className="stat-box-label">Golfers Updated</div>
              </div>
              <div className="stat-box">
                <div className="stat-box-icon">🏆</div>
                <div className="stat-box-value">{results.tournamentsCreated}</div>
                <div className="stat-box-label">Tournaments Created</div>
              </div>
              <div className="stat-box">
                <div className="stat-box-icon">📝</div>
                <div className="stat-box-value">{results.scoresEntered}</div>
                <div className="stat-box-label">Scores Entered</div>
              </div>
            </div>
            {results.summary && (
              <p style={{ marginTop: '1rem', color: '#374151' }}>{results.summary}</p>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default SeasonUploadPage;
