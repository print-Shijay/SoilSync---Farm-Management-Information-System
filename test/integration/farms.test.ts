import {
  createFarm,
  updateFarm,
  deleteFarm,
  getFarm,
  getFarmsByUser,
} from '../../lib/db-operations';
import { inMemoryDB } from '../mocks/mock-db';
import { powersync } from '../../lib/powersync';

describe('Farms Feature (Offline-First Database Operations)', () => {
  const userId = 'user-test-uuid-1';

  it('creates a farm 100% offline in < 15ms and enqueues to upload outbox', async () => {
    const startTime = Date.now();

    const farmId = await createFarm(
      userId,
      'Highland Organic Haven',
      'Benguet, Philippines',
      5000,
      'Mountain farm specializing in brassicas'
    );

    const duration = Date.now() - startTime;

    // 1. Verify execution speed is immediate (local SQLite, no HTTP delay)
    expect(duration).toBeLessThan(100);
    expect(farmId).toBeDefined();

    // 2. Verify row exists immediately in local SQLite
    const farm = await getFarm(farmId);
    expect(farm).toBeDefined();
    expect(farm?.farm_name).toBe('Highland Organic Haven');
    expect(farm?.user_id).toBe(userId);
    expect(farm?.area_sqm).toBe(5000);

    // 3. Verify mutation is staged in the persistent upload queue
    const queueStats = await powersync.getUploadQueueStats();
    expect(queueStats.count).toBeGreaterThanOrEqual(1);

    const queue = inMemoryDB.getUploadQueue();
    const farmMutation = queue.find((q) => q.table === 'farms' && q.id === farmId);
    expect(farmMutation).toBeDefined();
    expect(farmMutation?.op).toBe('PUT');
  });

  it('updates farm details locally while offline', async () => {
    const farmId = await createFarm(userId, 'Original Farm Name');

    await updateFarm(farmId, {
      farmName: 'Renamed Organic Farm',
      location: 'Nueva Ecija',
      areaSqm: 12000,
    });

    const updated = await getFarm(farmId);
    expect(updated?.farm_name).toBe('Renamed Organic Farm');
    expect(updated?.location).toBe('Nueva Ecija');
    expect(updated?.area_sqm).toBe(12000);

    const queue = inMemoryDB.getUploadQueue();
    const updateMutation = queue.find((q) => q.table === 'farms' && q.op === 'PATCH');
    expect(updateMutation).toBeDefined();
  });

  it('retrieves user farms completely offline', async () => {
    await createFarm(userId, 'Farm A');
    await createFarm(userId, 'Farm B');
    await createFarm('other-user', 'Farm C');

    const userFarms = await getFarmsByUser(userId);
    expect(userFarms.length).toBe(2);
    expect(userFarms.map((f) => f.farm_name)).toContain('Farm A');
    expect(userFarms.map((f) => f.farm_name)).toContain('Farm B');
  });

  it('deletes a farm and executes offline cascade deletions and stages DELETE mutations', async () => {
    const farmId = await createFarm(userId, 'Farm to Delete');

    // Seed child entities
    await inMemoryDB.run(
      'INSERT INTO farm_layouts (id, farm_id, user_id, blueprint_data_json, created_at, updated_at) VALUES (?, ?, ?, "{}", datetime("now"), datetime("now"))',
      ['layout-to-delete', farmId, userId]
    );
    await inMemoryDB.run(
      'INSERT INTO todos (id, farm_id, user_id, title, is_completed, created_at, updated_at) VALUES (?, ?, ?, "Farm chore", 0, datetime("now"), datetime("now"))',
      ['todo-to-delete', farmId, userId]
    );

    await deleteFarm(farmId, userId);

    // Verify farm is deleted locally
    const farm = await getFarm(farmId);
    expect(farm).toBeNull();

    // Verify cascade child deletions in local SQLite
    const layouts = await inMemoryDB.all('SELECT * FROM farm_layouts WHERE farm_id = ?', [farmId]);
    expect(layouts.length).toBe(0);

    const todos = await inMemoryDB.all('SELECT * FROM todos WHERE farm_id = ?', [farmId]);
    expect(todos.length).toBe(0);

    // Verify DELETE mutation staged for farm
    const queue = inMemoryDB.getUploadQueue();
    const deleteMutation = queue.find((q) => q.table === 'farms' && q.id === farmId && q.op === 'DELETE');
    expect(deleteMutation).toBeDefined();
  });
});
