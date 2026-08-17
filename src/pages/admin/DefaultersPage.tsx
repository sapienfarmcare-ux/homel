import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Download, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { formatKES, formatDate, exportToCSV, paginate, daysOverdue, getMonthName } from '@/lib/utils';
import { Card, Button, Select, Badge, EmptyState, LoadingSpinner, Pagination, Modal } from '@/components/ui';
import type { ContributionCategory, AppUser } from '@/types';

interface DefaulterRow {
  member: AppUser;
  category: ContributionCategory;
  expected: number;
  paid: number;
  outstanding: number;
  lastPayment: string | null;
  daysOverdue: number;
}

export function DefaultersPage() {
  const toast = useToast();
  const [defaulters, setDefaulters] = useState<DefaulterRow[]>([]);
  const [categories, setCategories] = useState<ContributionCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<DefaulterRow | null>(null);
  const pageSize = 15;

  const load = useCallback(async () => {
    setLoading(true);
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const [catRes, memberRes] = await Promise.all([
      supabase.from('contribution_categories').select('*').eq('is_active', true),
      supabase.from('app_users').select('*').eq('role', 'member').eq('is_disabled', false),
    ]);

    const cats = (catRes.data || []) as ContributionCategory[];
    const members = (memberRes.data || []) as AppUser[];
    setCategories(cats);

    const rows: DefaulterRow[] = [];
    for (const cat of cats) {
      if (categoryFilter !== 'all' && categoryFilter !== cat.id) continue;
      const req = Number(cat.monthly_requirement) || 0;
      if (req <= 0) continue;
      for (const member of members) {
        const { data: contribs } = await supabase.from('contributions').select('amount, created_at').eq('member_id', member.id).eq('category_id', cat.id).eq('period_year', year).eq('period_month', month);
        const paid = (contribs || []).reduce((s, c) => s + Number(c.amount), 0);
        if (paid < req) {
          const lastPayment = contribs && contribs.length > 0 ? contribs[contribs.length - 1].created_at : null;
          const dueDate = new Date(year, month - 1, cat.defaulter_grace_days + 1);
          rows.push({ member, category: cat, expected: req, paid, outstanding: req - paid, lastPayment, daysOverdue: daysOverdue(dueDate) });
        }
      }
    }
    rows.sort((a, b) => b.outstanding - a.outstanding);
    setDefaulters(rows);
    setLoading(false);
  }, [categoryFilter]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(defaulters.length / pageSize);
  const paged = paginate(defaulters, page, pageSize);

  function handleExport() {
    exportToCSV('defaulters.csv', ['Name', 'Phone', 'Category', 'Expected', 'Paid', 'Outstanding', 'Days Overdue'], defaulters.map((d) => [d.member.full_name, d.member.phone, d.category.name, d.expected, d.paid, d.outstanding, d.daysOverdue]));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold text-gray-900">Defaulters</h1><p className="text-sm text-gray-500 mt-1">Members who haven't met their contribution obligations</p></div>
        <div className="flex gap-2">
          <Select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }} className="w-auto">
            <option value="all">All Categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          {defaulters.length > 0 && <Button variant="outline" size="sm" onClick={handleExport}><Download className="w-4 h-4" /> Export</Button>}
        </div>
      </div>

      <Card>
        {loading ? <LoadingSpinner /> : paged.length === 0 ? (
          <EmptyState icon={<AlertTriangle className="w-12 h-12" />} title="No defaulters" message="All members have met their contribution requirements for this period." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Member</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Category</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Expected</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Paid</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Outstanding</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Days Overdue</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {paged.map((d, i) => (
                    <tr key={`${d.member.id}-${d.category.id}-${i}`} className="hover:bg-gray-50">
                      <td className="px-4 py-3"><p className="text-sm font-medium text-gray-900">{d.member.full_name}</p><p className="text-xs text-gray-500">{d.member.phone}</p></td>
                      <td className="px-4 py-3 text-sm text-gray-600">{d.category.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatKES(d.expected)}</td>
                      <td className="px-4 py-3 text-sm text-emerald-600 text-right">{formatKES(d.paid)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-red-600 text-right">{formatKES(d.outstanding)}</td>
                      <td className="px-4 py-3 text-center"><Badge variant={d.daysOverdue > 30 ? 'danger' : 'warning'}>{d.daysOverdue} days</Badge></td>
                      <td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => setViewing(d)}><Send className="w-3.5 h-3.5" /> Remind</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </Card>

      {viewing && (
        <Modal isOpen={!!viewing} onClose={() => setViewing(null)} title="Send Reminder" size="md" footer={<><Button variant="secondary" onClick={() => setViewing(null)}>Close</Button><Button onClick={() => { toast.info('SMS provider integration required to send reminders. Configure in Settings.'); setViewing(null); }}>Send Reminder</Button></>}>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Send a contribution reminder to <span className="font-semibold">{viewing.member.full_name}</span> for <span className="font-semibold">{viewing.category.name}</span>.</p>
            <div className="p-3 bg-gray-50 rounded-lg text-sm space-y-1">
              <div className="flex justify-between"><span className="text-gray-500">Expected</span><span className="font-medium">{formatKES(viewing.expected)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Paid</span><span className="font-medium text-emerald-600">{formatKES(viewing.paid)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Outstanding</span><span className="font-medium text-red-600">{formatKES(viewing.outstanding)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Days Overdue</span><span className="font-medium">{viewing.daysOverdue} days</span></div>
            </div>
            <div className="p-3 bg-amber-50 rounded-lg">
              <p className="text-xs text-amber-700">To send actual SMS reminders, configure your SMS provider credentials in Settings. The system will use the reminder template from the contribution category.</p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
