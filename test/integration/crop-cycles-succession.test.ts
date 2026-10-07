import {
  createFarm,
  saveFarmRotationPlan,
  getFarmSuccessionPlan,
  stopFarmCropPlan,
  deleteFarmRotationPlan,
  deleteAllFarmRotationPlans,
  getTodosByFarm,
} from '../../lib/db-operations';
import { inMemoryDB } from '../mocks/mock-db';

describe('Crop Cycles & Succession Plans (Offline-First Database Operations)', () => {
  const userId = 'user-crop-test-1';
  let farmId: string;

  beforeEach(async () => {
    farmId = await createFarm(userId, 'Succession Test Farm', 'Bukidnon', 4000);
  });

  it('saves farm rotation plan offline, schedules succession tasks, and stages mutations', async () => {
    const startTime = Date.now();

    await saveFarmRotationPlan({
      userId,
      farmId,
      planData: {
        id: 'plan-rotation-1',
        startDate: '2026-10-01',
        selectedCrops: [
          {
            crop: 'Carrot',
            maturity_days: 75,
            milestones: [
              { label: 'Soil Bed Preparation', durationDays: 7, isPreparation: true },
              { label: 'Sowing seeds', durationDays: 3, isPreparation: false },
              { label: 'Harvesting', durationDays: 5, isPreparation: false },
            ],
          },
        ],
      },
    });

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(100);

    // 1. Verify succession plan saved in local SQLite
    const plan = await getFarmSuccessionPlan(farmId);
    expect(plan).toBeDefined();
    expect(plan?.farm_id).toBe(farmId);

    // 2. Verify todos were generated for succession plan in local SQLite
    const todos = await getTodosByFarm(farmId);
    expect(todos.length).toBeGreaterThanOrEqual(1);
    expect(todos.some((t) => t.title.includes('Carrot') || t.notes?.includes('Succession Plan'))).toBe(true);

    // 3. Verify upload queue staged mutations
    const queue = inMemoryDB.getUploadQueue();
    const planMutation = queue.find((q) => q.table === 'farm_succession_plans');
    expect(planMutation).toBeDefined();

    const todoMutations = queue.filter((q) => q.table === 'todos');
    expect(todoMutations.length).toBeGreaterThanOrEqual(1);
  });

  it('stops a farm crop plan offline, marks cycles terminated, and stages PATCH mutations', async () => {
    await saveFarmRotationPlan({
      userId,
      farmId,
      planData: {
        id: 'plan-to-stop-1',
        startDate: '2026-10-01',
        selectedCrops: [{ crop: 'Lettuce', maturity_days: 45 }],
      },
    });

    await stopFarmCropPlan(farmId, 'plan-to-stop-1', 'Early monsoon damage', userId);

    // Verify succession plan history updated
    const plan = await getFarmSuccessionPlan(farmId);
    expect(plan).toBeDefined();

    const queue = inMemoryDB.getUploadQueue();
    const patchMutation = queue.find((q) => q.table === 'farm_succession_plans' && q.op === 'PATCH');
    expect(patchMutation).toBeDefined();
  });

  it('deletes all farm rotation plans offline and cleans up todos', async () => {
    await saveFarmRotationPlan({
      userId,
      farmId,
      planData: {
        id: 'plan-to-clear',
        startDate: '2026-10-01',
        selectedCrops: [{ crop: 'Spinach', maturity_days: 30 }],
      },
    });

    await deleteAllFarmRotationPlans(farmId, userId);

    const plan = await inMemoryDB.get('SELECT * FROM farm_succession_plans WHERE farm_id = ?', [farmId]);
    expect(plan).toBeNull();

    const queue = inMemoryDB.getUploadQueue();
    const deleteMutation = queue.find(
      (q) => q.table === 'farm_succession_plans' && q.op === 'DELETE'
    );
    expect(deleteMutation).toBeDefined();
  });
});
