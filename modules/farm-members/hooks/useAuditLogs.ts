import { useCallback, useEffect, useState } from 'react';
import { powersync } from '../../../lib/powersync';

export interface AuditLog {
  id: string;
  farm_id: string;
  farm_owner_id: string;
  user_id: string;
  action: string;
  details: string | Record<string, any>;
  created_at: string;
  // Joined fields
  user_email?: string;
  user_first_name?: string;
  user_last_name?: string;
}

export function useAuditLogs(farmId: string, isOwner: boolean = true) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await powersync.getAll<AuditLog>(
        `
        SELECT 
          al.*, 
          u.email as user_email, 
          u.first_name as user_first_name, 
          u.last_name as user_last_name 
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.user_id
        WHERE al.farm_id = ?
        ORDER BY al.created_at DESC
        LIMIT 500
        `,
        [farmId]
      );
      
      // Parse details if it's a string
      const parsedLogs = result.map(log => {
        let detailsObj = log.details;
        if (typeof log.details === 'string') {
          try {
            detailsObj = JSON.parse(log.details);
          } catch (e) {
            // keep as string
          }
        }
        return { ...log, details: detailsObj };
      });
      
      setLogs(parsedLogs);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [farmId, isOwner]);

  useEffect(() => {
    fetchLogs();
    
    const abortController = new AbortController();
    
    async function watchLogs() {
      for await (const update of powersync.watch(
        `SELECT * FROM audit_logs WHERE farm_id = ?`,
        [farmId],
        { signal: abortController.signal }
      )) {
        fetchLogs();
      }
    }
    
    watchLogs().catch(() => {});
    
    return () => {
      abortController.abort();
    };
  }, [fetchLogs, farmId, isOwner]);

  return {
    logs,
    loading,
    error,
    refresh: fetchLogs
  };
}
