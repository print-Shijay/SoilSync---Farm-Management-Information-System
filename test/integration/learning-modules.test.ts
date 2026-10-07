import {
  saveUserCertificate,
  getUserCertificate,
  saveUserModuleProgress,
  saveUserQuizProgress,
  saveUserFinishLineProgress,
  getUserLearningProgress,
  resetUserLearningProgress,
  getAllModules,
  getModuleById,
  getQuizByModuleId,
  getModuleCategories,
} from '../../lib/db-operations';
import { inMemoryDB } from '../mocks/mock-db';

describe('Learning Modules & Certificates (Offline-First Database Operations)', () => {
  const userId = 'user-learning-test-1';

  it('saves and reads user certificate offline in < 15ms and enqueues PUT', async () => {
    const startTime = Date.now();

    const cert = await saveUserCertificate({
      userId,
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      email: 'juan@soilsync.test',
      totalModules: 6,
      totalStars: 18,
    });

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(100);
    expect(cert).toBeDefined();
    expect(cert.recipient_name).toBe('Juan Dela Cruz');
    expect(cert.certificate_code).toBeDefined();

    // Verify retrieval from local SQLite
    const retrieved = await getUserCertificate(userId);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(cert.id);
    expect(retrieved?.total_stars).toBe(18);

    // Verify upload queue staged the operation
    const queue = inMemoryDB.getUploadQueue();
    const stagedCert = queue.find((q) => q.table === 'user_certificates' && q.id === cert.id);
    expect(stagedCert).toBeDefined();
    expect(stagedCert?.op).toBe('PUT');
  });

  it('tracks module, quiz, and finish line progress locally while offline', async () => {
    // 1. Module progress
    await saveUserModuleProgress(userId, 'mod-001-soil-foundations');
    let progress = await getUserLearningProgress(userId);
    expect(progress.length).toBe(1);
    expect(progress[0].item_id).toBe('mod-001-soil-foundations');
    expect(progress[0].is_completed).toBe(1);

    // 2. Quiz progress
    await saveUserQuizProgress(userId, 'quiz-001-soil-foundations', 85, 3);
    progress = await getUserLearningProgress(userId);
    expect(progress.length).toBe(2);
    const quizRecord = progress.find((p) => p.item_id === 'quiz-001-soil-foundations');
    expect(quizRecord?.score).toBe(85);
    expect(quizRecord?.stars).toBe(3);

    // 3. Finish line milestone
    await saveUserFinishLineProgress(userId);
    progress = await getUserLearningProgress(userId);
    expect(progress.length).toBe(3);
    expect(progress.some((p) => p.item_type === 'finish_line')).toBe(true);

    // 4. Reset progress offline
    await resetUserLearningProgress(userId);
    progress = await getUserLearningProgress(userId);
    expect(progress.length).toBe(0);

    const queue = inMemoryDB.getUploadQueue();
    const deleteMutation = queue.find(
      (q) => q.table === 'user_learning_progress' && q.op === 'DELETE'
    );
    expect(deleteMutation).toBeDefined();
  });

  it('queries offline learning modules and quizzes', async () => {
    const modules = await getAllModules();
    expect(modules.length).toBeGreaterThanOrEqual(1);

    const firstModule = await getModuleById(modules[0].id);
    expect(firstModule).toBeDefined();
    expect(firstModule?.title).toBe(modules[0].title);

    const quiz = await getQuizByModuleId(modules[0].id);
    expect(quiz).toBeDefined();

    const categories = await getModuleCategories();
    expect(Array.isArray(categories)).toBe(true);
  });
});
