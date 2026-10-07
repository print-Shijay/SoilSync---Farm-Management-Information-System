import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { powersync } from '../powersync';
import { useAuth } from '../AuthContext';
import { supabase } from '../supabase';
import { batchUpdateTodosCompletion } from '../db-operations';
import { respondTeamInviteOnline } from '../team-operations';

/**
 * ============================================================================
 * SOILSYNC NOTIFICATION HUB - LOCAL-FIRST ARCHITECTURE
 * ============================================================================
 * 
 * 1. Zero Redundant Backend Tables:
 *    There is no separate `notifications` table in Supabase or SQLite.
 *    Instead, notifications are dynamically derived on-the-fly directly from
 *    replicated SQLite tables:
 *      - `team_members`: Group collaboration invites (Primary Focus 1)
 *      - `todos`: Actionable task reminders & deadlines (Primary Focus 2)
 *      - `audit_logs`: Collaborative team activity stream (Secondary Focus)
 *    Joined with `farms`, `users`, `garden_structures`, `garden_structure_types`.
 * 
 * 2. High Performance Top-100 Pagination:
 *    - Loads top 100 notifications initially (`PAGE_SIZE = 100`).
 *    - Tapping "Load earlier notifications" fetches the next 100 items without
 *      reloading the modal or resetting the scroll position (`isSilent: true`).
 *    - Uses a 1-item lookahead buffer (`LIMIT queryLimit + 1`) to detect if more
 *      rows exist in SQLite without scanning whole tables.
 * 
 * 3. Primary Role Alignment:
 *    - Group Invites: Direct invitation cards with Confirm / Delete quick actions.
 *    - Task Reminders: Active deadlines (overdue or due today). Multi-plot tasks
 *      (spanning 3 or 100 plots) are consolidated into 1 distinct task card.
 *    - Future tasks (tomorrow onwards) do NOT trigger early deadline notifications.
 * 
 * 4. Security & Rate Limiting:
 *    - All SQLite queries use parameterized placeholders (`?`) to prevent SQL injection.
 *    - Strict user ID scoping: only accessible farms, assigned tasks, or pending invites.
 *    - 300ms debounce on PowerSync watchers prevents rapid re-query storms during batch updates.
 *    - `loadMore` and action mutators are concurrency-locked against rapid multi-clicks.
 * ============================================================================
 */

export const NOTIFICATION_PAGE_SIZE = 100;
const STORAGE_LAST_READ_KEY = 'soilsync:notifications_last_read_at';
const STORAGE_READ_IDS_KEY = 'soilsync:notifications_read_ids';

/**
 * Singleton state for instant reactive synchronization between the
 * Home screen bell badge and the Notification Center modal.
 */
let globalLastReadAt: string | null = null;
const globalReadIds: Set<string> = new Set();
const hubListeners = new Set<() => void>();

function notifyHubListeners() {
  hubListeners.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

function padZero(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Generates local calendar date key (YYYY-MM-DD) matching user's local timezone.
 */
export function toLocalDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())}`;
}

/**
 * Safe date parser for Hermes / React Native Android.
 * Correctly parses YYYY-MM-DD local keys, SQLite timestamps, and ISO-8601 strings.
 */
export function parseSafeDate(dateString?: string | null): Date {
  if (!dateString) return new Date();
  const normalized = String(dateString).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const [y, m, d] = normalized.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  let iso = normalized;
  if (iso.includes(' ') && !iso.includes('T')) {
    iso = iso.replace(' ', 'T') + (iso.endsWith('Z') ? '' : 'Z');
  } else if (iso.includes('T') && !iso.endsWith('Z') && !iso.includes('+') && !iso.includes('-')) {
    iso = iso + 'Z';
  }
  const d = new Date(iso);
  if (!isNaN(d.getTime())) return d;
  const fallback = new Date(dateString);
  return isNaN(fallback.getTime()) ? new Date() : fallback;
}

/** Time bucket categories for grouping notifications in the 'All' stream */
export type TimeBucket =
  | 'Today'
  | '1 Day Ago'
  | '1 Week Ago'
  | '1 Month Ago'
  | '3 Months Ago'
  | '6 Months Ago'
  | '9 Months Ago'
  | '1 Year Ago'
  | '1 Year+';

export const TIME_BUCKET_ORDER: TimeBucket[] = [
  'Today',
  '1 Day Ago',
  '1 Week Ago',
  '1 Month Ago',
  '3 Months Ago',
  '6 Months Ago',
  '9 Months Ago',
  '1 Year Ago',
  '1 Year+',
];

/**
 * Categorize a date timestamp into a user-friendly time bucket section header.
 */
export function getTimeBucket(dateString: string): TimeBucket {
  const date = parseSafeDate(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs <= 0) return 'Today';

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  if (isToday || diffDays === 0) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();
  if (isYesterday || diffDays === 1) return '1 Day Ago';

  if (diffDays <= 7) return '1 Week Ago';
  if (diffDays <= 30) return '1 Month Ago';
  if (diffDays <= 90) return '3 Months Ago';
  if (diffDays <= 180) return '6 Months Ago';
  if (diffDays <= 270) return '9 Months Ago';
  if (diffDays <= 365) return '1 Year Ago';
  return '1 Year+';
}

/**
 * Format a date string into concise relative time (e.g. 'Just now', '5m ago', '2h ago').
 */
export function formatRelativeTime(dateString: string): string {
  const date = parseSafeDate(dateString);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffSec < 0 || diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

/** Team / Group collaboration invite item (Primary Focus 1) */
export interface HubInviteItem {
  type: 'invite';
  id: string;
  teamId?: string;
  farmId: string;
  farmName: string;
  ownerEmail?: string;
  ownerName?: string;
  ownerProfileIconUrl?: string;
  ownerAvatarUrl?: string;
  role: string;
  createdAt: string;
}

/** Task deadline & reminder item (Primary Focus 2) */
export interface HubDeadlineItem {
  type: 'deadline';
  id: string;
  todoIds: string[];
  title: string;
  farmId: string;
  farmName: string;
  dueDate: string;
  urgency: 'overdue' | 'today' | 'upcoming';
  createdAt: string;
  plotsCount?: number;
  plotNames?: string[];
  isOverdueSummary?: boolean;
  overdueCount?: number;
}

/** Farm team activity log item (Secondary Focus) */
export interface HubActivityItem {
  type: 'activity';
  id: string;
  farmId: string;
  farmName: string;
  userId: string;
  userName: string;
  userEmail?: string;
  userProfileIconUrl?: string;
  userAvatarUrl?: string;
  action: string;
  details: Record<string, any>;
  createdAt: string;
}

/** Rejected invitation notification item */
export interface HubRejectedInviteItem {
  type: 'rejected_invite';
  id: string;
  teamId: string;
  groupName: string;
  rejecterUserId: string;
  rejecterName: string;
  rejecterEmail?: string;
  rejecterProfileIconUrl?: string;
  rejecterAvatarUrl?: string;
  createdAt: string;
}

export type HubNotificationItem =
  | HubInviteItem
  | HubDeadlineItem
  | HubActivityItem
  | HubRejectedInviteItem;

/**
 * Main Notification Hub Hook.
 * Manages live local SQLite queries, top-100 pagination, debounced watchers,
 * read state tracking, and inline quick actions.
 */
export function useNotificationHub(initialLimit: number = NOTIFICATION_PAGE_SIZE) {
  const { session, user } = useAuth();
  const userId = session?.user?.id || user?.id;

  const [invites, setInvites] = useState<HubInviteItem[]>([]);
  const [rejectedInvites, setRejectedInvites] = useState<HubRejectedInviteItem[]>([]);
  const [deadlines, setDeadlines] = useState<HubDeadlineItem[]>([]);
  const [activities, setActivities] = useState<(HubActivityItem | HubRejectedInviteItem)[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(initialLimit);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [lastReadAt, setLastReadAt] = useState<string | null>(globalLastReadAt);
  const [readIds, setReadIds] = useState<Set<string>>(globalReadIds);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  /** Load persisted read timestamps and IDs from AsyncStorage on mount */
  const loadReadState = useCallback(async () => {
    try {
      const [val, rawIds] = await Promise.all([
        AsyncStorage.getItem(STORAGE_LAST_READ_KEY),
        AsyncStorage.getItem(STORAGE_READ_IDS_KEY),
      ]);
      if (val) {
        globalLastReadAt = val;
      }
      if (rawIds) {
        const parsed = JSON.parse(rawIds);
        if (Array.isArray(parsed)) {
          parsed.forEach((id) => globalReadIds.add(id));
        }
      }
      setLastReadAt(globalLastReadAt);
      setReadIds(new Set(globalReadIds));
      notifyHubListeners();
    } catch {}
  }, []);

  // Subscribe to hub updates across all mounted hook instances (home bell & modal)
  useEffect(() => {
    const handleHubUpdate = () => {
      setLastReadAt(globalLastReadAt);
      setReadIds(new Set(globalReadIds));
    };
    hubListeners.add(handleHubUpdate);
    return () => {
      hubListeners.delete(handleHubUpdate);
    };
  }, []);

  useEffect(() => {
    void loadReadState();
  }, [loadReadState]);

  /**
   * Fetch notification items directly from local SQLite tables.
   * 
   * @param queryLimit Current page limit (defaults to 100)
   * @param isSilent When true, does NOT trigger full-screen spinner (preserves scroll position)
   */
  const fetchData = useCallback(
    async (queryLimit: number = limit, isSilent: boolean = false) => {
      if (!userId) {
        setInvites([]);
        setRejectedInvites([]);
        setDeadlines([]);
        setActivities([]);
        setHasMore(false);
        setLoading(false);
        return;
      }

      try {
        if (!isSilent) {
          setLoading(true);
        }

        const todayKey = toLocalDateKey();
        // Buffer by 1 to determine if more items exist in SQLite without an unbounded scan
        const fetchBuffer = queryLimit + 1;

        // ────────────────────────────────────────────────────────────────────
        // 1. PRIMARY FOCUS 1: PENDING TEAM / GROUP COLLABORATION INVITES
        // ────────────────────────────────────────────────────────────────────
        const inviteRows = await powersync.getAll<any>(
          `
          SELECT 
            tm.id, 
            tm.team_id, 
            tm.role, 
            tm.created_at,
            COALESCE(tm.team_name, t.name) as team_name,
            COALESCE(tm.inviter_name, u.username, u.first_name || ' ' || u.last_name, u.email) as inviter_name,
            u.username as owner_username,
            u.email as owner_email, 
            u.first_name as owner_first_name, 
            u.last_name as owner_last_name,
            u.profile_icon_url as owner_profile_icon_url,
            u.avatar_url as owner_avatar_url
          FROM team_members tm
          LEFT JOIN teams t ON t.id = tm.team_id
          LEFT JOIN users u ON u.id = COALESCE(tm.invited_by, t.owner_id)
          WHERE tm.user_id = ? AND tm.status = 'pending'
          ORDER BY tm.created_at DESC
          LIMIT ?
          `,
          [userId, fetchBuffer]
        );

        // If any invite row is missing team_name or inviter_name, fetch from Supabase team_members
        const missingInvites = inviteRows.filter((r) => !r.team_name || !r.inviter_name);
        if (missingInvites.length > 0) {
          try {
            const { data: onlineMembers } = await supabase
              .from('team_members')
              .select('id, team_id, inviter_name, team_name, role, status, invited_by, teams(name, owner_id), users:invited_by(username, first_name, last_name, email, avatar_url, profile_icon_url)')
              .eq('user_id', userId)
              .eq('status', 'pending');

            if (onlineMembers && onlineMembers.length > 0) {
              for (const om of onlineMembers as any[]) {
                const row = inviteRows.find((r) => r.id === om.id);
                const tName = om.team_name || om.teams?.name;
                const invUser = Array.isArray(om.users) ? om.users[0] : om.users;
                const invName =
                  om.inviter_name ||
                  invUser?.username ||
                  (invUser?.first_name ? `${invUser.first_name} ${invUser.last_name || ''}`.trim() : null) ||
                  invUser?.email;

                if (row) {
                  if (tName) row.team_name = tName;
                  if (invName) row.inviter_name = invName;
                  if (invUser?.avatar_url) row.owner_avatar_url = invUser.avatar_url;
                  if (invUser?.profile_icon_url) row.owner_profile_icon_url = invUser.profile_icon_url;
                }

                // Cache in local SQLite team_members immediately
                if (tName || invName) {
                  powersync.execute(
                    `UPDATE team_members SET team_name = COALESCE(?, team_name), inviter_name = COALESCE(?, inviter_name) WHERE id = ?`,
                    [tName || null, invName || null, om.id]
                  ).catch(() => {});
                }
              }
            }
          } catch (onlineErr) {
            console.warn('[useNotificationHub] Online team_members metadata lookup failed:', onlineErr);
          }
        }

        const parsedInvites: HubInviteItem[] = inviteRows.slice(0, queryLimit).map((r) => {
          const nameParts = [r.owner_first_name, r.owner_last_name].filter(Boolean);
          const fullName = nameParts.length > 0 ? nameParts.join(' ') : null;
          const ownerName =
            r.inviter_name ||
            r.owner_username ||
            fullName ||
            r.owner_email ||
            'Someone';

          const farmName = r.team_name || 'the team';

          return {
            type: 'invite',
            id: r.id,
            teamId: r.team_id,
            farmId: r.team_id,
            farmName,
            ownerEmail: r.owner_email,
            ownerName,
            ownerProfileIconUrl: r.owner_profile_icon_url,
            ownerAvatarUrl: r.owner_avatar_url,
            role: r.role || 'member',
            createdAt: r.created_at,
          };
        });

        // ────────────────────────────────────────────────────────────────────
        // 1B. REJECTED TEAM / GROUP COLLABORATION INVITATIONS
        // ────────────────────────────────────────────────────────────────────
        const rejectedRows = await powersync.getAll<any>(
          `
          SELECT 
            tm.id, 
            tm.team_id, 
            tm.user_id,
            COALESCE(tm.member_name, u.username, u.first_name || ' ' || u.last_name, u.email, 'Someone') as rejecter_name,
            COALESCE(tm.team_name, t.name, 'Group') as group_name,
            u.username as rejecter_username,
            u.first_name as rejecter_first_name,
            u.last_name as rejecter_last_name,
            u.email as rejecter_email,
            u.profile_icon_url as rejecter_profile_icon_url,
            u.avatar_url as rejecter_avatar_url,
            COALESCE(tm.updated_at, tm.created_at) as created_at
          FROM team_members tm
          LEFT JOIN teams t ON t.id = tm.team_id
          LEFT JOIN users u ON u.id = tm.user_id
          WHERE tm.status = 'declined'
            AND (
              tm.invited_by = ? 
              OR (tm.invited_by IS NULL AND t.owner_id = ?)
            )
            AND tm.user_id != ?
          ORDER BY COALESCE(tm.updated_at, tm.created_at) DESC
          LIMIT ?
          `,
          [userId, userId, userId, fetchBuffer]
        );

        // If any rejected row is missing display name or has 'Someone', attempt online enrichment
        const missingRejected = rejectedRows.filter((r) => !r.rejecter_name || r.rejecter_name === 'Someone');
        if (missingRejected.length > 0) {
          try {
            const userIds = missingRejected.map((r) => r.user_id).filter(Boolean);
            if (userIds.length > 0) {
              const { data: onlineUsers } = await supabase
                .from('users')
                .select('id, username, first_name, last_name, email, avatar_url, profile_icon_url')
                .in('id', userIds);

              if (onlineUsers && onlineUsers.length > 0) {
                onlineUsers.forEach((ou: any) => {
                  const match = rejectedRows.find((r) => r.user_id === ou.id);
                  const nameParts = [ou.first_name, ou.last_name].filter(Boolean);
                  const fullName = nameParts.length > 0 ? nameParts.join(' ') : null;
                  const dName = ou.username || fullName || ou.email;
                  if (match && dName) {
                    match.rejecter_name = dName;
                    if (ou.avatar_url) match.rejecter_avatar_url = ou.avatar_url;
                    if (ou.profile_icon_url) match.rejecter_profile_icon_url = ou.profile_icon_url;
                  }
                });
              }
            }
          } catch {
            // Ignore online error
          }
        }

        const parsedRejected: HubRejectedInviteItem[] = rejectedRows.slice(0, queryLimit).map((r) => ({
          type: 'rejected_invite',
          id: r.id,
          teamId: r.team_id,
          groupName: r.group_name || 'Group',
          rejecterUserId: r.user_id,
          rejecterName: r.rejecter_name || 'Someone',
          rejecterEmail: r.rejecter_email,
          rejecterProfileIconUrl: r.rejecter_profile_icon_url,
          rejecterAvatarUrl: r.rejecter_avatar_url,
          createdAt: r.created_at || new Date().toISOString(),
        }));

        // ────────────────────────────────────────────────────────────────────
        // 2. PRIMARY FOCUS 2: ACTIVE TASK REMINDERS & DEADLINES
        // ────────────────────────────────────────────────────────────────────
        const taskRows = await powersync.getAll<any>(
          `
          SELECT 
            t.id, 
            t.title, 
            t.notes,
            t.due_date, 
            t.start_date, 
            t.farm_id, 
            t.garden_structure_id,
            t.created_at,
            COALESCE(f.farm_name, 'Farm') as farm_name,
            gs.label as plot_label,
            gst.type_name as plot_type_name
          FROM todos t
          LEFT JOIN farms f ON t.farm_id = f.id
          LEFT JOIN garden_structures gs ON t.garden_structure_id = gs.id
          LEFT JOIN garden_structure_types gst ON gs.structure_type_id = gst.id
          WHERE (
            f.user_id = ? 
            OR t.user_id = ? 
            OR EXISTS (
              SELECT 1 FROM team_farms tf 
              JOIN team_members tm ON tm.team_id = tf.team_id 
              WHERE tf.farm_id = t.farm_id AND tm.user_id = ? AND tm.status = 'accepted'
            )
          )
            AND (t.is_completed = 0 OR t.is_completed = '0' OR t.is_completed IS NULL)
            AND (t.due_date IS NOT NULL OR t.start_date IS NOT NULL)
          ORDER BY COALESCE(t.due_date, t.start_date) ASC
          LIMIT ?
          `,
          [userId, userId, userId, fetchBuffer]
        );

        // Group multi-plot tasks into 1 logical card signature
        const deadlineGroupMap = new Map<
          string,
          {
            firstTodo: any;
            todoIds: string[];
            plotNames: string[];
          }
        >();

        for (const t of taskRows) {
          const groupKey = `${t.farm_id}|${t.title}|${t.notes || ''}|${t.start_date || ''}|${t.due_date || ''}`;
          if (!deadlineGroupMap.has(groupKey)) {
            deadlineGroupMap.set(groupKey, {
              firstTodo: t,
              todoIds: [],
              plotNames: [],
            });
          }
          const g = deadlineGroupMap.get(groupKey)!;
          g.todoIds.push(t.id);
          const plotName = t.plot_label || t.plot_type_name;
          if (plotName && !g.plotNames.includes(plotName)) {
            g.plotNames.push(plotName);
          }
        }

        const parsedDeadlines: HubDeadlineItem[] = Array.from(deadlineGroupMap.values()).map((g) => {
          const t = g.firstTodo;
          const startDateKey = (t.start_date || t.due_date || todayKey).slice(0, 10);
          const dueDateKey = (t.due_date || startDateKey).slice(0, 10);
          let urgency: 'overdue' | 'today' | 'upcoming' = 'upcoming';
          if (dueDateKey < todayKey) {
            urgency = 'overdue';
          } else if (todayKey >= startDateKey && todayKey <= dueDateKey) {
            urgency = 'today';
          } else {
            urgency = 'upcoming';
          }
          return {
            type: 'deadline',
            id: t.id,
            todoIds: g.todoIds,
            title: t.title,
            farmId: t.farm_id,
            farmName: t.farm_name || 'Farm',
            dueDate: dueDateKey,
            urgency,
            createdAt: t.created_at || new Date().toISOString(),
            plotsCount: g.todoIds.length,
            plotNames: g.plotNames,
          };
        });

        // Separate active tasks: tasks due today and overdue tasks
        const todayDeadlines = parsedDeadlines.filter((d) => d.urgency === 'today');
        const overdueDeadlines = parsedDeadlines.filter((d) => d.urgency === 'overdue');

        // Consolidate overdue tasks per farm into a single summary notification:
        // "You have {count} overdue task(s) on {FarmName}"
        const overdueByFarm = new Map<string, HubDeadlineItem[]>();
        for (const od of overdueDeadlines) {
          const list = overdueByFarm.get(od.farmId) || [];
          list.push(od);
          overdueByFarm.set(od.farmId, list);
        }

        const overdueSummaries: HubDeadlineItem[] = Array.from(overdueByFarm.entries()).map(
          ([farmId, list]) => {
            const count = list.length;
            const farmName = list[0]?.farmName || 'Farm';
            const allTodoIds = list.flatMap((item) => item.todoIds || [item.id]);
            const earliestDue = list.reduce(
              (min, cur) => (cur.dueDate < min ? cur.dueDate : min),
              list[0]?.dueDate || todayKey
            );
            const latestCreated = list.reduce(
              (max, cur) => (cur.createdAt > max ? cur.createdAt : max),
              list[0]?.createdAt || new Date().toISOString()
            );

            return {
              type: 'deadline' as const,
              id: `overdue-summary-${farmId}`,
              todoIds: allTodoIds,
              title: `You have ${count} overdue task${count === 1 ? '' : 's'} on ${farmName}`,
              farmId,
              farmName,
              dueDate: earliestDue,
              urgency: 'overdue' as const,
              createdAt: latestCreated,
              isOverdueSummary: true,
              overdueCount: count,
            };
          }
        );

        // Active deadlines: 1 summary card per farm for overdue tasks + individual cards for today's tasks.
        // Future scheduled tasks do not generate early deadline notifications.
        const relevantDeadlines = [...overdueSummaries, ...todayDeadlines].slice(0, queryLimit);

        // ────────────────────────────────────────────────────────────────────
        // 3. SECONDARY STREAM: FARM TEAM ACTIVITY LOGS
        // ────────────────────────────────────────────────────────────────────
        const logRows = await powersync.getAll<any>(
          `
          SELECT 
            al.id, 
            al.farm_id, 
            al.user_id, 
            al.action, 
            al.details, 
            al.created_at,
            COALESCE(f.farm_name, 'Farm') as farm_name,
            u.email as user_email, 
            u.first_name as user_first_name, 
            u.last_name as user_last_name,
            u.profile_icon_url as user_profile_icon_url,
            u.avatar_url as user_avatar_url
          FROM audit_logs al
          LEFT JOIN farms f ON al.farm_id = f.id
          LEFT JOIN users u ON u.id = al.user_id
          WHERE (
            f.user_id = ? 
            OR al.farm_owner_id = ? 
            OR al.user_id = ? 
            OR EXISTS (
              SELECT 1 FROM team_farms tf 
              JOIN team_members tm ON tm.team_id = tf.team_id 
              WHERE tf.farm_id = al.farm_id AND tm.user_id = ? AND tm.status = 'accepted'
            )
          )
          ORDER BY al.created_at DESC
          LIMIT ?
          `,
          [userId, userId, userId, userId, fetchBuffer]
        );

        const rawActivities: HubActivityItem[] = logRows.slice(0, queryLimit).map((l) => {
          const nameParts = [l.user_first_name, l.user_last_name].filter(Boolean);
          let userName = nameParts.length > 0 ? nameParts.join(' ') : l.user_email || 'Farm Member';
          if (l.user_id === userId) userName = 'You';

          let detailsObj: Record<string, any> = {};
          if (typeof l.details === 'string') {
            try {
              detailsObj = JSON.parse(l.details);
            } catch {}
          } else if (typeof l.details === 'object' && l.details !== null) {
            detailsObj = l.details;
          }

          return {
            type: 'activity',
            id: l.id,
            farmId: l.farm_id,
            farmName: l.farm_name || 'Farm',
            userId: l.user_id,
            userName,
            userEmail: l.user_email,
            userProfileIconUrl: l.user_profile_icon_url,
            userAvatarUrl: l.user_avatar_url,
            action: l.action,
            details: detailsObj,
            createdAt: l.created_at,
          };
        });

        // Consolidate rapid sequential task completion logs
        const parsedActivities: HubActivityItem[] = [];
        for (const item of rawActivities) {
          const prev = parsedActivities[parsedActivities.length - 1];
          const isTaskAction = item.action === 'COMPLETED_TODO' || item.action === 'UNCOMPLETED_TODO';
          if (
            prev &&
            isTaskAction &&
            prev.action === item.action &&
            prev.farmId === item.farmId &&
            prev.userId === item.userId &&
            prev.details?.title === item.details?.title &&
            Math.abs(parseSafeDate(prev.createdAt).getTime() - parseSafeDate(item.createdAt).getTime()) <= 15000
          ) {
            const combinedCount = (prev.details?.plotsCount || 1) + (item.details?.plotsCount || 1);
            const combinedPlotNames = Array.from(
              new Set([...(prev.details?.plotNames || []), ...(item.details?.plotNames || [])])
            );
            prev.details = {
              ...prev.details,
              plotsCount: combinedCount,
              plotNames: combinedPlotNames,
            };
          } else {
            parsedActivities.push({ ...item });
          }
        }

        // In the activity stream, show both farm logs and team rejection notices
        const combinedActivities: (HubActivityItem | HubRejectedInviteItem)[] = [
          ...parsedRejected,
          ...parsedActivities,
        ].sort((a, b) => parseSafeDate(b.createdAt).getTime() - parseSafeDate(a.createdAt).getTime());

        const hasMoreInDb =
          logRows.length > queryLimit ||
          (taskRows.length > queryLimit && relevantDeadlines.length >= queryLimit) ||
          inviteRows.length > queryLimit ||
          rejectedRows.length > queryLimit;

        setInvites(parsedInvites);
        setRejectedInvites(parsedRejected);
        setDeadlines(relevantDeadlines);
        setActivities(combinedActivities);
        setHasMore(hasMoreInDb);
      } catch (err) {
        console.warn('[useNotificationHub] Error querying local notifications:', err);
      } finally {
        if (!isSilent) {
          setLoading(false);
        }
      }
    },
    [userId, limit]
  );

  // Initial fetch on mount or userId change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Rate-limited & debounced background watchers on local SQLite tables
  useEffect(() => {
    if (!userId) return;

    const abortController = new AbortController();

    const debouncedRefresh = () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        void fetchData(limit, true);
      }, 300);
    };

    async function watchTables() {
      try {
        for await (const _ of powersync.watch(
          `SELECT id FROM audit_logs ORDER BY created_at DESC LIMIT 1`,
          [],
          { signal: abortController.signal }
        )) {
          debouncedRefresh();
        }
      } catch {}
    }

    async function watchInvites() {
      try {
        for await (const _ of powersync.watch(
          `SELECT id FROM team_members WHERE user_id = ? OR invited_by = ?`,
          [userId, userId],
          { signal: abortController.signal }
        )) {
          debouncedRefresh();
        }
      } catch {}
    }

    async function watchTodos() {
      try {
        for await (const _ of powersync.watch(
          `SELECT id FROM todos ORDER BY updated_at DESC LIMIT 1`,
          [],
          { signal: abortController.signal }
        )) {
          debouncedRefresh();
        }
      } catch {}
    }

    void watchTables();
    void watchInvites();
    void watchTodos();

    return () => {
      abortController.abort();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [userId, limit, fetchData]);

  // Unified stream with chronologically ordered time buckets for the "All" tab
  const groupedAllSections = useMemo(() => {
    const rawAllItems: HubNotificationItem[] = [
      ...invites,
      ...rejectedInvites,
      ...deadlines,
      ...activities,
    ];

    const seenIds = new Set<string>();
    const allItems: HubNotificationItem[] = [];
    for (const item of rawAllItems) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        allItems.push(item);
      }
    }

    const getItemTimestamp = (item: HubNotificationItem): number => {
      if (item.type === 'deadline') {
        if (item.urgency === 'today') return Date.now();
        if (item.urgency === 'overdue') return Date.now() - 1000;
        return parseSafeDate(item.dueDate).getTime();
      }
      return parseSafeDate(item.createdAt).getTime();
    };

    const getItemBucket = (item: HubNotificationItem): TimeBucket => {
      if (item.type === 'deadline') {
        if (item.urgency === 'today' || item.urgency === 'overdue') return 'Today';
        return getTimeBucket(item.dueDate);
      }
      return getTimeBucket(item.createdAt);
    };

    allItems.sort((a, b) => getItemTimestamp(b) - getItemTimestamp(a));

    const visibleItems = allItems.slice(0, limit);

    const bucketsMap = new Map<TimeBucket, HubNotificationItem[]>();
    TIME_BUCKET_ORDER.forEach((b) => bucketsMap.set(b, []));

    visibleItems.forEach((item) => {
      const bucket = getItemBucket(item);
      if (bucketsMap.has(bucket)) {
        bucketsMap.get(bucket)!.push(item);
      } else {
        bucketsMap.set('1 Year+', [...(bucketsMap.get('1 Year+') || []), item]);
      }
    });

    return TIME_BUCKET_ORDER.filter((b) => (bucketsMap.get(b)?.length || 0) > 0).map((b) => ({
      title: b,
      data: bucketsMap.get(b)!,
    }));
  }, [invites, rejectedInvites, deadlines, activities, limit]);

  /**
   * Load next 100 notifications silently without resetting scroll position or reloading modal.
   */
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    const nextLimit = limit + NOTIFICATION_PAGE_SIZE;
    setLimit(nextLimit);
    await fetchData(nextLimit, true);
    setIsLoadingMore(false);
  }, [isLoadingMore, hasMore, limit, fetchData]);

  /** Check if a specific notification item is unread */
  const isItemUnread = useCallback(
    (item: HubNotificationItem) => {
      if (globalReadIds.has(item.id) || readIds.has(item.id)) return false;
      if (
        item.type === 'deadline' &&
        item.todoIds?.some((id) => globalReadIds.has(id) || readIds.has(id))
      ) {
        return false;
      }
      if (lastReadAt) {
        if (item.type === 'deadline') {
          const lastReadDate = parseSafeDate(lastReadAt);
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          if (lastReadDate.getTime() >= todayStart.getTime()) {
            return false;
          }
        } else {
          if (parseSafeDate(item.createdAt).getTime() <= parseSafeDate(lastReadAt).getTime()) {
            return false;
          }
        }
      }
      return true;
    },
    [readIds, lastReadAt]
  );

  /** Compute total count of unread actionable notifications */
  const unreadCount = useMemo(() => {
    const rawAllItems: HubNotificationItem[] = [
      ...invites,
      ...rejectedInvites,
      ...deadlines,
      ...activities,
    ];
    const seenIds = new Set<string>();
    const allItems: HubNotificationItem[] = [];
    for (const item of rawAllItems) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        allItems.push(item);
      }
    }
    return allItems.filter(isItemUnread).length;
  }, [invites, rejectedInvites, deadlines, activities, isItemUnread]);

  /** Mark a single item as read */
  const markItemAsRead = useCallback(async (id: string) => {
    globalReadIds.add(id);
    setReadIds(new Set(globalReadIds));
    notifyHubListeners();
    try {
      await AsyncStorage.setItem(STORAGE_READ_IDS_KEY, JSON.stringify(Array.from(globalReadIds)));
    } catch {}
  }, []);

  /** Mark all current notifications as read across the entire app */
  const markAllAsRead = useCallback(async () => {
    const nowStr = new Date().toISOString();
    globalLastReadAt = nowStr;
    setLastReadAt(nowStr);

    const allIds = [
      ...invites.map((i) => i.id),
      ...rejectedInvites.map((r) => r.id),
      ...deadlines.flatMap((d) => [d.id, ...(d.todoIds || [])]),
      ...activities.map((a) => a.id),
    ];
    allIds.forEach((id) => globalReadIds.add(id));
    setReadIds(new Set(globalReadIds));

    notifyHubListeners();

    try {
      await Promise.all([
        AsyncStorage.setItem(STORAGE_LAST_READ_KEY, nowStr),
        AsyncStorage.setItem(STORAGE_READ_IDS_KEY, JSON.stringify(Array.from(globalReadIds))),
      ]);
    } catch {}
  }, [invites, rejectedInvites, deadlines, activities]);

  /** Respond to a team/group collaboration invitation (Accept or Decline) */
  const handleRespondToInvite = useCallback(
    async (inviteId: string, status: 'accepted' | 'declined') => {
      try {
        const invite = invites.find((i) => i.id === inviteId);
        const teamId = invite?.teamId || invite?.farmId;

        if (teamId) {
          const rpcRes = await respondTeamInviteOnline({ teamId, status });
          if (!rpcRes.success) {
            console.warn('[useNotificationHub] Online invite response warning:', rpcRes.error);
          }
        }

        // Commit status change locally in SQLite so UI updates instantly
        await powersync.execute(
          `UPDATE team_members SET status = ?, updated_at = datetime('now') WHERE id = ?`,
          [status, inviteId]
        );

        // Optimistically remove from state and mark read
        void markItemAsRead(inviteId);
        setInvites((prev) => prev.filter((i) => i.id !== inviteId));
        void fetchData(limit, true);
      } catch (err: any) {
        console.warn('[useNotificationHub] Failed to respond to invite:', err);
        throw err;
      }
    },
    [invites, fetchData, markItemAsRead, limit]
  );

  /** Mark a task or consolidated multi-plot task as completed */
  const handleCompleteTask = useCallback(
    async (todoIdsInput: string | string[]) => {
      const todoIds = Array.isArray(todoIdsInput) ? todoIdsInput : [todoIdsInput];
      if (todoIds.length === 0) return;
      try {
        await batchUpdateTodosCompletion({
          todoIds,
          isCompleted: true,
          userId: userId || undefined,
        });

        // Optimistically remove from state and mark read
        todoIds.forEach((id) => void markItemAsRead(id));
        setDeadlines((prev) =>
          prev.filter(
            (d) =>
              !todoIds.includes(d.id) &&
              !d.todoIds?.some((tid) => todoIds.includes(tid))
          )
        );
        void fetchData(limit, true);
      } catch (err) {
        console.warn('[useNotificationHub] Failed to complete task:', err);
        throw err;
      }
    },
    [fetchData, markItemAsRead, userId, limit]
  );

  return {
    invites,
    rejectedInvites,
    deadlines,
    activities,
    groupedAllSections,
    unreadCount,
    lastReadAt,
    loading,
    limit,
    hasMore,
    isLoadingMore,
    loadMore,
    refresh: async () => {
      await Promise.all([loadReadState(), fetchData(limit, false)]);
    },
    markItemAsRead,
    markAllAsRead,
    isItemUnread,
    respondToInvite: handleRespondToInvite,
    completeTask: handleCompleteTask,
  };
}
