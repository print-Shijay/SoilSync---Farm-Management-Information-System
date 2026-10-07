import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { isPermissionAllowed, requestAppPermission } from '../permissions';
import { powersync } from '../powersync';

// Keys for local persistence
const STORAGE_MORNING_NOTIF_ID = 'soilsync:scheduled_morning_id';
const STORAGE_EVENING_NOTIF_ID = 'soilsync:scheduled_evening_id';
export const STORAGE_LAST_SENT_SLOT = 'soilsync:last_sent_notif_slot';

let handlerInitialized = false;

// In-memory mutex to prevent concurrent checkAndDispatch calls from racing
let _dispatchLock: Promise<boolean> | null = null;

export type NotificationSlotType = 'morning' | 'evening';

export interface NotificationSlotInfo {
  slot: NotificationSlotType;
  slotKey: string;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function getLocalDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Calculates current active reminder slot:
 * - Slot 1 (morning): 05:00:00 to 16:59:59 (e.g. 2026-09-17_morning)
 * - Slot 2 (evening): 17:00:00 to 04:59:59 next day (e.g. 2026-09-17_evening)
 */
export function getCurrentNotificationSlot(now: Date = new Date()): NotificationSlotInfo {
  const hour = now.getHours();

  if (hour >= 5 && hour < 17) {
    // 5:00 AM to 4:59:59 PM -> Slot 1
    const todayKey = getLocalDateKey(now);
    return { slot: 'morning', slotKey: `${todayKey}_morning` };
  } else if (hour >= 17) {
    // 5:00 PM to 11:59:59 PM -> Slot 2
    const todayKey = getLocalDateKey(now);
    return { slot: 'evening', slotKey: `${todayKey}_evening` };
  } else {
    // 12:00 AM to 4:59:59 AM -> Continues Slot 2 from previous evening
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = getLocalDateKey(yesterday);
    return { slot: 'evening', slotKey: `${yesterdayKey}_evening` };
  }
}

/**
 * Configure expo-notifications global handler, Android notification channels,
 * and delivery tracking listeners.
 */
export function initNotificationService() {
  if (handlerInitialized) return;
  handlerInitialized = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync('soilsync-reminders', {
      name: 'Daily Farm Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#8C4522',
      sound: 'default',
    });

    void Notifications.setNotificationChannelAsync('soilsync-activity', {
      name: 'Farm Team & Activity',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#729E3B',
      sound: 'default',
    });
  }

  // Record slot delivery when OS alarm fires while app is in foreground or background
  Notifications.addNotificationReceivedListener((notification) => {
    const data = notification.request.content.data;
    if (data?.slotKey) {
      void AsyncStorage.setItem(STORAGE_LAST_SENT_SLOT, String(data.slotKey));
    } else if (data?.type === 'morning_briefing' || data?.type === 'evening_wrapup') {
      const current = getCurrentNotificationSlot();
      void AsyncStorage.setItem(STORAGE_LAST_SENT_SLOT, current.slotKey);
    }
  });

  Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    handleNotificationResponseData(data);
  });
}

/**
 * Handles incoming notification tap payloads, updating local slot records
 * and routing to corresponding screens (e.g. AI crop planner).
 */
export function handleNotificationResponseData(data?: Record<string, any>) {
  if (!data) return;

  if (data.slotKey) {
    void AsyncStorage.setItem(STORAGE_LAST_SENT_SLOT, String(data.slotKey));
  } else if (data.type === 'morning_briefing' || data.type === 'evening_wrapup') {
    const current = getCurrentNotificationSlot();
    void AsyncStorage.setItem(STORAGE_LAST_SENT_SLOT, current.slotKey);
  }

  if (data.type === 'ai_crop_plan_ready' && data.farmId) {
    console.log(`[NotificationService] Received tap for AI crop plan on farm ${data.farmId}`);
    try {
      router.push(`/farm/planner/${data.farmId}?jobId=${data.jobId || ''}&fromNotif=1` as any);
    } catch (err) {
      console.warn('[NotificationService] Failed to navigate on notification tap:', err);
    }
  }
}

/**
 * Request notification permissions from device OS and update local preference.
 */
export async function ensureNotificationPermissions(): Promise<boolean> {
  const result = await requestAppPermission('notifications');
  return result.granted;
}

/**
 * Send an immediate local notification (e.g. for farm invite or task completion).
 */
export async function sendInstantNotification(
  title: string,
  body: string,
  data?: Record<string, any>,
  channelId: 'soilsync-reminders' | 'soilsync-activity' = 'soilsync-activity'
): Promise<string | null> {
  try {
    initNotificationService();

    const allowed = await isPermissionAllowed('notifications');
    if (!allowed) {
      console.log('[NotificationService] Notifications not allowed by user settings');
      return null;
    }

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        data: data || {},
        ...(Platform.OS === 'android' ? { channelId } : {}),
      },
      trigger: null, // Send immediately
    });

    return id;
  } catch (error) {
    console.warn('[NotificationService] Failed to send instant notification:', error);
    return null;
  }
}

export interface ReminderContent {
  morningTitle: string;
  morningBody: string;
  eveningTitle: string;
  eveningBody: string;
}

/**
 * Reads user tasks from SQLite via PowerSync and constructs dynamic morning & evening texts.
 */
export async function buildReminderContent(userId: string): Promise<ReminderContent> {
  const defaultResult: ReminderContent = {
    morningTitle: '🌅 Morning Farm Briefing',
    morningBody: 'All clear! No pending farm tasks scheduled for today.',
    eveningTitle: '🌾 Evening Tasks Wrap-up',
    eveningBody: '🎉 Great job! All farm tasks for today have been completed.',
  };

  if (!userId) return defaultResult;

  try {
    // Query active incomplete tasks for all user farms (owned + member where status='accepted')
    const tasks = await powersync.getAll<any>(
      `
      SELECT 
        t.id, 
        t.title, 
        t.due_date, 
        t.start_date, 
        t.farm_id, 
        f.farm_name
      FROM todos t
      JOIN farms f ON t.farm_id = f.id
      WHERE (
        f.user_id = ? 
        OR EXISTS (
          SELECT 1 FROM team_farms tf 
          JOIN team_members tm ON tm.team_id = tf.team_id 
          WHERE tf.farm_id = f.id AND tm.user_id = ? AND tm.status = 'accepted'
        )
      )
        AND (t.is_completed = 0 OR t.is_completed = '0')
      ORDER BY COALESCE(t.due_date, t.start_date) ASC
      `,
      [userId, userId]
    );

    const todayKey = getLocalDateKey();
    const todayTasks = (tasks || []).filter((t) => {
      const start = (t.start_date || t.due_date || todayKey).slice(0, 10);
      const due = (t.due_date || start).slice(0, 10);
      return todayKey >= start && todayKey <= due;
    });

    const overdueTasks = (tasks || []).filter((t) => {
      const due = (t.due_date || t.start_date || '').slice(0, 10);
      return due && due < todayKey;
    });

    // Group tasks by farm and title so multi-plot crop plan tasks are counted as 1 distinct task
    const groupTasks = (taskList: any[]) => {
      const map = new Map<string, { title: string; farm_name: string; count: number }>();
      taskList.forEach((t) => {
        const key = `${t.farm_id}|${t.title}|${t.start_date || ''}|${t.due_date || ''}`;
        if (!map.has(key)) {
          map.set(key, { title: t.title, farm_name: t.farm_name || 'Farm', count: 0 });
        }
        map.get(key)!.count++;
      });
      return Array.from(map.values());
    };

    const groupedToday = groupTasks(todayTasks);
    const groupedOverdue = groupTasks(overdueTasks);

    // Unique farm names
    const farmNamesSet = new Set<string>();
    (tasks || []).forEach((t) => {
      if (t.farm_name) farmNamesSet.add(t.farm_name);
    });
    const farmCount = farmNamesSet.size;

    // 1. Build 5:00 AM Morning Briefing Content
    let morningTitle = '🌅 Morning Farm Briefing';
    let morningBody = 'All clear! No pending farm tasks scheduled for today.';

    if (groupedToday.length === 1) {
      const single = groupedToday[0];
      const plotInfo = single.count > 1 ? ` across ${single.count} plots` : '';
      morningBody = `🌱 1 task today: "${single.title}" (${single.farm_name}${plotInfo}).`;
    } else if (groupedToday.length === 2) {
      morningBody = `🌱 2 tasks today: "${groupedToday[0].title}" & "${groupedToday[1].title}".`;
    } else if (groupedToday.length > 2) {
      morningTitle = `🌅 Morning Briefing: ${groupedToday.length} Tasks Today`;
      const sampleTitles = `"${groupedToday[0].title}", "${groupedToday[1].title}"`;
      morningBody = `🌱 ${groupedToday.length} tasks across ${farmCount || 1} farm${farmCount === 1 ? '' : 's'} • Priority: ${sampleTitles} • Tap to view agenda.`;
    } else if (groupedOverdue.length > 0) {
      morningBody = `⚠️ No tasks due today, but you have ${groupedOverdue.length} overdue task${groupedOverdue.length === 1 ? '' : 's'} needing attention.`;
    }

    // 2. Build 5:00 PM Evening Wrap-up Content
    let eveningTitle = '🌾 Evening Tasks Wrap-up';
    let eveningBody = '🎉 Great job! All farm tasks for today have been completed.';

    if (groupedOverdue.length > 0 && groupedToday.length > 0) {
      const totalUrgent = groupedOverdue.length + groupedToday.length;
      eveningTitle = `⚠️ Task Reminder: ${totalUrgent} Tasks Need Attention`;
      const sample = groupedOverdue[0]?.title || groupedToday[0]?.title || 'Farm task';
      eveningBody = `⚠️ ${groupedOverdue.length} overdue, ${groupedToday.length} due today • Urgent: "${sample}" • Tap to review and complete.`;
    } else if (groupedToday.length > 0) {
      eveningTitle = `🌾 Evening Tasks Wrap-up: ${groupedToday.length} Pending`;
      const sample = groupedToday[0]?.title || 'Farm task';
      eveningBody = `You still have ${groupedToday.length} task${groupedToday.length === 1 ? '' : 's'} remaining today: "${sample}".`;
    } else if (groupedOverdue.length > 0) {
      eveningTitle = `⚠️ Overdue Tasks Notice: ${groupedOverdue.length} Pending`;
      const sample = groupedOverdue[0]?.title || 'Farm task';
      eveningBody = `You have ${groupedOverdue.length} overdue task${groupedOverdue.length === 1 ? '' : 's'} needing your attention: "${sample}".`;
    }

    return { morningTitle, morningBody, eveningTitle, eveningBody };
  } catch (err) {
    console.warn('[NotificationService] Failed to build reminder content:', err);
    return defaultResult;
  }
}

/**
 * Checks if the notification for the current time slot (5:00 AM - 4:59 PM or 5:00 PM - 4:59 AM)
 * has already been dispatched.
 * If not yet dispatched, sends it once (even if late, e.g. at 7:00 AM or 8:00 PM).
 * If the time is 5:00 PM onwards, it will NEVER send the 5:00 AM notification anymore.
 *
 * Uses an in-memory lock to prevent concurrent callers from racing and dispatching duplicates.
 */
export function checkAndDispatchDailyReminders(userId: string): Promise<boolean> {
  if (!userId) return Promise.resolve(false);

  // Serialize concurrent calls through a single lock
  if (_dispatchLock) {
    return _dispatchLock.then(() => _checkAndDispatchDailyRemindersImpl(userId));
  }
  _dispatchLock = _checkAndDispatchDailyRemindersImpl(userId).finally(() => {
    _dispatchLock = null;
  });
  return _dispatchLock;
}

async function _checkAndDispatchDailyRemindersImpl(userId: string): Promise<boolean> {

  try {
    initNotificationService();

    const allowed = await isPermissionAllowed('notifications');
    if (!allowed) {
      return false;
    }

    const currentSlot = getCurrentNotificationSlot();
    const lastSentSlot = await AsyncStorage.getItem(STORAGE_LAST_SENT_SLOT);

    if (lastSentSlot === currentSlot.slotKey) {
      // Already sent for this active slot
      return false;
    }

    const content = await buildReminderContent(userId);

    if (currentSlot.slot === 'morning') {
      // 5:00 AM - 4:59 PM: send 5:00 AM morning briefing
      await Notifications.scheduleNotificationAsync({
        content: {
          title: content.morningTitle,
          body: content.morningBody,
          sound: true,
          data: { type: 'morning_briefing', slotKey: currentSlot.slotKey },
          ...(Platform.OS === 'android' ? { channelId: 'soilsync-reminders' } : {}),
        },
        trigger: null, // immediate dispatch
      });
      await AsyncStorage.setItem(STORAGE_LAST_SENT_SLOT, currentSlot.slotKey);
      console.log(`[NotificationService] Dispatched morning notification for slot ${currentSlot.slotKey}`);
      return true;
    } else {
      // 5:00 PM - 4:59 AM: send 5:00 PM evening wrap-up (5:00 AM notification is completely skipped!)
      await Notifications.scheduleNotificationAsync({
        content: {
          title: content.eveningTitle,
          body: content.eveningBody,
          sound: true,
          data: { type: 'evening_wrapup', slotKey: currentSlot.slotKey },
          ...(Platform.OS === 'android' ? { channelId: 'soilsync-reminders' } : {}),
        },
        trigger: null, // immediate dispatch
      });
      await AsyncStorage.setItem(STORAGE_LAST_SENT_SLOT, currentSlot.slotKey);
      console.log(`[NotificationService] Dispatched evening notification for slot ${currentSlot.slotKey}`);
      return true;
    }
  } catch (error) {
    console.warn('[NotificationService] Error in checkAndDispatchDailyReminders:', error);
    return false;
  }
}

let dailyRemindersDebounceTimer: ReturnType<typeof setTimeout> | null = null;

async function executeScheduleDailyReminders(userId: string): Promise<void> {
  try {
    initNotificationService();

    const allowed = await isPermissionAllowed('notifications');
    if (!allowed) {
      return;
    }

    const { morningTitle, morningBody, eveningTitle, eveningBody } = await buildReminderContent(userId);

    // Cancel previously scheduled reminders
    const prevMorningId = await AsyncStorage.getItem(STORAGE_MORNING_NOTIF_ID);
    if (prevMorningId) {
      try {
        await Notifications.cancelScheduledNotificationAsync(prevMorningId);
      } catch {}
    }

    const prevEveningId = await AsyncStorage.getItem(STORAGE_EVENING_NOTIF_ID);
    if (prevEveningId) {
      try {
        await Notifications.cancelScheduledNotificationAsync(prevEveningId);
      } catch {}
    }

    // Schedule 5:00 AM trigger (daily recurring OS alarm)
    const morningId = await Notifications.scheduleNotificationAsync({
      content: {
        title: morningTitle,
        body: morningBody,
        sound: true,
        data: { type: 'morning_briefing' },
        ...(Platform.OS === 'android' ? { channelId: 'soilsync-reminders' } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 5,
        minute: 0,
      },
    });
    await AsyncStorage.setItem(STORAGE_MORNING_NOTIF_ID, morningId);

    // Schedule 5:00 PM (17:00) trigger (daily recurring OS alarm)
    const eveningId = await Notifications.scheduleNotificationAsync({
      content: {
        title: eveningTitle,
        body: eveningBody,
        sound: true,
        data: { type: 'evening_wrapup' },
        ...(Platform.OS === 'android' ? { channelId: 'soilsync-reminders' } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 17,
        minute: 0,
      },
    });
    await AsyncStorage.setItem(STORAGE_EVENING_NOTIF_ID, eveningId);

    console.log('[NotificationService] Successfully scheduled 5:00 AM & 5:00 PM offline reminders');

    // Run catch-up check for the active slot
    await checkAndDispatchDailyReminders(userId);
  } catch (error) {
    console.warn('[NotificationService] Error scheduling daily reminders:', error);
  }
}

/**
 * Re-schedules the 5:00 AM and 5:00 PM GMT+8 daily task reminders directly into the phone OS.
 * Completely offline-first: queries SQLite on the phone and schedules native OS alarms.
 * Debounced by 1500ms to avoid hammering native alarms during rapid task updates.
 */
export async function scheduleDailyReminders(userId: string): Promise<void> {
  if (!userId) return;

  if (dailyRemindersDebounceTimer) {
    clearTimeout(dailyRemindersDebounceTimer);
  }

  dailyRemindersDebounceTimer = setTimeout(() => {
    dailyRemindersDebounceTimer = null;
    void executeScheduleDailyReminders(userId);
  }, 1500);
}
