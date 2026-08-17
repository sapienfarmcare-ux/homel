import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, UserPlus, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { logAudit } from '@/lib/audit';
import { formatKES, formatDateTime, exportToCSV } from '@/lib/utils';
import { Card, Button, Modal, Badge, EmptyState, LoadingSpinner, Input } from '@/components/ui';
import type { UnmatchedTransaction, AppUser } from '@/types';

export function UnmatchedTransactions() {
  const toast = useToast();
  const [unmatched, setUnmatched] = useState<UnmatchedTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<UnmatchedTransaction | null>(null);
  const [members, setMembers] = useState<AppUser[]>([]);
  const [searchMember, setSearchMember] = useState('');
  const [selectedMember, setSelectedMember] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('unmatched_transactions').select('*').eq('is_resolved', false).order('created_at', { ascending: false });
    if (error) toast.error('Failed to load unmatched transactions');
    else setUnmatched((data || []) as UnmatchedTransaction[]);
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function openAssign(ut: UnmatchedTransaction) {
    setAssigning(ut);
    const { data } = await supabase.from('app_users').select('*').eq('role', 'member').eq('is_disabled', false).order('full_name');
    setMembers((data || []) as AppUser[]);
  }

  async function handleAssign() {
    if (!assigning || !selectedMember) { toast.error('Please select a member'); return; }
    const { data: { user } } = await supabase.auth.getUser();
    // Update transaction with member
    await supabase.from('transactions').update({ member_id: selectedMember, status: 'processed' }).eq('id', assigning.transaction_id);
    // Mark unmatched as resolved
    await supabase.from('unmatched_transactions').update({ is_resolved: true, assigned_to: selectedMember, assigned_by: user?.id, assigned_at: new Date().toISOString() }).eq('id', assigning.id);
    await logAudit('manual_transaction_assignment', 'unmatched_transactions', assigning.id, undefined, { assigned_to: selectedMember });
    toast.success('Transaction assigned to member');
    setAssigning(null); setSelectedMember(''); load();
  }

  function handleExport() {
    exportToCSV('unmatched-transactions.csv', ['Date', 'Phone', 'Name', 'Amount', 'Reference', 'Reason'], unmatched.map((u) => [formatDateTime(u.created_at), u.phone, u.member_name_snapshot, Number(u.amount), u.reference || '', u.reason]));
  }

  const filteredMembers = members.filter((m) => m.full_name.toLowerCase().includes(searchMember.toLowerCase()) || m.phone.includes(searchMember));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold text-gray-900">Unmatched Payments</h1><p className="text-sm text-gray-500 mt-1">Transactions that could not be matched to a member</p></div>
        {unmatched.length > 0 && <Button variant="outline" size="sm" onClick={handleExport}><Download className="w-4 h-4" /> Export</Button>}
      </div>

      {loading ? <LoadingSpinner /> : unmatched.length === 0 ? (
        <Card><EmptyState icon={<AlertTriangle className="w-12 h-12" />} title="No unmatched payments" message="All incoming SMS payments have been successfully matched to members." /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {unmatched.map((ut) => (
            <Card key={ut.id} className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center"><AlertTriangle className="w-5 h-5" /></div>
                <Badge variant="warning">Unmatched</Badge>
              </div>
              <p className="text-xl font-bold text-gray-900 mb-1">{formatKES(Number(ut.amount))}</p>
              <div className="space-y-1 text-sm">
                <p className="text-gray-600">Phone: <span className="font-mono">{ut.phone || 'N/A'}</span></p>
                <p className="text-gray-600">Name: {ut.member_name_snapshot || 'Unknown'}</p>
                <p className="text-gray-600">Ref: {ut.reference || 'N/A'}</p>
                <p className="text-gray-500 text-xs">{formatDateTime(ut.created_at)}</p>
                <p className="text-gray-500 text-xs">{ut.reason}</p>
              </div>
              <Button size="sm" className="w-full mt-3" onClick={() => openAssign(ut)}><UserPlus className="w-4 h-4" /> Assign to Member</Button>
            </Card>
          ))}
        </div>
      )}

      {assigning && (
        <Modal isOpen={!!assigning} onClose={() => { setAssigning(null); setSelectedMember(''); setSearchMember(''); }} title="Assign Transaction to Member" size="md" footer={<><Button variant="secondary" onClick={() => { setAssigning(null); setSelectedMember(''); }}>Cancel</Button><Button onClick={handleAssign} disabled={!selectedMember}>Assign</Button></>}>
          <div className="space-y-4">
            <div className="p-3 bg-gray-50 rounded-lg text-sm">
              <p className="text-gray-600">Amount: <span className="font-semibold text-gray-900">{formatKES(Number(assigning.amount))}</span></p>
              <p className="text-gray-600">Phone: <span className="font-mono">{assigning.phone || 'N/A'}</span></p>
              <p className="text-gray-600">Reference: {assigning.reference || 'N/A'}</p>
            </div>
            <Input label="Search Member" value={searchMember} onChange={(e) => setSearchMember(e.target.value)} placeholder="Search by name or phone..." />
            <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-50">
              {filteredMembers.length === 0 ? <p className="p-3 text-sm text-gray-500 text-center">No members found</p> : filteredMembers.map((m) => (
                <button key={m.id} onClick={() => setSelectedMember(m.id)} className={`w-full flex items-center gap-3 p-3 text-left transition-colors ${selectedMember === m.id ? 'bg-primary-50' : 'hover:bg-gray-50'}`}>
                  <div className="w-8 h-8 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-semibold">{m.full_name.charAt(0).toUpperCase()}</div>
                  <div><p className="text-sm font-medium text-gray-900">{m.full_name}</p><p className="text-xs text-gray-500">{m.phone}</p></div>
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
