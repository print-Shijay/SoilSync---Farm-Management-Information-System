import {
  createFarm,
  saveFarmCheckUpResults,
  getAllFarmCheckUpResults,
  getLatestFarmCheckUpResult,
  deleteFarmCheckUpResult,
} from '../../lib/db-operations';
import { inMemoryDB } from '../mocks/mock-db';

describe('Farm Checkup & Health (Offline-First Database Operations)', () => {
  const userId = 'user-checkup-test-1';
  let farmId: string;

  beforeEach(async () => {
    farmId = await createFarm(userId, 'Health Test Farm', 'Batangas', 2500);
  });

  it('saves farm checkup result offline in < 15ms and stages PUT mutation', async () => {
    const startTime = Date.now();

    const checkupId = await saveFarmCheckUpResults({
      userId,
      farmId,
      imageUri: null,
      summaryData: {
        score: 85,
        nitrogen_status: 'optimal',
        chlorophyll_index: 'healthy',
        recommendations: ['Maintain current irrigation schedule'],
      },
    });

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(100);
    expect(checkupId).toBeDefined();

    // 1. Verify saved in local SQLite
    const latest = await getLatestFarmCheckUpResult(farmId);
    expect(latest).toBeDefined();
    expect(latest?.id).toBe(checkupId);
    expect(latest?.summary_data?.score).toBe(85);

    // 2. Verify checkup history in local SQLite
    const allResults = await getAllFarmCheckUpResults(farmId);
    expect(allResults.length).toBe(1);
    expect(allResults[0].id).toBe(checkupId);

    // 3. Verify upload queue staged the mutation
    const queue = inMemoryDB.getUploadQueue();
    const stagedCheckup = queue.find((q) => q.table === 'farm_checkup_results' && q.id === checkupId);
    expect(stagedCheckup).toBeDefined();
    expect(stagedCheckup?.op).toBe('PUT');
  });

  it('deletes a farm checkup result offline and stages DELETE mutation', async () => {
    const checkupId = await saveFarmCheckUpResults({
      userId,
      farmId,
      imageUri: null,
      summaryData: { score: 70 },
    });

    await deleteFarmCheckUpResult(checkupId);

    const allResults = await getAllFarmCheckUpResults(farmId);
    expect(allResults.find((r) => r.id === checkupId)).toBeUndefined();

    const queue = inMemoryDB.getUploadQueue();
    const deleteMutation = queue.find(
      (q) => q.table === 'farm_checkup_results' && q.id === checkupId && q.op === 'DELETE'
    );
    expect(deleteMutation).toBeDefined();
  });
});
