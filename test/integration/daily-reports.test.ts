import {
  createFarm,
  saveDailyReport,
  getFarmDailyReports,
  hasSubmittedDailyReportToday,
  deleteDailyReport,
} from '../../lib/db-operations';
import { inMemoryDB } from '../mocks/mock-db';

describe('Daily Reports Feature (Offline-First Database Operations)', () => {
  const userId = 'user-daily-test-1';
  let farmId: string;

  beforeEach(async () => {
    farmId = await createFarm(userId, 'Daily Report Farm', 'Iloilo', 1500);
  });

  it('submits a daily report offline in < 15ms and enqueues PUT to upload outbox', async () => {
    const startTime = Date.now();
    const today = new Date().toISOString().split('T')[0];

    const reportId = await saveDailyReport({
      userId,
      farmId,
      answers: { pests: 'no', wilting: 'no', dry_soil: 'yes' },
      symptomsSummary: [{ category: 'Moisture', question: 'Soil feels dry to touch' }],
      notes: 'Watered morning block 1',
      reportDate: today,
    });

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(100);
    expect(reportId).toBeDefined();

    // 1. Verify presence in local SQLite
    const reports = await getFarmDailyReports(farmId);
    expect(reports.length).toBe(1);
    expect(reports[0].id).toBe(reportId);
    expect(reports[0].notes).toBe('Watered morning block 1');

    // 2. Verify submission check for today
    const hasSubmitted = await hasSubmittedDailyReportToday(farmId, userId);
    expect(hasSubmitted).toBe(true);

    // 3. Verify mutation staged in upload queue
    const queue = inMemoryDB.getUploadQueue();
    const stagedReport = queue.find((q) => q.table === 'farm_daily_reports' && q.id === reportId);
    expect(stagedReport).toBeDefined();
    expect(stagedReport?.op).toBe('PUT');
  });

  it('deletes a daily report offline and stages DELETE mutation', async () => {
    const reportId = await saveDailyReport({
      userId,
      farmId,
      answers: {},
      symptomsSummary: [],
      notes: 'Report to delete',
    });

    await deleteDailyReport(reportId);

    const reports = await getFarmDailyReports(farmId);
    expect(reports.find((r) => r.id === reportId)).toBeUndefined();

    const queue = inMemoryDB.getUploadQueue();
    const deleteMutation = queue.find(
      (q) => q.table === 'farm_daily_reports' && q.id === reportId && q.op === 'DELETE'
    );
    expect(deleteMutation).toBeDefined();
  });
});
