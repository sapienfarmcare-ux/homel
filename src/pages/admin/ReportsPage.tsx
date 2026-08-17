import { useState, useEffect, useCallback } from 'react';
import { FileText, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { formatKES, formatDate, formatDateTime, exportToCSV, getMonthName } from '@/lib/utils';
import { Card, CardHeader, Button, Select, Input, EmptyState, LoadingSpinner } from '@/components/ui';
import type { ContributionCategory, AppUser } from '@/types';

type ReportType = 'daily' | 'weekly' | 'monthly' | 'annual' | 'member' | 'category' | 'defaulters' | 'outstanding' | 'transactions' | 'unmatched' | 'sms' | 'registration';

export function ReportsPage() {
  const toast = useToast();
  const [reportType, setReportType] = useState<ReportType>('daily');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [memberFilter, setMemberFilter] = useState('');
  const [categories, setCategories] = useState<ContributionCategory[]>([]);
  const [members, setMembers] = useState<AppUser[]>([]);
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    supabase.from('contribution_categories').select('*').then(({ data }) => setCategories((data || []) as ContributionCategory[]));
    supabase.from('app_users').select('*').eq('role', 'member').order('full_name').then(({ data }) => setMembers((data || []) as AppUser[]));
  }, []);

  const runReport = useCallback(async () => {
    setLoading(true);
    setHasRun(true);
    try {
      let query = supabase.from('transactions').select('*').order('transaction_date', { ascending: false });
      if (startDate) query = query.gte('transaction_date', new Date(startDate).toISOString());
      if (endDate) { const end = new Date(endDate); end.setDate(end.getDate() + 1); query = query.lt('transaction_date', end.toISOString()); }
      if (categoryFilter !== 'all') query = query.eq('category_id', categoryFilter);
      if (memberFilter) query = query.eq('member_id', memberFilter);
      const { data: txData } = await query.limit(500);
      setData((txData || []) as Record<string, unknown>[]);
    } catch {
      toast.error('Failed to generate report');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, categoryFilter, memberFilter, toast]);

  function handleExport() {
    if (data.length === 0) return;
    const headers = ['Date', 'Member', 'Phone', 'Amount', 'Reference', 'Provider', 'Status'];
    exportToCSV(`report-${reportType}.csv`, headers, data.map((t) => [formatDateTime(t.transaction_date as string), t.member_name_snapshot as string, t.phone as string, Number(t.amount), t.reference as string || '', t.provider as string || '', t.status as string]));
    toast.success('Report exported');
  }

  const reportTypes: { value: ReportType; label: string }[] = [
    { value: 'daily', label: 'Daily Contributions' },
    { value: 'weekly', label: 'Weekly Contributions' },
    { value: 'monthly', label: 'Monthly Contributions' },
    { value: 'annual', label: 'Annual Contributions' },
    { value: 'member', label: 'Member Contribution Report' },
    { value: 'category', label: 'Category Report' },
    { value: 'defaulters', label: 'Defaulters Report' },
    { value: 'outstanding', label: 'Outstanding Balance Report' },
    { value: 'transactions', label: 'Payment Transactions' },
    { value: 'unmatched', label: 'Unmatched Payments' },
    { value: 'sms', label: 'SMS Processing Report' },
    { value: 'registration', label: 'Member Registration Report' },
  ];

  const total = data.reduce((sum, r) => sum + Number(r.amount || 0), 0);

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-gray-900">Reports</h1><p className="text-sm text-gray-500 mt-1">Generate and export financial reports</p></div>

      <Card>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Select label="Report Type" value={reportType} onChange={(e) => setReportType(e.target.value as ReportType)}>
              {reportTypes.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>
            <Input label="Start Date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <Input label="End Date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            <Select label="Category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="all">All Categories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={handleExport} disabled={data.length === 0}><Download className="w-4 h-4" /> Export CSV</Button>
            <Button size="sm" onClick={runReport} loading={loading}>Generate Report</Button>
          </div>
        </div>
      </Card>

      {hasRun && (
        <Card>
          <CardHeader title="Report Results" subtitle={`${data.length} records - Total: ${formatKES(total)}`} />
          {loading ? <LoadingSpinner /> : data.length === 0 ? (
            <EmptyState icon={<FileText className="w-12 h-12" />} title="No data found" message="No records match your filter criteria. Try adjusting the date range or filters." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Member</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Phone</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Reference</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {data.slice(0, 50).map((t, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDateTime(t.transaction_date as string)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{(t.member_name_snapshot as string) || 'Unknown'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{t.phone as string}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">{formatKES(Number(t.amount))}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 font-mono text-xs">{(t.reference as string) || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{t.status as string}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.length > 50 && <p className="p-3 text-sm text-gray-500 text-center">Showing first 50 of {data.length} records. Export to see all.</p>}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
