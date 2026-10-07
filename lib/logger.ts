import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { supabase } from './supabase';
import { powersync } from './powersync';
import { generateUUID } from './local-db';

export async function logUserAction(action: string, metadata: Record<string, unknown> = {}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      // Cannot log offline actions without a user ID since RLS and schema require it.
      return;
    }

    // Attempt to fetch IP address (only works if online)
    let ipAddress = 'unknown';
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
      const response = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
      clearTimeout(timeoutId);
      if (response.ok) {
        const data = await response.json();
        ipAddress = data.ip;
      }
    } catch (e) {
      // Ignore network errors (likely offline)
    }

    const finalMetadata = {
      ...metadata,
      ip_address: ipAddress,
    };

    const id = generateUUID();
    const platform = Platform.OS;
    const appVersion = Application.nativeApplicationVersion || 'unknown';

    // Insert into local SQLite table. PowerSync will queue and upload this when online.
    await powersync.execute(
      `INSERT INTO user_action_logs (id, user_id, action, platform, app_version, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        id,
        user.id,
        action,
        platform,
        appVersion,
        JSON.stringify(finalMetadata),
      ]
    );
  } catch (error) {
    console.warn('[Logger] Failed to log user action:', error);
  }
}
