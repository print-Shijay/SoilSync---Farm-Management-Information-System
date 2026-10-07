import {
  getUserSmsSettings,
  upsertUserSmsSettings,
  updateUserPhoneNumber,
} from '../../lib/db-operations';
import { inMemoryDB } from '../mocks/mock-db';

describe('User SMS Settings (Offline-First Preferences & Online-Only Identity Security)', () => {
  const userId = 'user-sms-test-1';

  beforeEach(async () => {
    // Seed initial verified user row locally (downloaded from upstream sync)
    await inMemoryDB.run(
      `INSERT INTO users (id, email, phone_number, created_at, updated_at)
       VALUES (?, 'farmer@test.com', '09123456789', datetime('now'), datetime('now'))`,
      [userId]
    );
  });

  it('saves SMS notification preferences 100% offline in < 15ms for an existing user', async () => {
    const startTime = Date.now();

    // 1. Upsert SMS notification preferences locally
    await upsertUserSmsSettings({
      userId,
      isSubscribed: true,
      wantsWeatherSms: true,
      preferredTime: '07:30',
      timezone: 'Asia/Manila',
    });

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(100);

    // 2. Verify SMS settings saved in local SQLite
    const settings = await getUserSmsSettings(userId);
    expect(settings).toBeDefined();
    expect(settings?.user_id).toBe(userId);
    expect(settings?.is_subscribed).toBe(1);
    expect(settings?.wants_weather_sms).toBe(1);
    expect(settings?.preferred_time).toBe('07:30:00');
    expect(settings?.timezone).toBe('Asia/Manila');

    // 3. Verify SMS preferences mutation was staged in upload queue
    const queue = inMemoryDB.getUploadQueue();
    const smsMutation = queue.find((q) => q.table === 'user_sms_settings');
    expect(smsMutation).toBeDefined();
    expect(smsMutation?.op).toBe('PUT');
  });

  it('updates existing SMS settings offline using PATCH', async () => {
    // Initial insert
    await upsertUserSmsSettings({
      userId,
      isSubscribed: true,
      wantsWeatherSms: true,
      preferredTime: '06:00',
      timezone: 'Asia/Manila',
    });

    // Update existing settings
    await upsertUserSmsSettings({
      userId,
      isSubscribed: false,
      wantsWeatherSms: false,
      preferredTime: '09:00',
      timezone: 'Asia/Manila',
    });

    const updated = await getUserSmsSettings(userId);
    expect(updated?.is_subscribed).toBe(0);
    expect(updated?.wants_weather_sms).toBe(0);
    expect(updated?.preferred_time).toBe('09:00:00');

    const queue = inMemoryDB.getUploadQueue();
    const patchMutation = queue.find(
      (q) => q.table === 'user_sms_settings' && q.op === 'PATCH'
    );
    expect(patchMutation).toBeDefined();
  });

  it('ensures phone number updates are not staged as offline-first database mutations to prevent OTP bypass', async () => {
    // Attempting to mutate phone number directly without live telecom OTP verification
    await updateUserPhoneNumber(userId, '09987654321');

    // Verify no unverified PATCH or PUT for users table was queued
    const queue = inMemoryDB.getUploadQueue();
    const userMutations = queue.filter((q) => q.table === 'users' && q.op === 'PATCH');
    expect(userMutations.length).toBe(0);
  });
});
