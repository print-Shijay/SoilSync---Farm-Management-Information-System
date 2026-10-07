import {
  createSupportReport,
  getUserSupportReports,
} from '../../lib/db-operations';
import { inMemoryDB } from '../mocks/mock-db';

describe('Support Reports Feature (Offline-First Database Operations)', () => {
  const userId = 'user-support-test-1';

  it('creates and reads support reports locally while offline', async () => {
    const startTime = Date.now();

    const reportId = await createSupportReport({
      userId,
      subject: 'IoT Sensor & Hardware Connection',
      note: 'Sensor 3 is not reporting moisture data when offline.',
      status: 'pending',
      deviceInfo: {
        platform: 'android',
        appVersion: '1.1.0',
      },
    });

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(100);
    expect(reportId).toBeDefined();

    // Verify presence in local SQLite
    const reports = await getUserSupportReports(userId);
    expect(reports.length).toBe(1);
    expect(reports[0].id).toBe(reportId);
    expect(reports[0].subject).toBe('IoT Sensor & Hardware Connection');
    expect(reports[0].status).toBe('pending');
    expect(reports[0].device_info.platform).toBe('android');

    // Verify upload queue staged the operation for upstream PowerSync sync
    const queue = inMemoryDB.getUploadQueue();
    const stagedReport = queue.find((q) => q.table === 'reports' && q.id === reportId);
    expect(stagedReport).toBeDefined();
    expect(stagedReport?.op).toBe('PUT');
  });
});
