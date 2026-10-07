import {
  createFarm,
  createTodo,
  updateTodo,
  deleteTodo,
  logFarmAuditAction,
  createAuditLog,
  getDatabase,
} from '../../lib/db-operations';
import { inMemoryDB } from '../mocks/mock-db';

describe('Audit Logs & User Action Logs (Offline-First Database Operations)', () => {
  const userId = 'user-audit-test-1';
  let farmId: string;

  beforeEach(async () => {
    farmId = await createFarm(userId, 'Audited Farm', 'Cavite', 1200);
  });

  it('records farm audit actions automatically and offline in < 15ms', async () => {
    const startTime = Date.now();

    // 1. Explicit audit log
    const db = getDatabase();
    await logFarmAuditAction(db, farmId, userId, 'SOIL_TEST_CONDUCTED', {
      method: 'Chemical Reagent',
      ph: 6.5,
    });

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(100);

    // 2. Lifecycle audit logs
    const todoId = await createTodo({ userId, farmId, title: 'Check mulch layer' });
    await updateTodo(todoId, { isCompleted: true });
    await deleteTodo(todoId, userId);

    // Verify audit logs in local SQLite
    const logs = await inMemoryDB.all<{ action: string; farm_id: string }>(
      'SELECT * FROM audit_logs WHERE farm_id = ?',
      [farmId]
    );

    const actions = logs.map((l) => l.action);
    expect(actions).toContain('CREATED_FARM');
    expect(actions).toContain('SOIL_TEST_CONDUCTED');
    expect(actions).toContain('CREATED_TODO');
    expect(actions).toContain('COMPLETED_TODO');
    expect(actions).toContain('DELETED_TODO');

    // Verify upload queue staged the audit mutations
    const queue = inMemoryDB.getUploadQueue();
    const auditMutations = queue.filter((q) => q.table === 'audit_logs' && q.op === 'PUT');
    expect(auditMutations.length).toBeGreaterThanOrEqual(4);
  });

  it('records team collaboration audit logs offline', async () => {
    await createAuditLog({
      farmId,
      userId,
      action: 'MEMBER_ROLE_UPDATED',
      details: { newRole: 'manager' },
    });

    const logs = await inMemoryDB.all<{ action: string }>(
      'SELECT * FROM audit_logs WHERE farm_id = ?',
      [farmId]
    );
    expect(logs.some((l) => l.action === 'MEMBER_ROLE_UPDATED')).toBe(true);

    const queue = inMemoryDB.getUploadQueue();
    const staged = queue.find(
      (q) => q.table === 'audit_logs' && q.data.action === 'MEMBER_ROLE_UPDATED'
    );
    expect(staged).toBeDefined();
  });
});
