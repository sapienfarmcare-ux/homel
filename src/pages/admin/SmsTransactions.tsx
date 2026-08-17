import { useState, useEffect, useCallback } from 'react';
import { Search, MessageSquare, Eye, Undo, CheckCircle, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { logAudit } from '@/lib/audit';
import { formatKES, formatDateTime, exportToCSV, paginate } from '@/lib/utils';
import { Card, Button, Modal, Badge, EmptyState, LoadingSpinner, Pagination, Input, Textarea } from '@/components/ui';
import type { Transaction, ContributionCategory } from '@/types';

export function SmsTransactions() {
  const toast = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<Transaction | null>(null);
  const [reversing, setReversing] = useState<Transaction | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [categories, setCategories] = useState<ContributionCategory[]>([]);
  const [assigningCategory, setAssigningCategory] = useState<Transaction | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('');

  const pageSize = 15;

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('transactions').select('*').order('transaction_date', { ascending: false });
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    const { data, error } = await query.limit(200);
    if (error) toast.error('Failed to load transactions');
    else {
      let filtered = (data || []) as Transaction[];
      if (search.trim()) {
        const q = search.toLowerCase();
        filtered = filtered.filter((t) => (t.reference || '').toLowerCase().includes(q) || t.phone.includes(q) || t.member_name_snapshot.toLowerCase().includes(q));
      }
      setTransactions(filtered);
    }
    setLoading(false);
  }, [statusFilter, search, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { supabase.from('contribution_categories').select('*').then(({ data }) => setCategories((data || []) as ContributionCategory[])); }, []);

  const totalPages = Math.ceil(transactions.length / pageSize);
  const paged = paginate(transactions, page, pageSize);

  async function handleReverse() {
    if (!reversing || !reversalReason.trim()) { toast.error('Please provide a reason'); return; }
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('transactions').update({ status: 'reversed', reversal_reason: reversalReason, reversed_by: user?.id, reversed_at: new Date().toISOString() }).eq('id', reversing.id);
    if (error) { toast.error(error.message); return; }
    // Remove associated contributions
    await supabase.from('contributions').delete().eq('transaction_id', reversing.id);
    await logAudit('transaction_reversal', 'transactions', reversing.id, undefined, { reason: reversalReason });
    toast.success('Transaction reversed');
    setReversing(null); setReversalReason(''); load();
  }

  async function handleAssignCategory() {
    if (!assigningCategory || !selectedCategory) return;
    const { error: txError } = await supabase.from('transactions').update({ category_id: selectedCategory, reviewed_at: new Date().toISOString() }).eq('id', assigningCategory.id);
    if (txError) { toast.error(txError.message); return; }
    // Create contribution record
    await supabase.from('contributions').insert({ member_id: assigningCategory.member_id, category_id: selectedCategory, transaction_id: assigningCategory.id, amount: Number(assigningCategory.amount), period_year: new Date(assigningCategory.transaction_date).getFullYear(), period_month: new Date(assigningCategory.transaction_date).getMonth() + 1 });
    await logAudit('transaction_assign_category', 'transactions', assigningCategory.id, undefined, { category_id: selectedCategory });
    toast.success('Category assigned');
    setAssigningCategory(null); setSelectedCategory(''); load();
  }

  function handleExport() {
    exportToCSV('transactions.csv', ['Date', 'Member', 'Phone', 'Amount', 'Reference', 'Provider', 'Status'], transactions.map((t) => [formatDateTime(t.transaction_date), t.member_name_snapshot, t.phone, Number(t.amount), t.reference || '', t.provider, t.status]));
  }

  const statusVariant = (s: string) => s === 'processed' ? 'success' : s === 'reversed' ? 'danger' : s === 'manual' ? 'info' : 'warning';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold text-gray-900">SMS Transactions</h1><p className="text-sm text-gray-500 mt-1">View and reconcile payment transactions</p></div>
        <Button variant="outline" size="sm" onClick={handleExport}><Download className="w-4 h-4" /> Export</Button>
      </div>

      <Card>
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search by reference, phone, or name..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" />
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20">
            <option value="all">All Status</option>
            <option value="processed">Processed</option>
            <option value="pending_review">Pending Review</option>
            <option value="reversed">Reversed</option>
            <option value="manual">Manual</option>
          </select>
        </div>

        {loading ? <LoadingSpinner /> : paged.length === 0 ? (
          <EmptyState icon={<MessageSquare className="w-12 h-12" />} title="No transactions yet" message="Transactions will appear here when SMS payments are processed." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Member</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Phone</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Reference</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {paged.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDateTime(t.transaction_date)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{t.member_name_snapshot || 'Unknown'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{t.phone}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">{formatKES(Number(t.amount))}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 font-mono text-xs">{t.reference || '—'}</td>
                      <td className="px-4 py-3"><Badge variant={statusVariant(t.status)}>{t.status.replace('_', ' ')}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setViewing(t)} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg" title="View"><Eye className="w-4 h-4" /></button>
                          {t.status === 'processed' && <>
                            <button onClick={() => setAssigningCategory(t)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Assign Category"><CheckCircle className="w-4 h-4" /></button>
                            <button onClick={() => setReversing(t)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Reverse"><Undo className="w-4 h-4" /></button>
                          </>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </Card>

      {/* View Modal */}
      {viewing && (
        <Modal isOpen={!!viewing} onClose={() => setViewing(null)} title="Transaction Details" size="md">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Amount</span><span className="font-semibold text-gray-900">{formatKES(Number(viewing.amount))}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Reference</span><span className="font-mono text-gray-900">{viewing.reference || 'N/A'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Member</span><span className="text-gray-900">{viewing.member_name_snapshot || 'Unknown'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Phone</span><span className="text-gray-900">{viewing.phone}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Provider</span><span className="text-gray-900">{viewing.provider || 'N/A'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Date</span><span className="text-gray-900">{formatDateTime(viewing.transaction_date)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Status</span><Badge variant={statusVariant(viewing.status)}>{viewing.status.replace('_', ' ')}</Badge></div>
            {viewing.reversal_reason && <div className="p-3 bg-red-50 rounded-lg"><p className="text-xs text-red-700">Reversal Reason: {viewing.reversal_reason}</p></div>}
          </div>
        </Modal>
      )}

      {/* Reverse Modal */}
      {reversing && (
        <Modal isOpen={!!reversing} onClose={() => { setReversing(null); setReversalReason(''); }} title="Reverse Transaction" footer={<><Button variant="secondary" onClick={() => { setReversing(null); setReversalReason(''); }}>Cancel</Button><Button variant="danger" onClick={handleReverse}>Reverse Transaction</Button></>}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">You are about to reverse a transaction of <span className="font-semibold">{formatKES(Number(reversing.amount))}</span> for <span className="font-semibold">{reversing.member_name_snapshot || 'Unknown'}</span>. This will remove the contribution record and cannot be undone.</p>
            <Textarea label="Reason for Reversal" value={reversalReason} onChange={(e) => setReversalReason(e.target.value)} rows={3} placeholder="Explain why this transaction is being reversed..." />
          </div>
        </Modal>
      )}

      {/* Assign Category Modal */}
      {assigningCategory && (
        <Modal isOpen={!!assigningCategory} onClose={() => { setAssigningCategory(null); setSelectedCategory(''); }} title="Assign to Category" footer={<><Button variant="secondary" onClick={() => { setAssigningCategory(null); setSelectedCategory(''); }}>Cancel</Button><Button onClick={handleAssignCategory}>Assign</Button></>}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Assign this transaction of <span className="font-semibold">{formatKES(Number(assigningCategory.amount))}</span> to a contribution category.</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
              <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20">
                <option value="">Select a category...</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
