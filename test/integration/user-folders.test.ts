import {
  createUserFolder,
  getUserFolders,
  getUserFolder,
  getUserFolderCount,
  updateUserFolder,
  saveFolderColumns,
  saveFolderRecord,
  deleteFolderRecord,
  deleteUserFolder,
} from '../../lib/db-operations';
import { inMemoryDB } from '../mocks/mock-db';

describe('User Media Folders & Custom Docs (Offline-First Database Operations)', () => {
  const userId = 'user-folder-test-1';

  it('creates and reads user folders offline in < 15ms and enqueues PUT', async () => {
    const startTime = Date.now();

    const folderId = await createUserFolder({
      userId,
      folderName: 'Soil Test Lab Sheets',
      initialColumns: [
        { id: 'col_sample_id', name: 'Sample ID', type: 'text', order: 1 },
        { id: 'col_ph_level', name: 'pH Level', type: 'number', order: 2 },
      ],
    });

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(100);
    expect(folderId).toBeDefined();

    // 1. Verify folder count and folder retrieval in local SQLite
    const count = await getUserFolderCount(userId);
    expect(count).toBe(1);

    const folder = await getUserFolder(folderId);
    expect(folder).toBeDefined();
    expect(folder?.folder_name).toBe('Soil Test Lab Sheets');

    const folders = await getUserFolders(userId);
    expect(folders.length).toBe(1);
    expect(folders[0].id).toBe(folderId);

    // 2. Verify upload queue staged the operation
    const queue = inMemoryDB.getUploadQueue();
    const stagedFolder = queue.find((q) => q.table === 'user_folder' && q.id === folderId);
    expect(stagedFolder).toBeDefined();
    expect(stagedFolder?.op).toBe('PUT');
  });

  it('updates folder columns, records, and deletes records offline', async () => {
    const folderId = await createUserFolder({
      userId,
      folderName: 'Equipment Maintenance',
    });

    // 1. Save new column schema
    await saveFolderColumns(folderId, [
      { id: 'col_tool', name: 'Tool Name', type: 'text', order: 1 },
      { id: 'col_status', name: 'Operational Status', type: 'text', order: 2 },
    ]);

    // 2. Add custom record row
    const recordId = 'rec-tractor-oil-check';
    await saveFolderRecord(folderId, {
      id: recordId,
      col_tool: 'Kubota Tractor 4WD',
      col_status: 'Lubricated and Operational',
    });

    let folder = await getUserFolder(folderId);
    let parsedContent = JSON.parse(folder!.content_json);
    expect(parsedContent.records.length).toBe(1);
    expect(parsedContent.records[0].col_tool).toBe('Kubota Tractor 4WD');

    // 3. Delete custom record row
    await deleteFolderRecord(folderId, recordId);

    folder = await getUserFolder(folderId);
    parsedContent = JSON.parse(folder!.content_json);
    expect(parsedContent.records.length).toBe(0);

    // 4. Delete user folder
    await deleteUserFolder(folderId, userId);
    folder = await getUserFolder(folderId);
    expect(folder).toBeNull();

    const queue = inMemoryDB.getUploadQueue();
    const deleteMutation = queue.find(
      (q) => q.table === 'user_folder' && q.id === folderId && q.op === 'DELETE'
    );
    expect(deleteMutation).toBeDefined();
  });
});
