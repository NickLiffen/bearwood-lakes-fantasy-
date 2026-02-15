// Hook to fetch and cache the active season

import { useState, useEffect } from 'react';
import { useApiClient } from './useApiClient';

interface Season {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  status: 'setup' | 'active' | 'complete';
}

// Module-level cache so multiple hook instances share the same data
let cachedSeason: Season | null = null;
let cachePromise: Promise<void> | null = null;

export function clearSeasonCache() {
  cachedSeason = null;
  cachePromise = null;
}

export const useActiveSeason = () => {
  const { get, isAuthReady } = useApiClient();
  const [season, setSeason] = useState<Season | null>(cachedSeason);
  const [loading, setLoading] = useState(!cachedSeason);

  useEffect(() => {
    if (cachedSeason) {
      setSeason(cachedSeason);
      setLoading(false);
      return;
    }

    if (!isAuthReady) return;

    const fetchSeason = async () => {
      // If another instance is already fetching, wait for it
      if (cachePromise) {
        await cachePromise;
        setSeason(cachedSeason);
        setLoading(false);
        return;
      }

      cachePromise = (async () => {
        try {
          const result = await get<Season[]>('seasons-list');
          if (result.cancelled) return;
          if (result.success && result.data) {
            const active = result.data.find((s) => s.isActive);
            if (active) {
              cachedSeason = active;
            }
          }
        } catch {
          // Silently fail — season will be null
        }
      })();

      await cachePromise;
      cachePromise = null;
      setSeason(cachedSeason);
      setLoading(false);
    };

    fetchSeason();
  }, [get, isAuthReady]);

  // Helper to get the stats field key for this season (e.g., "stats2025" or "stats2026")
  const statsKey = season ? `stats${season.name}` : 'stats2026';

  return { season, loading, statsKey };
};
