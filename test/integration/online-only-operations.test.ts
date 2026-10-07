import { supabase } from '../../lib/supabase';
import { inMemoryDB } from '../mocks/mock-db';
import {
  sendCertificateEmailViaResend,
  updateUserPhoneNumber,
  type UserCertificateRecord,
} from '../../lib/db-operations';
import { getMonthlyAiUsage, recordAiGenerationUsage } from '../../lib/ai-usage-limit';
import { checkIsOrganicFarmPartner, setCachedPartnerStatus } from '../../lib/partner';

describe('Strictly Online-Only Operations (Online vs. Offline Guards & Anti-Tamper Enforcement)', () => {
  const userId = 'online-test-user-uuid';
  const testEmail = 'farmer@soilsync.test';

  const mockCert: UserCertificateRecord = {
    id: 'cert-online-test-1',
    user_id: userId,
    recipient_name: 'Maria Santos',
    first_name: 'Maria',
    last_name: 'Santos',
    email: testEmail,
    certificate_code: 'SOIL-CERT-TEST-2026',
    total_modules: 6,
    total_stars: 18,
    issue_date: new Date().toISOString(),
    status: 'issued',
    created_at: new Date().toISOString(),
  };

  afterEach(() => {
    inMemoryDB.setOnline(false);
  });

  // ─── 1. Auth & Credentials ──────────────────────────────────────────
  describe('1. Auth & Credentials (Sign In / Sign Up / Password Reset)', () => {
    it('blocks sign up and sign in when offline', async () => {
      inMemoryDB.setOnline(false);

      const signUpRes = await supabase.auth.signUp({
        email: testEmail,
        password: 'Password123!',
      });
      expect(signUpRes.error).toBeDefined();
      expect(signUpRes.error?.message).toContain('[OFFLINE]');

      const signInRes = await supabase.auth.signInWithPassword({
        email: testEmail,
        password: 'Password123!',
      });
      expect(signInRes.error).toBeDefined();
      expect(signInRes.error?.message).toContain('[OFFLINE]');
    });

    it('allows sign up and sign in when online', async () => {
      inMemoryDB.setOnline(true);

      const signUpRes = await supabase.auth.signUp({
        email: testEmail,
        password: 'Password123!',
      });
      expect(signUpRes.error).toBeNull();
      expect(signUpRes.data.user?.id).toBeDefined();

      const signInRes = await supabase.auth.signInWithPassword({
        email: testEmail,
        password: 'Password123!',
      });
      expect(signInRes.error).toBeNull();
      expect(signInRes.data.user?.email).toBe(testEmail);
    });

    it('blocks password change and reset when offline, succeeds when online', async () => {
      inMemoryDB.setOnline(false);
      const offlineUpdate = await supabase.auth.updateUser({ password: 'NewSecurePass123!' });
      expect(offlineUpdate.error).toBeDefined();
      expect(offlineUpdate.error?.message).toContain('[OFFLINE]');

      const offlineReset = await supabase.auth.resetPasswordForEmail(testEmail);
      expect(offlineReset.error).toBeDefined();

      inMemoryDB.setOnline(true);
      const onlineUpdate = await supabase.auth.updateUser({ password: 'NewSecurePass123!' });
      expect(onlineUpdate.error).toBeNull();

      const onlineReset = await supabase.auth.resetPasswordForEmail(testEmail);
      expect(onlineReset.error).toBeNull();
    });
  });

  // ─── 2. Profile & Identity ──────────────────────────────────────────
  describe('2. Profile & Identity (User Table Mutations)', () => {
    it('throws OFFLINE_VIOLATION when attempting direct users table mutation while offline', () => {
      inMemoryDB.setOnline(false);

      expect(() => {
        supabase.from('users').update({ first_name: 'Maria Elena' });
      }).toThrow('[OFFLINE_VIOLATION]');
    });

    it('allows user profile mutation directly to Supabase when online', async () => {
      inMemoryDB.setOnline(true);

      expect(() => {
        supabase.from('users').update({ first_name: 'Maria Elena' });
      }).not.toThrow();
    });
  });

  // ─── 3. Telecom Phone & OTP Gateway ─────────────────────────────────
  describe('3. Telecom Phone & Carrier OTP (Edge Functions & Anti-Tamper)', () => {
    it('fails to invoke OTP edge functions while offline', async () => {
      inMemoryDB.setOnline(false);

      const sendOtp = await supabase.functions.invoke('verify-phone-send-otp', {
        body: { phone: '09123456789' },
      });
      expect(sendOtp.error).toBeDefined();
      expect(sendOtp.error?.message).toContain('[OFFLINE]');

      const verifyOtp = await supabase.functions.invoke('verify-phone-verify-otp', {
        body: { phone: '09123456789', otp: '123456' },
      });
      expect(verifyOtp.error).toBeDefined();
      expect(verifyOtp.error?.message).toContain('[OFFLINE]');
    });

    it('successfully invokes OTP edge functions when online', async () => {
      inMemoryDB.setOnline(true);

      const sendOtp = await supabase.functions.invoke('verify-phone-send-otp', {
        body: { phone: '09123456789' },
      });
      expect(sendOtp.error).toBeNull();
      expect(sendOtp.data?.success).toBe(true);

      const verifyOtp = await supabase.functions.invoke('verify-phone-verify-otp', {
        body: { phone: '09123456789', otp: '123456' },
      });
      expect(verifyOtp.error).toBeNull();
      expect(verifyOtp.data?.success).toBe(true);
    });

    it('anti-tamper: updateUserPhoneNumber refuses to stage local SQLite mutations without live carrier OTP', async () => {
      inMemoryDB.setOnline(false);

      await updateUserPhoneNumber(userId, '09998887777');

      const queue = inMemoryDB.getUploadQueue();
      const phoneMutation = queue.find((q) => q.table === 'users');
      expect(phoneMutation).toBeUndefined();
    });
  });

  // ─── 4. AI Usage Limits & Quota Verification ────────────────────────
  describe('4. AI Usage Quota & Anti-Tamper Limits', () => {
    it('blocks AI crop plan generation when offline by failing online quota check', async () => {
      inMemoryDB.setOnline(false);

      const usage = await getMonthlyAiUsage(userId, { requireOnline: true });
      expect(usage.verifiedOnline).toBe(false);
      expect(usage.isLimitReached).toBe(true);
      expect(usage.remaining).toBe(0);
      expect(usage.errorMessage).toContain('active internet connection is required');
    });

    it('successfully verifies quota online against Supabase single source of truth', async () => {
      inMemoryDB.setOnline(true);

      const usage = await getMonthlyAiUsage(userId, { requireOnline: true });
      expect(usage.verifiedOnline).toBe(true);
      expect(usage.isLimitReached).toBe(false);
      expect(usage.remaining).toBeGreaterThan(0);
    });

    it('blocks recording AI generation usage when offline to prevent local counter spoofing', async () => {
      inMemoryDB.setOnline(false);

      await expect(recordAiGenerationUsage(userId)).rejects.toThrow();
    });

    it('records AI generation usage directly to Supabase online when connected', async () => {
      inMemoryDB.setOnline(true);

      const result = await recordAiGenerationUsage(userId);
      expect(result.verifiedOnline).toBe(true);
    });
  });

  // ─── 5. E-Certificate Email Dispatch ────────────────────────────────
  describe('5. E-Certificate Email Dispatch (Resend API Edge Function)', () => {
    it('returns failure when dispatching certificate email while offline', async () => {
      inMemoryDB.setOnline(false);

      const res = await sendCertificateEmailViaResend(mockCert);
      expect(res.success).toBe(false);
      expect(res.message).toContain('[OFFLINE]');
    });

    it('returns success when dispatching certificate email while online', async () => {
      inMemoryDB.setOnline(true);

      const res = await sendCertificateEmailViaResend(mockCert);
      expect(res.success).toBe(true);
    });
  });

  // ─── 6. Organic Partner Verification ────────────────────────────────
  describe('6. Organic Farm Partner Verification', () => {
    it('resolves known partner emails immediately without network call', async () => {
      inMemoryDB.setOnline(false);

      const isKnownPartner = await checkIsOrganicFarmPartner('partner@soilsync.app');
      expect(isKnownPartner).toBe(true);
    });

    it('resolves cached partner status offline', async () => {
      inMemoryDB.setOnline(false);
      await setCachedPartnerStatus('cached-farmer@farm.ph', true);

      const isPartner = await checkIsOrganicFarmPartner('cached-farmer@farm.ph');
      expect(isPartner).toBe(true);
    });

    it('queries Supabase admins table when online for non-cached partner verification', async () => {
      inMemoryDB.setOnline(true);

      const isPartner = await checkIsOrganicFarmPartner('verified@partner.org');
      expect(isPartner).toBe(true);
    });

    it('fails safely without crashing when offline for unknown non-cached email', async () => {
      inMemoryDB.setOnline(false);

      const isPartner = await checkIsOrganicFarmPartner('unknown-farmer@example.com');
      expect(isPartner).toBe(false);
    });
  });

  // ─── 7. Account Lifecycle (Archive / Delete Account) ────────────────
  describe('7. Account Lifecycle (Supabase RPC archive_user_account)', () => {
    it('fails to archive/delete account when offline', async () => {
      inMemoryDB.setOnline(false);

      const res = await supabase.rpc('archive_user_account');
      expect(res.error).toBeDefined();
      expect(res.error?.message).toContain('[OFFLINE]');
    });

    it('succeeds to archive account when online', async () => {
      inMemoryDB.setOnline(true);

      const res = await supabase.rpc('archive_user_account');
      expect(res.error).toBeNull();
      expect(res.data?.success).toBe(true);
    });
  });
});
