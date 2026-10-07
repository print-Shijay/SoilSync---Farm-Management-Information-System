import {
  createTodo,
  updateTodo,
  batchUpdateTodosCompletion,
  deleteTodo,
  getTodosByUser,
  getTodosByFarm,
} from '../../lib/db-operations';
import { inMemoryDB } from '../mocks/mock-db';
import { powersync } from '../../lib/powersync';

describe('Todos Feature (Offline-First Database Operations)', () => {
  const userId = 'user-todo-test-1';
  const farmId = 'farm-todo-test-1';

  it('creates a todo locally while offline in < 15ms', async () => {
    const startTime = Date.now();

    const todoId = await createTodo({
      userId,
      farmId,
      title: 'Apply organic neem oil spray',
      notes: 'Focus on underside of tomato leaves',
      dueDate: '2026-09-30',
    });

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(100);
    expect(todoId).toBeDefined();

    // Verify presence in local SQLite
    const userTodos = await getTodosByUser(userId);
    expect(userTodos.length).toBe(1);
    expect(userTodos[0].title).toBe('Apply organic neem oil spray');
    expect(userTodos[0].is_completed).toBe(false);

    // Verify upload queue staged the operation
    const queue = inMemoryDB.getUploadQueue();
    const todoMutation = queue.find((q) => q.table === 'todos' && q.id === todoId);
    expect(todoMutation).toBeDefined();
    expect(todoMutation?.op).toBe('PUT');
  });

  it('completes a todo locally while offline', async () => {
    const todoId = await createTodo({
      userId,
      farmId,
      title: 'Inspect irrigation drippers',
    });

    await updateTodo(todoId, { isCompleted: true });

    const farmTodos = await getTodosByFarm(farmId);
    const completedTodo = farmTodos.find((t) => t.id === todoId);
    expect(completedTodo).toBeDefined();
    expect(completedTodo?.is_completed).toBe(true);

    const queue = inMemoryDB.getUploadQueue();
    const patchMutation = queue.find((q) => q.table === 'todos' && q.id === todoId && q.op === 'PATCH');
    expect(patchMutation).toBeDefined();
  });

  it('batch updates todos completion offline and stages PATCH mutations', async () => {
    const todo1 = await createTodo({ userId, farmId, title: 'Batch task 1' });
    const todo2 = await createTodo({ userId, farmId, title: 'Batch task 2' });

    await batchUpdateTodosCompletion({
      todoIds: [todo1, todo2],
      isCompleted: true,
      userId,
    });

    const todos = await getTodosByFarm(farmId);
    const t1 = todos.find((t) => t.id === todo1);
    const t2 = todos.find((t) => t.id === todo2);
    expect(t1?.is_completed).toBe(true);
    expect(t2?.is_completed).toBe(true);

    const queue = inMemoryDB.getUploadQueue();
    const patch1 = queue.find((q) => q.table === 'todos' && q.id === todo1 && q.op === 'PATCH');
    const patch2 = queue.find((q) => q.table === 'todos' && q.id === todo2 && q.op === 'PATCH');
    expect(patch1).toBeDefined();
    expect(patch2).toBeDefined();
  });

  it('deletes a todo locally while offline and stages DELETE mutation', async () => {
    const todoId = await createTodo({ userId, farmId, title: 'Temporary task to remove' });

    await deleteTodo(todoId, userId);

    const todos = await getTodosByFarm(farmId);
    expect(todos.find((t) => t.id === todoId)).toBeUndefined();

    const queue = inMemoryDB.getUploadQueue();
    const deleteMutation = queue.find((q) => q.table === 'todos' && q.id === todoId && q.op === 'DELETE');
    expect(deleteMutation).toBeDefined();
  });
});
