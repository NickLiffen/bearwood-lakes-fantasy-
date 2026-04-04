// League detail page — standings, leaders, members

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import {
  LeaderCard,
  LeaderboardSection,
  useLeaderboardColumns,
} from '../../components/leaderboard';
import type { LeaderboardEntry, PeriodInfo } from '../../components/leaderboard';
import { useAuth } from '../../hooks/useAuth';
import { useApiClient } from '../../hooks/useApiClient';
import { useActiveSeason } from '../../hooks/useActiveSeason';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import {
  getSaturdayOfWeek,
  formatDateString,
  generateWeekOptions,
  generateMonthOptions,
} from '../../utils/gameweek';
import type { PeriodOption } from '../../utils/gameweek';
import type { League, LeagueMemberInfo } from '@shared/types';

interface LeagueDetailResponse {
  league: League;
  members: LeagueMemberInfo[];
  entries: LeaderboardEntry[];
  period?: PeriodInfo;
  tournamentCount?: number;
}

interface LeadersResponse {
  league: League;
  members: LeagueMemberInfo[];
  leaders: {
    weeklyLeader: LeaderboardEntry | null;
    monthlyLeader: LeaderboardEntry | null;
    seasonLeader: LeaderboardEntry | null;
    currentWeek: PeriodInfo;
    currentMonth: PeriodInfo;
    seasonInfo: PeriodInfo;
  };
}

const LeagueDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { get, post, isAuthReady } = useApiClient();
  const { season } = useActiveSeason();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<LeagueMemberInfo[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('2026');
  useDocumentTitle(league ? `${league.name} - League` : 'League');

  useEffect(() => {
    if (season?.name) setSelectedSeason(season.name);
  }, [season?.name]);

  // Leaders state
  const [leaders, setLeaders] = useState<LeadersResponse['leaders'] | null>(null);

  // Table data
  const [weeklyData, setWeeklyData] = useState<LeagueDetailResponse | null>(null);
  const [monthlyData, setMonthlyData] = useState<LeagueDetailResponse | null>(null);
  const [seasonData, setSeasonData] = useState<LeagueDetailResponse | null>(null);

  const [weeklyDate, setWeeklyDate] = useState('');
  const [monthlyDate, setMonthlyDate] = useState('');
  const [weekOptions, setWeekOptions] = useState<PeriodOption[]>([]);
  const [monthOptions, setMonthOptions] = useState<PeriodOption[]>([]);
  const [weeklyPage, setWeeklyPage] = useState(1);
  const [monthlyPage, setMonthlyPage] = useState(1);
  const [seasonPage, setSeasonPage] = useState(1);
  const [copied, setCopied] = useState(false);

  const fetchPeriodData = useCallback(
    async (period: 'week' | 'month' | 'season', date?: string) => {
      if (!id || !selectedSeason) return null;
      try {
        let url = `leagues-detail?leagueId=${id}&period=${period}&season=${selectedSeason}`;
        if (date) url += `&date=${date}`;
        const response = await get<LeagueDetailResponse>(url);
        if (response.cancelled) return null;
        if (response.success && response.data) return response.data;
        return null;
      } catch {
        return null;
      }
    },
    [get, id, selectedSeason]
  );

  useEffect(() => {
    if (!isAuthReady || !id || !selectedSeason) return;
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch leaders
        const leadersRes = await get<LeadersResponse>(
          `leagues-detail?leagueId=${id}&action=leaders&season=${selectedSeason}`
        );
        if (cancelled || leadersRes.cancelled) return;

        if (leadersRes.success && leadersRes.data) {
          setLeague(leadersRes.data.league);
          setMembers(leadersRes.data.members);
          setLeaders(leadersRes.data.leaders);

          if (leadersRes.data.leaders.currentWeek) {
            setWeeklyDate(formatDateString(getSaturdayOfWeek(new Date(leadersRes.data.leaders.currentWeek.startDate), season?.firstGameweekStart)));
          }
          if (leadersRes.data.leaders.currentMonth) {
            const d = new Date(leadersRes.data.leaders.currentMonth.startDate);
            setMonthlyDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
          }
          if (leadersRes.data.leaders.seasonInfo) {
            setWeekOptions(generateWeekOptions(leadersRes.data.leaders.seasonInfo.startDate, leadersRes.data.leaders.seasonInfo.startDate, season?.firstGameweekStart));
            setMonthOptions(generateMonthOptions(leadersRes.data.leaders.seasonInfo.startDate));
          }
        } else {
          setError(leadersRes.error || 'Failed to load league');
          return;
        }

        // Fetch period data
        const [weekly, monthly, seasonRes] = await Promise.all([
          fetchPeriodData('week'),
          fetchPeriodData('month'),
          fetchPeriodData('season'),
        ]);
        if (cancelled) return;
        setWeeklyData(weekly);
        setMonthlyData(monthly);
        setSeasonData(seasonRes);
      } catch {
        if (!cancelled) setError('Failed to load league');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();
    return () => { cancelled = true; };
  }, [isAuthReady, id, selectedSeason, get, fetchPeriodData, season?.firstGameweekStart]);

  const handleWeekNavigation = async (direction: 'prev' | 'next') => {
    if (!weeklyData?.period) return;
    const currentDate = new Date(weeklyData.period.startDate);
    currentDate.setDate(currentDate.getDate() + (direction === 'prev' ? -7 : 7));
    const newDate = formatDateString(getSaturdayOfWeek(currentDate, season?.firstGameweekStart));
    setWeeklyDate(newDate);
    setWeeklyPage(1);
    const data = await fetchPeriodData('week', newDate);
    if (data) setWeeklyData(data);
  };

  const handleMonthNavigation = async (direction: 'prev' | 'next') => {
    if (!monthlyData?.period) return;
    const currentDate = new Date(monthlyData.period.startDate);
    currentDate.setMonth(currentDate.getMonth() + (direction === 'prev' ? -1 : 1));
    const newDate = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-01`;
    setMonthlyDate(newDate);
    setMonthlyPage(1);
    const data = await fetchPeriodData('month', newDate);
    if (data) setMonthlyData(data);
  };

  const isCurrentUser = useCallback(
    (entryUserId: string) => user?.id === entryUserId,
    [user?.id]
  );

  const columns = useLeaderboardColumns({ isCurrentUser });

  const handleLeave = async () => {
    if (!league || !confirm('Are you sure you want to leave this league?')) return;
    const response = await post('leagues-leave', { leagueId: league.id });
    if (response.success) navigate('/leagues', { replace: true });
  };

  const handleCopyInvite = () => {
    if (!league) return;
    const url = `${window.location.origin}/leagues/join/${league.inviteCode}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWeekSelect = useCallback(
    async (date: string) => {
      setWeeklyDate(date);
      setWeeklyPage(1);
      const data = await fetchPeriodData('week', date);
      if (data) setWeeklyData(data);
    },
    [fetchPeriodData]
  );

  const handleMonthSelect = useCallback(
    async (date: string) => {
      setMonthlyDate(date);
      setMonthlyPage(1);
      const data = await fetchPeriodData('month', date);
      if (data) setMonthlyData(data);
    },
    [fetchPeriodData]
  );

  if ((loading || !league) && !error) {
    return (
      <PageLayout activeNav="leagues">
        <div className="leagues-content">
          <div className="leagues-container">
            <LoadingSpinner text="Loading league..." />
          </div>
        </div>
      </PageLayout>
    );
  }

  const isAdmin = league && user?.id === league.adminId;
  const weeklyPeriod = weeklyData?.period;
  const monthlyPeriod = monthlyData?.period;

  return (
    <PageLayout activeNav="leagues">
      <div className="leaderboard-content">
        <div className="leaderboard-container">
          {/* Header */}
          <div className="users-page-header">
            <div className="page-header-row">
              <div>
                <h1>🏆 {league?.name}</h1>
                {league?.description && <p className="users-page-subtitle">{league.description}</p>}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button className="btn btn-secondary btn-sm" onClick={handleCopyInvite}>
                  {copied ? '✅ Copied!' : '🔗 Invite Link'}
                </button>
                {!isAdmin && (
                  <button className="btn btn-secondary btn-sm" onClick={handleLeave} style={{ color: '#dc2626' }}>
                    Leave
                  </button>
                )}
              </div>
            </div>
            <p className="users-page-subtitle">
              {league?.memberCount} member{league?.memberCount !== 1 ? 's' : ''} · Invite code: <strong>{league?.inviteCode}</strong>
            </p>
          </div>

          {error && <div className="error-message">{error}</div>}

          {/* Leader Cards */}
          <div className="leaders-section">
            <LeaderCard leader={leaders?.weeklyLeader || null} title="Weekly Leader" emoji="📅" isCurrentUser={isCurrentUser} />
            <LeaderCard leader={leaders?.monthlyLeader || null} title="Monthly Leader" emoji="📆" isCurrentUser={isCurrentUser} />
            <LeaderCard leader={leaders?.seasonLeader || null} title="Season Leader" emoji="🏆" isCurrentUser={isCurrentUser} />
          </div>

          {/* Standings */}
          <LeaderboardSection
            title="Weekly Standings"
            entries={weeklyData?.entries || []}
            columns={columns}
            currentPage={weeklyPage}
            onPageChange={setWeeklyPage}
            isCurrentUser={isCurrentUser}
            metaText={`${weeklyData?.entries?.length || 0} players`}
            periodNav={weeklyPeriod ? {
              id: 'league-week-select',
              options: weekOptions,
              selectedDate: weeklyDate,
              hasPrevious: weeklyPeriod.hasPrevious,
              hasNext: weeklyPeriod.hasNext,
              onNavigate: handleWeekNavigation,
              onSelect: handleWeekSelect,
            } : undefined}
          />

          <LeaderboardSection
            title="Monthly Standings"
            entries={monthlyData?.entries || []}
            columns={columns}
            currentPage={monthlyPage}
            onPageChange={setMonthlyPage}
            isCurrentUser={isCurrentUser}
            metaText={`${monthlyData?.entries?.length || 0} players`}
            periodNav={monthlyPeriod ? {
              id: 'league-month-select',
              options: monthOptions,
              selectedDate: monthlyDate,
              hasPrevious: monthlyPeriod.hasPrevious,
              hasNext: monthlyPeriod.hasNext,
              onNavigate: handleMonthNavigation,
              onSelect: handleMonthSelect,
            } : undefined}
          />

          <LeaderboardSection
            title="Season Standings"
            entries={seasonData?.entries || []}
            columns={columns}
            currentPage={seasonPage}
            onPageChange={setSeasonPage}
            isCurrentUser={isCurrentUser}
            metaText={`${seasonData?.entries?.length || 0} players`}
          />

          {/* Members */}
          <div className="leaderboard-section" style={{ marginTop: '2rem' }}>
            <h2>Members ({members.length})</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
              {members.map((m) => (
                <Link key={m.userId} to={`/users/${m.userId}`} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', textDecoration: 'none', color: 'inherit' }}>
                  <div className="dt-avatar">{m.firstName[0]}{m.lastName[0]}</div>
                  <div>
                    <div style={{ fontWeight: 500 }}>{m.firstName} {m.lastName}</div>
                    <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                      @{m.username} {m.isAdmin && <span style={{ color: 'var(--primary-green)', fontWeight: 600 }}>· Admin</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
};

export default LeagueDetailPage;
