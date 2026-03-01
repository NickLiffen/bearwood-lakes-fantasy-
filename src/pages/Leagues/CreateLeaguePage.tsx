// Create League page — simple form with name and description

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import { useApiClient } from '../../hooks/useApiClient';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import type { League } from '@shared/types';

const CreateLeaguePage: React.FC = () => {
  const navigate = useNavigate();
  const { post } = useApiClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useDocumentTitle('Create League');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('League name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await post<League>('leagues-create', {
        name: name.trim(),
        description: description.trim(),
      });

      if (response.success && response.data) {
        navigate(`/leagues/${response.data.id}`);
      } else {
        setError(response.error || 'Failed to create league');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageLayout activeNav="leagues">
      <div className="leagues-content">
        <div className="leagues-container" style={{ maxWidth: '600px' }}>
          <h1>Create a League</h1>
          <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
            Create a private league and invite your friends to compete!
          </p>

          {error && (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                color: '#dc2626',
                fontSize: '0.9rem',
                marginBottom: '1rem',
              }}
            >
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label htmlFor="league-name" style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>
                League Name *
              </label>
              <input
                id="league-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., The Lads"
                maxLength={50}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '1rem',
                }}
              />
              <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>{name.length}/50</span>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label htmlFor="league-desc" style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>
                Description (optional)
              </label>
              <textarea
                id="league-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A short description of your league"
                maxLength={200}
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  resize: 'vertical',
                }}
              />
              <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>{description.length}/200</span>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => navigate('/leagues')}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving || !name.trim()}
              >
                {saving ? 'Creating...' : 'Create League'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </PageLayout>
  );
};

export default CreateLeaguePage;
