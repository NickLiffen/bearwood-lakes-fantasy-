// League detail page — standings, leaders, members

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import DataTable, { Column } from '../../components/ui/DataTable';
import PeriodNav from '../../components/ui/PeriodNav';
import { useAuth } from '../../hooks/useAuth';
import { useApiClient } from '../../hooks/useApiClient';
import { useActiveSeason } from '../../hooks/useActiveSeason';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatPrice } from '../../utils/formatters';
import {
  getSaturdayOfWeek,
  formatDateString,
  generateWeekOptions,
  generateMonthOptions,
} from '../../utils/gameweek';
import type { PeriodOption } from '../../utils/gameweek';
import type { League, LeagueMemberInfo } from '@shared/types';

const ITEMS_PER_PAGE = 10;

interface LeaderboardEntry {
  rank: number;
  oldRank: number | null;
  movement: 'up' | 'down' | 'same' | 'new';
  movementAmount: number;
  userId: string;
  firstName: string;
  lastName: string;
  username: string;
  points: number;
  teamValue: number;
  eventsPlayed: number;
}

interface PeriodInfo {
  type: 'week' | 'month' | 'season';
  startDate: string;
  endDate: string;
  label: string;
  hasPrevious: boolean;
  hasNext: boolean;
}

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
            setWeeklyDate(formatDateString(getSaturdayOfWeek(new Date(leadersRes.data.leaders.currentWeek.startDate))));
          }
          if (leadersRes.data.leaders.currentMonth) {
            const d = new Date(leadersRes.data.leaders.currentMonth.startDate);
            setMonthlyDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
          }
          if (leadersRes.data.leaders.seasonInfo) {
            setWeekOptions(generateWeekOptions(leadersRes.data.leaders.seasonInfo.startDate, leadersRes.data.leaders.seasonInfo.startDate));
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
  }, [isAuthReady, id, selectedSeason, get, fetchPeriodData]);

  const handleWeekNavigation = async (direction: 'prev' | 'next') => {
    if (!weeklyData?.period) return;
    const currentDate = new Date(weeklyData.period.startDate);
    currentDate.setDate(currentDate.getDate() + (direction === 'prev' ? -7 : 7));
    const newDate = formatDateString(getSaturdayOfWeek(currentDate));
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

  const columns: Column<LeaderboardEntry>[] = useMemo(
    () => [
      {
        key: 'rank', header: 'Rank', width: '70px', align: 'center' as const,
        render: (entry) => {
          if (entry.rank <= 3) {
            return <span className={`dt-rank dt-rank-${entry.rank}`}>{entry.rank === 1 && '🥇 '}{entry.rank === 2 && '🥈 '}{entry.rank === 3 && '🥉 '}{entry.rank}</span>;
          }
          return <span className="dt-rank">{entry.rank}</span>;
        },
      },
      {
        key: 'movement', header: 'Move', width: '60px', align: 'center' as const,
        render: (entry) => {
          if (entry.movement === 'new') return <span className="dt-badge dt-badge-warning">NEW</span>;
          if (entry.movement === 'up') return <span className="movement-up">↑{entry.movementAmount}</span>;
          if (entry.movement === 'down') return <span className="movement-down">↓{entry.movementAmount}</span>;
          return <span className="dt-text-muted">-</span>;
        },
      },
      {
        key: 'user', header: 'Player',
        render: (entry) => (
          <Link to={`/users/${entry.userId}`} className="dt-text-link">
            <div className="dt-info-cell">
              <div className="dt-avatar">{entry.firstName[0]}{entry.lastName[0]}</div>
              <div className="dt-info-details">
                <span className="dt-info-name">
                  {entry.firstName} {entry.lastName}
                  {isCurrentUser(entry.userId) && <span className="dt-you-badge">You</span>}
                </span>
                <span className="dt-info-subtitle">@{entry.username}</span>
              </div>
            </div>
          </Link>
        ),
      },
      {
        key: 'points', header: 'Points', width: '90px', align: 'center' as const,
        render: (entry) => <span className="dt-text-price">{entry.points}</span>,
      },
      {
        key: 'teamValue', header: 'Team Value', width: '110px', align: 'center' as const,
        headerClassName: 'hide-on-mobile', cellClassName: 'hide-on-mobile',
        render: (entry) => formatPrice(entry.teamValue),
      },
    ],
    [isCurrentUser]
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

  const renderLeaderCard = (leader: LeaderboardEntry | null, title: string, emoji: string) => (
    <div className={`leader-card ${!leader ? 'empty' : ''} ${leader && isCurrentUser(leader.userId) ? 'is-you' : ''}`}>
      <div className="leader-title">{emoji} {title}</div>
      {leader ? (
        <>
          <div className="leader-avatar">{leader.firstName[0]}{leader.lastName[0]}</div>
          <div className="leader-name">
            {leader.firstName} {leader.lastName}
            {isCurrentUser(leader.userId) && <span className="dt-you-badge">You</span>}
          </div>
          <div className="leader-points">{leader.points} pts</div>
        </>
      ) : (
        <div className="leader-empty">No leader yet</div>
      )}
    </div>
  );

  const renderTable = (
    data: LeagueDetailResponse | null,
    title: string,
    type: 'week' | 'month' | 'season',
    showNavigation: boolean,
    currentPage: number,
    setCurrentPage: (p: number) => void
  ) => {
    const entries = data?.entries || [];
    const period = data?.period;
    const totalPages = Math.ceil(entries.length / ITEMS_PER_PAGE);
    const paginatedEntries = entries.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    return (
      <div className="leaderboard-section">
        <div className="section-header">
          <div className="section-title-row">
            <h2>{title}</h2>
            <span className="section-meta">{entries.length} players</span>
          </div>
          {showNavigation && period && (
            <PeriodNav
              id={`league-${type}-select`}
              options={type === 'week' ? weekOptions : monthOptions}
              selectedDate={type === 'week' ? weeklyDate : monthlyDate}
              hasPrevious={period.hasPrevious}
              hasNext={period.hasNext}
              onNavigate={(dir) => type === 'week' ? handleWeekNavigation(dir) : handleMonthNavigation(dir)}
              onSelect={(date) => {
                if (type === 'week') { setWeeklyDate(date); setWeeklyPage(1); fetchPeriodData('week', date).then(d => d && setWeeklyData(d)); }
                else { setMonthlyDate(date); setMonthlyPage(1); fetchPeriodData('month', date).then(d => d && setMonthlyData(d)); }
              }}
            />
          )}
        </div>
        <DataTable data={paginatedEntries} columns={columns} rowKey={(e) => e.userId} rowClassName={(e) => isCurrentUser(e.userId) ? 'dt-row-highlighted' : ''} emptyMessage="No data for this period yet." />
        {totalPages > 1 && (
          <div className="pagination-controls">
            <button className="pagination-btn" onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage === 1}>← Previous</button>
            <span className="page-info">Page {currentPage} of {totalPages}</span>
            <button className="pagination-btn" onClick={() => setCurrentPage(currentPage + 1)} disabled={currentPage === totalPages}>Next →</button>
          </div>
        )}
      </div>
    );
  };

  const isAdmin = league && user?.id === league.adminId;

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
            {renderLeaderCard(leaders?.weeklyLeader || null, 'Weekly Leader', '📅')}
            {renderLeaderCard(leaders?.monthlyLeader || null, 'Monthly Leader', '📆')}
            {renderLeaderCard(leaders?.seasonLeader || null, 'Season Leader', '🏆')}
          </div>

          {/* Standings */}
          {renderTable(weeklyData, 'Weekly Standings', 'week', true, weeklyPage, setWeeklyPage)}
          {renderTable(monthlyData, 'Monthly Standings', 'month', true, monthlyPage, setMonthlyPage)}
          {renderTable(seasonData, 'Season Standings', 'season', false, seasonPage, setSeasonPage)}

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
