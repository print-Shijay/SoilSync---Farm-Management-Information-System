import {
  createFarm,
  getOrCreateFarmLayout,
  saveFarmLayoutFromUnity,
  getFarmLayoutWithStructures,
  getAllGardenStructures,
  getAvailableFarmPlots,
} from '../../lib/db-operations';
import { inMemoryDB } from '../mocks/mock-db';

describe('Farm Layouts & Garden Structures (Offline-First Database Operations)', () => {
  const userId = 'user-layout-test-1';
  let farmId: string;

  beforeEach(async () => {
    farmId = await createFarm(userId, 'Layout Test Farm', 'Laguna', 3000);
  });

  it('gets or creates a farm layout locally while offline and enqueues PUT', async () => {
    const startTime = Date.now();
    const layout = await getOrCreateFarmLayout(farmId);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(100);
    expect(layout).toBeDefined();
    expect(layout.farm_id).toBe(farmId);
    expect(layout.user_id).toBe(userId);

    // Verify upload queue staged the layout
    const queue = inMemoryDB.getUploadQueue();
    const stagedLayout = queue.find((q) => q.table === 'farm_layouts' && q.id === layout.id);
    expect(stagedLayout).toBeDefined();
    expect(stagedLayout?.op).toBe('PUT');
  });

  it('saves farm layout from Unity with beds and trellises 100% offline', async () => {
    const layout = await getOrCreateFarmLayout(farmId);

    await saveFarmLayoutFromUnity({
      farmId,
      structureCounts: { bed: 2, trellis: 1 },
      blueprintWidthM: 30,
      blueprintHeightM: 20,
      blueprintData: {
        widthM: 30,
        heightM: 20,
        items: [
          { type: 'bed', x: 2, z: 4, widthM: 3, depthM: 1 },
          { type: 'bed', x: 6, z: 4, widthM: 3, depthM: 1 },
          { type: 'trellis', x: 10, z: 4, widthM: 4, depthM: 1 },
        ],
      },
    });

    // 1. Verify layout updated in local SQLite
    const layoutWithStructures = await getFarmLayoutWithStructures(farmId);
    expect(layoutWithStructures).toBeDefined();
    expect(layoutWithStructures?.structureCounts.bed).toBe(2);
    expect(layoutWithStructures?.structureCounts.trellis).toBe(1);

    // 2. Verify garden structures created in local SQLite
    const structures = await getAllGardenStructures();
    const farmStructures = structures.filter((s: any) => s.farm_layout_id === layout.id);
    expect(farmStructures.length).toBe(3);

    // 3. Verify available plots
    const availablePlots = await getAvailableFarmPlots(farmId);
    expect(availablePlots.length).toBe(3);

    // 4. Verify upload queue staged UPDATE/PATCH on layout and PUT for structures
    const queue = inMemoryDB.getUploadQueue();
    const stagedPatch = queue.find((q) => q.table === 'farm_layouts' && q.op === 'PATCH');
    expect(stagedPatch).toBeDefined();

    const structureMutations = queue.filter((q) => q.table === 'garden_structures' && q.op === 'PUT');
    expect(structureMutations.length).toBe(3);
  });
});
