import { mockInMemoryDB, mockDatabaseRunner } from './mocks/mock-db';
import { setCustomDatabaseRunner } from '../lib/local-db';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('lucide-react-native', () =>
  new Proxy(
    {},
    {
      get: () => () => null,
    }
  )
);

jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/mock')
);

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'mock-expo-push-token' })),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
}));

// Enforce test runner injection for all db-operations
beforeEach(() => {
  mockInMemoryDB.reset();
  setCustomDatabaseRunner(mockDatabaseRunner);
});

afterEach(() => {
  setCustomDatabaseRunner(null);
});

// Mock powersync singleton to track the simulated upload queue
jest.mock('../lib/powersync', () => ({
  powersync: {
    getUploadQueueStats: jest.fn(async () => ({
      count: mockInMemoryDB.getUploadQueueCount(),
    })),
    execute: jest.fn(async (sql: string, params: unknown[] = []) => {
      return mockInMemoryDB.run(sql, params);
    }),
    getAll: jest.fn(async <T = any>(sql: string, params: unknown[] = []) => {
      return mockInMemoryDB.all<T>(sql, params);
    }),
    getOptional: jest.fn(async <T = any>(sql: string, params: unknown[] = []) => {
      return mockInMemoryDB.get<T>(sql, params);
    }),
    watch: jest.fn(() => ({
      [Symbol.asyncIterator]: () => ({
        next: async () => ({ done: true, value: undefined }),
      }),
    })),
  },
  initializePowerSyncDatabase: jest.fn(async () => {}),
  connectPowerSync: jest.fn(async () => {}),
  disconnectPowerSync: jest.fn(async () => {}),
}));

// Mock supabase to enforce strict offline assertion
jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(async () => ({
        data: { user: { id: 'test-user-uuid-1', email: 'farmer@soilsync.test' } },
        error: null,
      })),
      getSession: jest.fn(async () => ({
        data: { session: null },
        error: null,
      })),
      updateUser: jest.fn(async (attributes: any) => {
        if (!mockInMemoryDB.getOnlineStatus()) {
          return { data: { user: null }, error: new Error('[OFFLINE] Auth updateUser failed: network unreachable') };
        }
        return { data: { user: { id: 'test-user-uuid-1', ...attributes } }, error: null };
      }),
      signUp: jest.fn(async (credentials: any) => {
        if (!mockInMemoryDB.getOnlineStatus()) {
          return { data: { user: null, session: null }, error: new Error('[OFFLINE] Sign up failed: network unreachable') };
        }
        return { data: { user: { id: 'new-user-id', email: credentials?.email }, session: {} }, error: null };
      }),
      signInWithPassword: jest.fn(async (credentials: any) => {
        if (!mockInMemoryDB.getOnlineStatus()) {
          return { data: { user: null, session: null }, error: new Error('[OFFLINE] Sign in failed: network unreachable') };
        }
        return { data: { user: { id: 'test-user-uuid-1', email: credentials?.email }, session: {} }, error: null };
      }),
      resetPasswordForEmail: jest.fn(async () => {
        if (!mockInMemoryDB.getOnlineStatus()) {
          return { data: null, error: new Error('[OFFLINE] Password reset failed: network unreachable') };
        }
        return { data: {}, error: null };
      }),
    },
    functions: {
      invoke: jest.fn(async (funcName: string, _options?: any) => {
        if (!mockInMemoryDB.getOnlineStatus()) {
          return { data: null, error: new Error(`[OFFLINE] Edge function '${funcName}' failed: network unreachable`) };
        }
        return { data: { success: true, message: 'Operation successful' }, error: null };
      }),
    },
    from: jest.fn((table: string) => {
      if (!mockInMemoryDB.getOnlineStatus()) {
        throw new Error(
          `[OFFLINE_VIOLATION] Direct online query attempted on table '${table}' while device is offline!`
        );
      }
      const queryBuilder: any = {
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        upsert: jest.fn(async () => ({ data: null, error: null })),
        eq: jest.fn().mockReturnThis(),
        ilike: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn(async () => ({ data: null, error: null })),
        maybeSingle: jest.fn(async () => {
          if (table === 'admins') {
            return { data: { id: 'admin-1', role: 'organic_farm_partner', email: 'verified@partner.org' }, error: null };
          }
          if (table === 'user_ai_daily_usage') {
            return { data: { id: 'test-user-uuid-1_usage', count: 2 }, error: null };
          }
          return { data: null, error: null };
        }),
        then: (resolve: (val: any) => any) => {
          if (table === 'user_ai_daily_usage') {
            return Promise.resolve(resolve({ data: [{ id: 'test-user-uuid-1_usage', count: 2, usage_date: '2026-09-25' }], error: null }));
          }
          return Promise.resolve(resolve({ data: [], error: null }));
        },
      };
      return queryBuilder;
    }),
    rpc: jest.fn(async (funcName: string) => {
      if (!mockInMemoryDB.getOnlineStatus()) {
        return { data: null, error: new Error(`[OFFLINE] RPC '${funcName}' failed: no network`) };
      }
      return { data: { success: true }, error: null };
    }),
  },
}));
