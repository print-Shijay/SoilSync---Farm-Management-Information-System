import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../AuthContext';
import { powersync } from '../powersync';
import {
  initNotificationService,
  scheduleDailyReminders,
  checkAndDispatchDailyReminders,
  sendInstantNotification,
} from '../notifications/notification-service';

/**
 * ============================================================================
 * LOCAL NOTIFICATION LISTENER
 * ============================================================================
 * 
 * Top-level background listener coordinating device-native push/banner alerts:
 * 1. Farm Collaboration Invites:
 *    Listens for pending invites assigned to the current user and triggers an
 *    instant OS alert with farm name and inviting owner details.
 * 
 * 2. Real-Time Team Task Completions:
 *    Listens for `COMPLETED_TODO` audit log entries created by other teammates
 *    on any shared farm the user belongs to, sending a celebratory instant alert.
 * 
 * 3. Daily Scheduled Briefings:
 *    Maintains the 5:00 AM (morning task briefing) & 5:00 PM (evening wrap-up)
 *    offline OS alarms, refreshing them whenever task completion states change.
 *    Also ensures catch-up delivery for active time slot (5am-4:59pm & 5pm-4:59am).
 * ============================================================================
 */

const STORAGE_NOTIFIED_INVITES = 'soilsync:notified_invite_ids';
const STORAGE_NOTIFIED_DECLINED_INVITES = 'soilsync:notified_declined_invite_ids_v1';
const STORAGE_NOTIFIED_TODOS = 'soilsync:notified_completed_todo_ids';

export function useLocalNotificationListener() {
  const { session } = useAuth();
  const userId = session?.user?.id;

  // Independent initialization flags so historical notifications aren't re-alerted on app launch
  const isInvitesInitializedRef = useRef(false);
  const isDeclinedInvitesInitializedRef = useRef(false);
  const isTasksInitializedRef = useRef(false);

  useEffect(() => {
    initNotificationService();

    if (!userId) return;

    // 1. Re-calculate and schedule 5:00 AM & 5:00 PM daily task reminders on mount
    // scheduleDailyReminders internally calls checkAndDispatchDailyReminders for catch-up
    void scheduleDailyReminders(userId);

    // Re-check slot reminders when user returns to app
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && userId) {
        void checkAndDispatchDailyReminders(userId);
      }
    });

    const abortController = new AbortController();

    // 2. Watch for new team/group invites assigned to current user
    async function watchInvites() {
      try {
        // Use lightweight sentinel watch query to avoid heavy 3-way table joins on every heartbeat
        for await (const _ of powersync.watch(
          `SELECT id FROM team_members WHERE user_id = ? AND status = 'pending'`,
          [userId],
          { signal: abortController.signal }
        )) {
          try {
            const rawStored = await AsyncStorage.getItem(STORAGE_NOTIFIED_INVITES);
            const notifiedSet: Record<string, boolean> = rawStored ? JSON.parse(rawStored) : {};

            const pendingInvites = await powersync.getAll<any>(
              `
              SELECT 
                tm.id, 
                tm.role, 
                COALESCE(tm.team_name, t.name) as team_name, 
                COALESCE(tm.inviter_name, u.username, u.first_name || ' ' || u.last_name, u.email) as inviter_name,
                u.username,
                u.first_name, 
                u.last_name, 
                u.email
              FROM team_members tm
              LEFT JOIN teams t ON tm.team_id = t.id
              LEFT JOIN users u ON u.id = COALESCE(tm.invited_by, t.owner_id)
              WHERE tm.user_id = ? AND tm.status = 'pending'
              `,
              [userId]
            );

            // On first app load, record existing pending invites to prevent a barrage of old alerts
            if (!isInvitesInitializedRef.current) {
              pendingInvites.forEach((inv) => {
                notifiedSet[inv.id] = true;
              });
              await AsyncStorage.setItem(STORAGE_NOTIFIED_INVITES, JSON.stringify(notifiedSet));
              isInvitesInitializedRef.current = true;
            } else {
              for (const inv of pendingInvites) {
                if (!notifiedSet[inv.id]) {
                  notifiedSet[inv.id] = true;
                  const nameParts = [inv.first_name, inv.last_name].filter(Boolean);
                  const fullName = nameParts.length > 0 ? nameParts.join(' ') : null;
                  const ownerName = inv.inviter_name || inv.username || fullName || inv.email || 'Someone';
                  const teamName = inv.team_name || 'the group';

                  void sendInstantNotification(
                    '📬 Team Collaboration Invite',
                    `${ownerName} invited you to be part of the group "${teamName}". Tap to respond.`,
                    { type: 'team_invite', inviteId: inv.id },
                    'soilsync-activity'
                  );
                }
              }
              await AsyncStorage.setItem(STORAGE_NOTIFIED_INVITES, JSON.stringify(notifiedSet));
            }
          } catch (e) {
            console.warn('[useLocalNotificationListener] Error checking invites:', e);
          }
        }
      } catch {}
    }

    // 3. Watch for completed tasks by teammates on shared farms
    async function watchCompletedTasks() {
      try {
        // Lightweight sentinel watch query triggering only when a new task completion log appears
        for await (const _ of powersync.watch(
          `SELECT id FROM audit_logs WHERE action = 'COMPLETED_TODO' ORDER BY created_at DESC LIMIT 1`,
          [],
          { signal: abortController.signal }
        )) {
          try {
            const rawStored = await AsyncStorage.getItem(STORAGE_NOTIFIED_TODOS);
            const notifiedSet: Record<string, boolean> = rawStored ? JSON.parse(rawStored) : {};

            const recentCompleted = await powersync.getAll<any>(
              `
              SELECT 
                al.id, 
                al.user_id, 
                al.details, 
                al.created_at, 
                f.farm_name, 
                u.first_name, 
                u.last_name, 
                u.email
              FROM audit_logs al
              JOIN farms f ON al.farm_id = f.id
              LEFT JOIN users u ON al.user_id = u.id
              WHERE (
                f.user_id = ? 
                OR EXISTS (
                  SELECT 1 FROM team_farms tf 
                  JOIN team_members tm ON tm.team_id = tf.team_id 
                  WHERE tf.farm_id = f.id AND tm.user_id = ? AND tm.status = 'accepted'
                )
              )
                AND al.action = 'COMPLETED_TODO'
              ORDER BY al.created_at DESC
              LIMIT 10
              `,
              [userId, userId]
            );

            // On first load, record existing completed tasks to avoid notifications for past tasks
            if (!isTasksInitializedRef.current) {
              recentCompleted.forEach((l) => {
                notifiedSet[l.id] = true;
              });
              await AsyncStorage.setItem(STORAGE_NOTIFIED_TODOS, JSON.stringify(notifiedSet));
              isTasksInitializedRef.current = true;
            } else {
              // Group and deduplicate rapid incoming logs by user, farm, and title to prevent push notification spam
              const pendingNotificationMap = new Map<
                string,
                {
                  logId: string;
                  userName: string;
                  farmName: string;
                  taskTitle: string;
                  plotsCount: number;
                  plotNames: string[];
                }
              >();

              for (const log of recentCompleted) {
                // Ignore if the current user completed their own task
                if (log.user_id === userId) continue;

                if (!notifiedSet[log.id]) {
                  notifiedSet[log.id] = true;

                  const nameParts = [log.first_name, log.last_name].filter(Boolean);
                  const userName = nameParts.length > 0 ? nameParts.join(' ') : log.email || 'A team member';
                  const farmName = log.farm_name || 'Farm';

                  let detailsObj: any = {};
                  if (typeof log.details === 'string') {
                    try {
                      detailsObj = JSON.parse(log.details);
                    } catch {}
                  } else if (typeof log.details === 'object' && log.details !== null) {
                    detailsObj = log.details;
                  }

                  const taskTitle = detailsObj.title || 'a task';
                  const groupKey = `${log.user_id}|${farmName}|${taskTitle}`;

                  if (!pendingNotificationMap.has(groupKey)) {
                    pendingNotificationMap.set(groupKey, {
                      logId: log.id,
                      userName,
                      farmName,
                      taskTitle,
                      plotsCount: detailsObj.plotsCount || 1,
                      plotNames: detailsObj.plotNames || [],
                    });
                  } else {
                    const existing = pendingNotificationMap.get(groupKey)!;
                    existing.plotsCount += detailsObj.plotsCount || 1;
                    if (Array.isArray(detailsObj.plotNames)) {
                      existing.plotNames = Array.from(
                        new Set([...existing.plotNames, ...detailsObj.plotNames])
                      );
                    }
                  }
                }
              }

              for (const notif of pendingNotificationMap.values()) {
                const plotsText =
                  notif.plotsCount > 1
                    ? ` across ${notif.plotsCount} plots`
                    : notif.plotNames[0]
                    ? ` on ${notif.plotNames[0]}`
                    : '';

                void sendInstantNotification(
                  `✅ Task Completed • ${notif.farmName}`,
                  `${notif.userName} completed "${notif.taskTitle}"${plotsText}.`,
                  { type: 'task_completed', logId: notif.logId },
                  'soilsync-activity'
                );
              }

              await AsyncStorage.setItem(STORAGE_NOTIFIED_TODOS, JSON.stringify(notifiedSet));

              // Keep daily morning/evening reminders up-to-date with latest completed task counts
              if (pendingNotificationMap.size > 0 && userId) {
                void scheduleDailyReminders(userId);
              }
            }
          } catch (e) {
            console.warn('[useLocalNotificationListener] Error checking completed tasks:', e);
          }
        }
      } catch {}
    }

    // 4. Watch for rejected team/group invites sent by current user
    async function watchRejectedInvites() {
      try {
        for await (const _ of powersync.watch(
          `SELECT id FROM team_members 
           WHERE status = 'declined' 
             AND (invited_by = ? OR (invited_by IS NULL AND team_id IN (SELECT id FROM teams WHERE owner_id = ?)))`,
          [userId, userId],
          { signal: abortController.signal }
        )) {
          try {
            const rawStored = await AsyncStorage.getItem(STORAGE_NOTIFIED_DECLINED_INVITES);
            const notifiedSet: Record<string, boolean> = rawStored ? JSON.parse(rawStored) : {};

            const declinedRows = await powersync.getAll<any>(
              `
              SELECT 
                tm.id, 
                tm.team_id,
                tm.user_id,
                COALESCE(tm.member_name, u.username, u.first_name || ' ' || u.last_name, u.email, 'Someone') as rejecter_name,
                COALESCE(tm.team_name, t.name, 'Group') as group_name
              FROM team_members tm
              LEFT JOIN teams t ON tm.team_id = t.id
              LEFT JOIN users u ON u.id = tm.user_id
              WHERE tm.status = 'declined'
                AND (tm.invited_by = ? OR (tm.invited_by IS NULL AND t.owner_id = ?))
                AND tm.user_id != ?
              `,
              [userId, userId, userId]
            );

            // On first app load, mark existing declined invites as notified so historical rejections don't spam
            if (!isDeclinedInvitesInitializedRef.current) {
              declinedRows.forEach((row) => {
                notifiedSet[row.id] = true;
              });
              await AsyncStorage.setItem(STORAGE_NOTIFIED_DECLINED_INVITES, JSON.stringify(notifiedSet));
              isDeclinedInvitesInitializedRef.current = true;
            } else {
              for (const row of declinedRows) {
                if (!notifiedSet[row.id]) {
                  notifiedSet[row.id] = true;
                  const rejecterName = row.rejecter_name || 'Someone';
                  const groupName = row.group_name || 'Group';

                  void sendInstantNotification(
                    'Invitation Declined',
                    `${rejecterName} rejected your invitation to manage Group ${groupName}`,
                    { type: 'team_invite_rejected', teamId: row.team_id },
                    'soilsync-activity'
                  );
                }
              }
              await AsyncStorage.setItem(STORAGE_NOTIFIED_DECLINED_INVITES, JSON.stringify(notifiedSet));
            }
          } catch (e) {
            console.warn('[useLocalNotificationListener] Error checking declined invites:', e);
          }
        }
      } catch {}
    }

    void watchInvites();
    void watchCompletedTasks();
    void watchRejectedInvites();

    return () => {
      abortController.abort();
      appStateSub.remove();
    };
  }, [userId]);
}
