import { powersync, initializePowerSyncDatabase } from './powersync';

type SqlParameters = unknown[];

type SqlExecutor = {
  execute: (sql: string, parameters?: SqlParameters) => Promise<unknown>;
  getAll: <T = any>(sql: string, parameters?: SqlParameters) => Promise<T[]>;
  getOptional: <T = any>(sql: string, parameters?: SqlParameters) => Promise<T | null>;
};

export type LocalDatabase = {
  run: (sql: string, parameters?: SqlParameters) => Promise<unknown>;
  all: <T = any>(sql: string, parameters?: SqlParameters) => Promise<T[]>;
  get: <T = any>(sql: string, parameters?: SqlParameters) => Promise<T | null>;
  transaction: <T>(callback: (tx: LocalDatabase) => Promise<T>) => Promise<T>;
};

function createDatabaseRunner(executor: SqlExecutor): LocalDatabase {
  return {
    run(sql, parameters = []) {
      return executor.execute(sql, parameters);
    },
    all<T = any>(sql: string, parameters: SqlParameters = []) {
      return executor.getAll<T>(sql, parameters);
    },
    get<T = any>(sql: string, parameters: SqlParameters = []) {
      return executor.getOptional<T>(sql, parameters);
    },
    transaction<T>(callback: (tx: LocalDatabase) => Promise<T>) {
      return powersync.writeTransaction((transaction) =>
        callback(createDatabaseRunner(transaction as unknown as SqlExecutor))
      );
    },
  };
}

export async function initializeLocalDatabase() {
  await initializePowerSyncDatabase();
}

let customRunner: LocalDatabase | null = null;

export function setCustomDatabaseRunner(runner: LocalDatabase | null) {
  customRunner = runner;
}

export function getDatabase(): LocalDatabase {
  if (customRunner) {
    return customRunner;
  }
  return createDatabaseRunner(powersync);
}

export function generateUUID() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const randomValue = (Math.random() * 16) | 0;
    const value = character === 'x' ? randomValue : (randomValue & 0x3) | 0x8;
    return value.toString(16);
  });
}
