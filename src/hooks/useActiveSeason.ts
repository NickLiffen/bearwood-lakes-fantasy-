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
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function clearSeasonCache() {
  cachedSeason = null;
  cacheTimestamp = 0;
}

export const useActiveSeason = () => {
  const { get, isAuthReady } = useApiClient();
  const [season, setSeason] = useState<Season | null>(cachedSeason);
  const [loading, setLoading] = useState(!cachedSeason);

  useEffect(() => {
    const handleVisibility = () => {
      if (
        document.visibilityState === 'visible' &&
        cachedSeason &&
        Date.now() - cacheTimestamp >= CACHE_TTL_MS
      ) {
        cachedSeason = null;
        cacheTimestamp = 0;
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  useEffect(() => {
    if (cachedSeason && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
      setSeason(cachedSeason);
      setLoading(false);
      return;
    }

    if (!isAuthReady) return;
    let cancelled = false;

    const fetchSeason = async () => {
      try {
        const result = await get<Season[]>('seasons-list');
        if (cancelled || result.cancelled) return;
        if (result.success && result.data) {
          const active = result.data.find((s) => s.isActive);
          if (active) {
            cachedSeason = active;
            cacheTimestamp = Date.now();
          }
        }
      } catch {
        // Silently fail — season will be null
      }
      if (!cancelled) {
        setSeason(cachedSeason);
        setLoading(false);
      }
    };

    fetchSeason();
    return () => {
      cancelled = true;
    };
  }, [get, isAuthReady]);

  // Helper to get the stats field key for this season (e.g., "stats2025" or "stats2026")
  const statsKey = season ? `stats${season.name}` : 'stats2026';

  return { season, loading, statsKey };
};
