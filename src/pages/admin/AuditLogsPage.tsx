import { useState, useEffect, useCallback } from 'react';
import { ScrollText, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatDateTime, exportToCSV, paginate } from '@/lib/utils';
import { Card, Button, EmptyState, LoadingSpinner, Pagination, Input } from '@/components/ui';
import type { AuditLog, AppUser } from '@/types';

export function AuditLogsPage() {
  const [logs, setLogs] = useState<(AuditLog & { user_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) { setLogs([]); setLoading(false); return; }
    const logData = (data || []) as AuditLog[];
    // Fetch user names
    const userIds = [...new Set(logData.map((l) => l.user_id).filter(Boolean))] as string[];
    let userMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase.from('app_users').select('id, full_name').in('id', userIds);
      userMap = Object.fromEntries((users || []).map((u) => [u.id, u.full_name]));
    }
    const withNames = logData.map((l) => ({ ...l, user_name: l.user_id ? userMap[l.user_id] || 'Unknown' : 'System' }));
    setLogs(withNames);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  let filtered = logs;
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter((l) => l.action.toLowerCase().includes(q) || (l.user_name || '').toLowerCase().includes(q) || l.entity_type.toLowerCase().includes(q));
  }

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paged = paginate(filtered, page, pageSize);

  function handleExport() {
    exportToCSV('audit-logs.csv', ['Date', 'User', 'Action', 'Entity Type', 'Entity ID'], filtered.map((l) => [formatDateTime(l.created_at), l.user_name || 'System', l.action, l.entity_type, l.entity_id]));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1><p className="text-sm text-gray-500 mt-1">Complete trail of all system actions</p></div>
        {logs.length > 0 && <Button variant="outline" size="sm" onClick={handleExport}><Download className="w-4 h-4" /> Export</Button>}
      </div>

      <Card>
        <div className="p-4 border-b border-gray-100">
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search by action, user, or entity..." />
        </div>
        {loading ? <LoadingSpinner /> : paged.length === 0 ? (
          <EmptyState icon={<ScrollText className="w-12 h-12" />} title="No audit logs" message="System actions will be recorded here as they occur." />
        ) : (
          <>
            <div className="divide-y divide-gray-50">
              {paged.map((log) => (
                <div key={log.id} className="px-4 py-3 flex items-start gap-3">
                  <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0"><ScrollText className="w-4 h-4 text-gray-500" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-gray-900">{log.action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</p>
                      {log.entity_type && <span className="text-xs text-gray-400">on {log.entity_type}</span>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{log.user_name || 'System'} - {formatDateTime(log.created_at)}</p>
                    {log.before_values && log.after_values && (
                      <div className="mt-1 text-xs text-gray-400">
                        <span>Changed from: {JSON.stringify(log.before_values).substring(0, 80)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
