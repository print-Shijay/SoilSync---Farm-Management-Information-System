import { LocalDatabase } from '../../lib/local-db';

export type QueuedMutation = {
  id: string;
  table: string;
  op: 'PUT' | 'PATCH' | 'DELETE';
  data: Record<string, any>;
  timestamp: string;
};

function splitSqlExpressions(str: string): string[] {
  const result: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let parenDepth = 0;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      current += char;
    } else if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      current += char;
    } else if (char === '(' && !inSingleQuote && !inDoubleQuote) {
      parenDepth++;
      current += char;
    } else if (char === ')' && !inSingleQuote && !inDoubleQuote) {
      parenDepth--;
      current += char;
    } else if (char === ',' && !inSingleQuote && !inDoubleQuote && parenDepth === 0) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim().length > 0) {
    result.push(current.trim());
  }

  return result;
}

function evaluateSqlExpr(expr: string, params: unknown[], paramIdxRef: { current: number }): any {
  const trimmed = expr.trim();
  if (trimmed === '?') {
    return params[paramIdxRef.current++];
  }
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1);
  }
  if (/^datetime\(/i.test(trimmed)) {
    return new Date().toISOString();
  }
  if (trimmed.toLowerCase() === 'null') {
    return null;
  }
  if (trimmed.toLowerCase() === 'true') {
    return 1;
  }
  if (trimmed.toLowerCase() === 'false') {
    return 0;
  }
  if (!isNaN(Number(trimmed)) && trimmed !== '') {
    return Number(trimmed);
  }
  return trimmed;
}

class InMemoryDatabase {
  private tables = new Map<string, Map<string, Record<string, any>>>();
  private uploadQueue: QueuedMutation[] = [];
  private isOnline = false;

  constructor() {
    this.reset();
  }

  reset() {
    this.tables.clear();
    this.uploadQueue = [];
    this.isOnline = false;
  }

  setOnline(online: boolean) {
    this.isOnline = online;
  }

  getOnlineStatus(): boolean {
    return this.isOnline;
  }

  getUploadQueue(): QueuedMutation[] {
    return [...this.uploadQueue];
  }

  getUploadQueueCount(): number {
    return this.uploadQueue.length;
  }

  private getTable(tableName: string): Map<string, Record<string, any>> {
    let table = this.tables.get(tableName.toLowerCase());
    if (!table) {
      table = new Map();
      this.tables.set(tableName.toLowerCase(), table);
    }
    return table;
  }

  async run(sql: string, params: unknown[] = []): Promise<{ rowsAffected: number }> {
    const normalized = sql.replace(/\s+/g, ' ').trim();

    // 1. INSERT INTO table (cols) VALUES (vals)
    const insertMatch = normalized.match(
      /INSERT(?:\s+OR\s+REPLACE)?\s+INTO\s+([a-zA-Z0-9_]+)\s*\((.+?)\)\s*VALUES\s*\((.+?)\)/i
    );
    if (insertMatch) {
      const tableName = insertMatch[1].toLowerCase();
      const columns = splitSqlExpressions(insertMatch[2]).map((c) => c.toLowerCase());
      const valExprs = splitSqlExpressions(insertMatch[3]);
      const paramIdxRef = { current: 0 };

      const record: Record<string, any> = {};
      for (let i = 0; i < columns.length; i++) {
        const col = columns[i];
        const expr = valExprs[i] ?? 'null';
        record[col] = evaluateSqlExpr(expr, params, paramIdxRef);
      }

      const id = record['id'] || `auto-${Date.now()}-${Math.random()}`;
      record['id'] = id;

      const table = this.getTable(tableName);
      table.set(id, record);

      this.uploadQueue.push({
        id,
        table: tableName,
        op: 'PUT',
        data: record,
        timestamp: new Date().toISOString(),
      });

      return { rowsAffected: 1 };
    }

    // 2. UPDATE table SET col = ?, col2 = ? WHERE ...
    const updateMatch = normalized.match(/UPDATE\s+([a-zA-Z0-9_]+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?$/i);
    if (updateMatch) {
      const tableName = updateMatch[1].toLowerCase();
      const setClause = updateMatch[2];
      const whereClause = updateMatch[3];
      const table = this.getTable(tableName);
      const paramIdxRef = { current: 0 };

      const assignments = splitSqlExpressions(setClause);
      const updates: Record<string, any> = {};
      for (const assign of assignments) {
        const eqIdx = assign.indexOf('=');
        if (eqIdx !== -1) {
          const col = assign.substring(0, eqIdx).trim().toLowerCase();
          const expr = assign.substring(eqIdx + 1).trim();
          updates[col] = evaluateSqlExpr(expr, params, paramIdxRef);
        }
      }

      const matchingRecords: Record<string, any>[] = [];

      if (whereClause) {
        // Evaluate remaining params against where conditions
        if (/\bid\s*=\s*\?/i.test(whereClause)) {
          const targetId = String(params[paramIdxRef.current++]);
          const found = table.get(targetId);
          if (found) matchingRecords.push(found);
        } else if (/\bid\s+IN\s*\(/i.test(whereClause)) {
          const inMatch = whereClause.match(/\bid\s+IN\s*\(([^)]+)\)/i);
          if (inMatch) {
            const count = (inMatch[1].match(/\?/g) || []).length;
            const targetIds = new Set<string>();
            for (let i = 0; i < count; i++) {
              targetIds.add(String(params[paramIdxRef.current++]));
            }
            for (const [id, r] of table.entries()) {
              if (targetIds.has(id)) matchingRecords.push(r);
            }
          }
        } else if (/\bfarm_id\s*=\s*\?/i.test(whereClause)) {
          const targetFarmId = String(params[paramIdxRef.current++]);
          for (const r of table.values()) {
            if (r.farm_id === targetFarmId) matchingRecords.push(r);
          }
        } else if (
          /\buser_id\s*=\s*\?/i.test(whereClause) &&
          /\bitem_id\s*=\s*\?/i.test(whereClause) &&
          /\bitem_type\s*=\s*\?/i.test(whereClause)
        ) {
          const targetUserId = String(params[paramIdxRef.current++]);
          const targetItemId = String(params[paramIdxRef.current++]);
          const targetItemType = String(params[paramIdxRef.current++]);
          for (const r of table.values()) {
            if (r.user_id === targetUserId && r.item_id === targetItemId && r.item_type === targetItemType) {
              matchingRecords.push(r);
            }
          }
        } else if (/\buser_id\s*=\s*\?/i.test(whereClause)) {
          const targetUserId = String(params[paramIdxRef.current++]);
          for (const r of table.values()) {
            if (r.user_id === targetUserId) matchingRecords.push(r);
          }
        } else {
          for (const r of table.values()) {
            matchingRecords.push(r);
          }
        }
      } else {
        for (const r of table.values()) {
          matchingRecords.push(r);
        }
      }

      for (const r of matchingRecords) {
        const id = r.id;
        const updatedRecord = { ...r, ...updates };
        table.set(id, updatedRecord);
        this.uploadQueue.push({
          id,
          table: tableName,
          op: 'PATCH',
          data: updates,
          timestamp: new Date().toISOString(),
        });
      }

      return { rowsAffected: matchingRecords.length };
    }

    // 3. DELETE FROM table WHERE ...
    const deleteMatch = normalized.match(/DELETE\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.+))?$/i);
    if (deleteMatch) {
      const tableName = deleteMatch[1].toLowerCase();
      const whereClause = deleteMatch[2];
      const table = this.getTable(tableName);

      if (!whereClause) {
        const affected = table.size;
        for (const id of Array.from(table.keys())) {
          this.uploadQueue.push({
            id,
            table: tableName,
            op: 'DELETE',
            data: { id },
            timestamp: new Date().toISOString(),
          });
        }
        table.clear();
        return { rowsAffected: affected };
      }

      const toDeleteIds: string[] = [];

      if (/\bid\s*=\s*\?/i.test(whereClause)) {
        const targetId = String(params[0]);
        if (table.has(targetId)) toDeleteIds.push(targetId);
      } else if (/\bfarm_id\s*=\s*\?/i.test(whereClause)) {
        const targetFarmId = String(params[0]);
        for (const [id, r] of table.entries()) {
          if (r.farm_id === targetFarmId) {
            toDeleteIds.push(id);
          }
        }
      } else if (/\bfarm_layout_id\s*=\s*\?/i.test(whereClause)) {
        const targetLayoutId = String(params[0]);
        for (const [id, r] of table.entries()) {
          if (r.farm_layout_id === targetLayoutId) {
            toDeleteIds.push(id);
          }
        }
      } else if (/\buser_id\s*=\s*\?/i.test(whereClause)) {
        const targetUserId = String(params[0]);
        for (const [id, r] of table.entries()) {
          if (r.user_id === targetUserId) {
            toDeleteIds.push(id);
          }
        }
      } else if (whereClause.includes('farm_layouts') || whereClause.includes('garden_structures')) {
        // Cascade subqueries in deleteFarm or saveFarmLayoutFromUnity
        const targetId = String(params[0]);
        for (const [id, r] of table.entries()) {
          if (r.farm_id === targetId || r.farm_layout_id === targetId || r.garden_structure_id) {
            toDeleteIds.push(id);
          }
        }
      } else {
        // Fallback: match any record with matching param values
        const paramStr = String(params[0]);
        for (const [id, r] of table.entries()) {
          if (r.farm_id === paramStr || r.id === paramStr || r.user_id === paramStr) {
            toDeleteIds.push(id);
          }
        }
      }

      for (const id of toDeleteIds) {
        table.delete(id);
        this.uploadQueue.push({
          id,
          table: tableName,
          op: 'DELETE',
          data: { id },
          timestamp: new Date().toISOString(),
        });
      }

      return { rowsAffected: toDeleteIds.length };
    }

    return { rowsAffected: 0 };
  }

  async all<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    const fromMatch = normalized.match(/FROM\s+([a-zA-Z0-9_]+)/i);
    if (!fromMatch) {
      return [];
    }

    const tableName = fromMatch[1].toLowerCase();
    const table = this.getTable(tableName);
    let rows = Array.from(table.values());

    // Farm query with LEFT JOIN farm_members
    if (tableName === 'farms' && normalized.includes('farm_members')) {
      const targetUserId = params[0];
      const membersTable = this.getTable('farm_members');
      rows = rows.filter((f) => {
        if (f.user_id === targetUserId) return true;
        for (const m of membersTable.values()) {
          if (m.farm_id === f.id && m.user_id === targetUserId && m.status === 'accepted') {
            return true;
          }
        }
        return false;
      });
    } else {
      const whereMatch = normalized.match(/WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|$)/i);
      if (whereMatch) {
        const whereClause = whereMatch[1];
        let pIdx = 0;

        if (
          /\bfarm_id\s*=\s*\?/i.test(whereClause) &&
          /\buser_id\s*=\s*\?/i.test(whereClause) &&
          /\bstatus\s*=\s*\?/i.test(whereClause)
        ) {
          const fId = params[pIdx++];
          const uId = params[pIdx++];
          const st = params[pIdx++];
          rows = rows.filter((r) => r.farm_id === fId && r.user_id === uId && r.status === st);
        } else if (
          /\buser_id\s*=\s*\?/i.test(whereClause) &&
          /\bitem_id\s*=\s*\?/i.test(whereClause) &&
          /\bitem_type\s*=\s*\?/i.test(whereClause)
        ) {
          const uId = params[pIdx++];
          const itemId = params[pIdx++];
          const itemType = params[pIdx++];
          rows = rows.filter((r) => r.user_id === uId && r.item_id === itemId && r.item_type === itemType);
        } else if (
          /\bfacility_id\s*=\s*\?/i.test(whereClause) &&
          /\bname\s*=\s*\?/i.test(whereClause)
        ) {
          const facId = params[pIdx++];
          const nameVal = params[pIdx++];
          rows = rows.filter((r) => r.facility_id === facId && r.name === nameVal);
        } else if (/\bid\s+IN\s*\(/i.test(whereClause)) {
          const inMatch = whereClause.match(/\bid\s+IN\s*\(([^)]+)\)/i);
          if (inMatch) {
            const count = (inMatch[1].match(/\?/g) || []).length;
            const targetIds = new Set<string>();
            for (let i = 0; i < count; i++) {
              targetIds.add(String(params[pIdx++]));
            }
            rows = rows.filter((r) => targetIds.has(r.id));
          }
        } else {
          if (/\bfarm_id\s*=\s*\?/i.test(whereClause)) {
            const fId = params[pIdx++];
            rows = rows.filter((r) => r.farm_id === fId);
          }
          if (/\bfarm_layout_id\s*=\s*\?/i.test(whereClause)) {
            const layoutId = params[pIdx++];
            rows = rows.filter((r) => r.farm_layout_id === layoutId);
          }
          if (/\bfacility_id\s*=\s*\?/i.test(whereClause)) {
            const facId = params[pIdx++];
            rows = rows.filter((r) => r.facility_id === facId);
          }
          if (/\bmodule_id\s*=\s*\?/i.test(whereClause)) {
            const modId = params[pIdx++];
            rows = rows.filter((r) => r.module_id === modId);
          }
          if (/\bname\s*=\s*\?/i.test(whereClause)) {
            const nameVal = params[pIdx++];
            rows = rows.filter((r) => r.name === nameVal);
          }
          if (/\buser_id\s*=\s*\?/i.test(whereClause)) {
            const uId = params[pIdx++];
            rows = rows.filter((r) => r.user_id === uId);
          }
          if (/\bid\s*=\s*\?/i.test(whereClause)) {
            const id = params[pIdx++];
            rows = rows.filter((r) => r.id === id);
          }
          if (/\bcategory\s*=\s*'harvest'/i.test(whereClause)) {
            rows = rows.filter((r) => r.category === 'harvest');
          }
          if (/\bstatus\s*=\s*'pending'/i.test(whereClause)) {
            rows = rows.filter((r) => r.status === 'pending');
          }
          if (/\bstatus\s*=\s*'accepted'/i.test(whereClause)) {
            rows = rows.filter((r) => r.status === 'accepted');
          }
          if (/\bis_published\s*=\s*1/i.test(whereClause)) {
            rows = rows.filter((r) => r.is_published === 1 || r.is_published === true);
          }
        }
      }
    }

    if (normalized.includes('ORDER BY')) {
      if (normalized.includes('created_at DESC')) {
        rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      } else if (normalized.includes('created_at ASC')) {
        rows.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
      } else if (normalized.includes('sort_order ASC')) {
        rows.sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
      } else if (normalized.includes('COALESCE')) {
        rows.sort((a, b) => {
          const dateA = a.start_date || a.due_date || a.created_at || '';
          const dateB = b.start_date || b.due_date || b.created_at || '';
          return String(dateA).localeCompare(String(dateB));
        });
      }
    }

    if (/LIMIT\s+1/i.test(normalized)) {
      rows = rows.slice(0, 1);
    }

    if (/COUNT\(\*\)\s+as\s+count/i.test(normalized)) {
      return [{ count: rows.length }] as any;
    }

    if (/SELECT\s+DISTINCT\s+category/i.test(normalized)) {
      const categories = Array.from(new Set(rows.map((r) => r.category).filter(Boolean)));
      return categories.map((cat) => ({ category: cat })) as any;
    }

    return rows as T[];
  }

  async get<T = any>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.all<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  createRunner(): LocalDatabase {
    return {
      run: (sql, params = []) => this.run(sql, params),
      all: <T = any>(sql: string, params: unknown[] = []) => this.all<T>(sql, params),
      get: <T = any>(sql: string, params: unknown[] = []) => this.get<T>(sql, params),
      transaction: async <T>(callback: (tx: LocalDatabase) => Promise<T>) => {
        return callback(this.createRunner());
      },
    };
  }
}

export const mockInMemoryDB = new InMemoryDatabase();
export const inMemoryDB = mockInMemoryDB;
export const mockDatabaseRunner = mockInMemoryDB.createRunner();
