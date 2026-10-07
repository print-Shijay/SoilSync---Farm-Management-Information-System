import {
  updateFarmMemberStatus,
  deleteFarmMember,
  createAuditLog,
} from '../../lib/db-operations';
import { inMemoryDB } from '../mocks/mock-db';

describe('Farm Members & Audit Logs (Offline-First Database Operations)', () => {
  const farmId = 'farm-member-test-1';
  const farmOwnerId = 'owner-uuid-1';
  const memberUserId = 'member-uuid-2';
  const memberId = 'farm-member-row-1';

  beforeEach(async () => {
    // Seed initial farm member locally
    await inMemoryDB.run(
      `INSERT INTO farm_members (id, farm_id, farm_owner_id, user_id, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'member', 'pending', datetime('now'), datetime('now'))`,
      [memberId, farmId, farmOwnerId, memberUserId]
    );
  });

  it('accepts an invite 100% offline and creates an audit log entry', async () => {
    await updateFarmMemberStatus({
      memberId,
      status: 'accepted',
      farmId,
      farmOwnerId,
      currentUserId: memberUserId,
    });

    // 1. Verify status updated in local SQLite
    const member = await inMemoryDB.get<{ status: string }>(
      'SELECT status FROM farm_members WHERE id = ?',
      [memberId]
    );
    expect(member?.status).toBe('accepted');

    // 2. Verify audit log entry was created locally
    const auditLogs = await inMemoryDB.all<{ action: string; farm_id: string }>(
      'SELECT * FROM audit_logs WHERE farm_id = ?',
      [farmId]
    );
    expect(auditLogs.length).toBeGreaterThanOrEqual(1);
    expect(auditLogs.some((l) => l.action === 'MEMBER_JOINED')).toBe(true);

    // 3. Verify upload queue staged both the member update and the audit log insert
    const queue = inMemoryDB.getUploadQueue();
    const memberMutation = queue.find((q) => q.table === 'farm_members' && q.id === memberId && q.op === 'PATCH');
    expect(memberMutation).toBeDefined();
    expect(memberMutation?.op).toBe('PATCH');

    const auditMutation = queue.find((q) => q.table === 'audit_logs');
    expect(auditMutation).toBeDefined();
    expect(auditMutation?.op).toBe('PUT');
  });

  it('removes a farm member 100% offline without network errors', async () => {
    await deleteFarmMember({
      memberId,
      farmId,
      farmOwnerId,
      currentUserId: farmOwnerId,
      removedUserId: memberUserId,
    });

    // 1. Verify record is deleted locally
    const member = await inMemoryDB.get('SELECT * FROM farm_members WHERE id = ?', [memberId]);
    expect(member).toBeNull();

    // 2. Verify DELETE mutation enqueued
    const queue = inMemoryDB.getUploadQueue();
    const deleteMutation = queue.find(
      (q) => q.table === 'farm_members' && q.id === memberId && q.op === 'DELETE'
    );
    expect(deleteMutation).toBeDefined();
    expect(deleteMutation?.op).toBe('DELETE');

    // 3. Verify MEMBER_REMOVED audit log enqueued
    const auditMutation = queue.find(
      (q) => q.table === 'audit_logs' && q.data.action === 'MEMBER_REMOVED'
    );
    expect(auditMutation).toBeDefined();
  });
});
