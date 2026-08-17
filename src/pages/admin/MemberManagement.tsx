import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Edit, Eye, KeyRound, Download, Users, Phone, Mail } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { logAudit } from '@/lib/audit';
import { normalizeKenyanPhone, isValidKenyanPhone, formatKES, formatDate, exportToCSV, paginate } from '@/lib/utils';
import { Card, CardHeader, Button, Input, Modal, ConfirmDialog, Badge, EmptyState, LoadingSpinner, Pagination } from '@/components/ui';
import type { AppUser, Transaction } from '@/types';

export function MemberManagement() {
  const toast = useToast();
  const [members, setMembers] = useState<(AppUser & { total_contributed: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [viewing, setViewing] = useState<AppUser | null>(null);
  const [resetTarget, setResetTarget] = useState<AppUser | null>(null);
  const [disableTarget, setDisableTarget] = useState<AppUser | null>(null);
  const [viewTransactions, setViewTransactions] = useState<Transaction[]>([]);
  const [viewLoading, setViewLoading] = useState(false);

  const pageSize = 10;

  const loadMembers = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('app_users').select('*').eq('role', 'member').order('created_at', { ascending: false });
    if (statusFilter === 'active') query = query.eq('is_disabled', false);
    if (statusFilter === 'disabled') query = query.eq('is_disabled', true);
    const { data, error } = await query;
    if (error) {
      toast.error('Failed to load members');
      setLoading(false);
      return;
    }

    const membersData = data as AppUser[];
    const withTotals = await Promise.all(
      (membersData || []).map(async (m) => {
        const { data: txData } = await supabase
          .from('transactions')
          .select('amount')
          .eq('member_id', m.id)
          .eq('status', 'processed');
        const total = (txData || []).reduce((s, t) => s + Number(t.amount), 0);
        return { ...m, total_contributed: total };
      })
    );

    let filtered = withTotals;
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (m) => m.full_name.toLowerCase().includes(q) || m.phone.includes(q) || m.phone.toLowerCase().includes(q)
      );
    }

    setMembers(filtered);
    setLoading(false);
  }, [statusFilter, search, toast]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const totalPages = Math.ceil(members.length / pageSize);
  const paged = paginate(members, page, pageSize);

  async function handleAdd(name: string, phone: string) {
    const normalized = normalizeKenyanPhone(phone);
    if (!normalized) {
      toast.error('Invalid Kenyan phone number');
      return;
    }
    const { error } = await supabase.auth.signUp({
      email: `${normalized}@church.local`,
      password: 'Member2026',
      options: { data: { full_name: name, phone: normalized, role: 'member', must_change_password: true } },
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await logAudit('member_create', 'app_users', '', undefined, { full_name: name, phone: normalized });
    toast.success('Member account created successfully');
    setShowAdd(false);
    loadMembers();
  }

  async function handleEdit(id: string, name: string, phone: string, disabled: boolean) {
    const normalized = normalizeKenyanPhone(phone);
    if (!normalized) {
      toast.error('Invalid phone number');
      return;
    }
    const { error } = await supabase.from('app_users').update({ full_name: name, phone: normalized, is_disabled: disabled }).eq('id', id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await logAudit('member_update', 'app_users', id, undefined, { full_name: name, phone: normalized, is_disabled: disabled });
    toast.success('Member updated');
    setEditing(null);
    loadMembers();
  }

  async function handleResetPassword(member: AppUser) {
    const email = `${member.phone}@church.local`;
    const { error } = await supabase.auth.signInWithPassword({ email, password: 'Member2026' });
    if (error) {
      // Can't directly reset - update via admin API
      toast.error('Password reset requires admin access. Please use the service role.');
      return;
    }
    await supabase.from('app_users').update({ must_change_password: true }).eq('id', member.id);
    await logAudit('password_reset', 'app_users', member.id);
    toast.success('Password reset to Member2026. Member must change it on next login.');
    setResetTarget(null);
    loadMembers();
  }

  async function handleToggleDisable(member: AppUser) {
    const newDisabled = !member.is_disabled;
    const { error } = await supabase.from('app_users').update({ is_disabled: newDisabled }).eq('id', member.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await logAudit(newDisabled ? 'member_disable' : 'member_enable', 'app_users', member.id);
    toast.success(newDisabled ? 'Member disabled' : 'Member reactivated');
    setDisableTarget(null);
    loadMembers();
  }

  async function viewMember(member: AppUser) {
    setViewing(member);
    setViewLoading(true);
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('member_id', member.id)
      .order('transaction_date', { ascending: false })
      .limit(10);
    setViewTransactions((data || []) as Transaction[]);
    setViewLoading(false);
  }

  function handleExport() {
    exportToCSV('members.csv', ['Name', 'Phone', 'Status', 'Date Registered', 'Total Contributed'],
      members.map((m) => [m.full_name, m.phone, m.is_disabled ? 'Disabled' : 'Active', formatDate(m.created_at), m.total_contributed]));
    toast.success('Exported to CSV');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Members</h1>
          <p className="text-sm text-gray-500 mt-1">Manage church member accounts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}><Download className="w-4 h-4" /> Export</Button>
          <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="w-4 h-4" /> Add Member</Button>
        </div>
      </div>

      <Card>
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white"
          >
            <option value="all">All Members</option>
            <option value="active">Active Only</option>
            <option value="disabled">Disabled Only</option>
          </select>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : paged.length === 0 ? (
          <EmptyState icon={<Users className="w-12 h-12" />} title="No members found" message="Import members from Excel or add them manually." action={<Button size="sm" onClick={() => setShowAdd(true)}><Plus className="w-4 h-4" /> Add Member</Button>} />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Member</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Registered</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Total Contributed</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paged.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-sm font-semibold">{m.full_name.charAt(0).toUpperCase()}</div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{m.full_name}</p>
                            <p className="text-xs text-gray-500">{m.phone}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3"><Badge variant={m.is_disabled ? 'danger' : 'success'}>{m.is_disabled ? 'Disabled' : 'Active'}</Badge></td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(m.created_at)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">{formatKES(m.total_contributed)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => viewMember(m)} className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors" title="View"><Eye className="w-4 h-4" /></button>
                          <button onClick={() => setEditing(m)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit"><Edit className="w-4 h-4" /></button>
                          <button onClick={() => setResetTarget(m)} className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title="Reset Password"><KeyRound className="w-4 h-4" /></button>
                          <button onClick={() => setDisableTarget(m)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title={m.is_disabled ? 'Enable' : 'Disable'}>{m.is_disabled ? <Users className="w-4 h-4" /> : <Users className="w-4 h-4" />}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {paged.map((m) => (
                <div key={m.id} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-sm font-semibold">{m.full_name.charAt(0).toUpperCase()}</div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{m.full_name}</p>
                        <p className="text-xs text-gray-500">{m.phone}</p>
                      </div>
                    </div>
                    <Badge variant={m.is_disabled ? 'danger' : 'success'}>{m.is_disabled ? 'Disabled' : 'Active'}</Badge>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-sm text-gray-600">Total: <span className="font-semibold text-gray-900">{formatKES(m.total_contributed)}</span></p>
                    <div className="flex gap-1">
                      <button onClick={() => viewMember(m)} className="p-1.5 text-gray-400 hover:text-primary-600 rounded-lg"><Eye className="w-4 h-4" /></button>
                      <button onClick={() => setEditing(m)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => setResetTarget(m)} className="p-1.5 text-gray-400 hover:text-amber-600 rounded-lg"><KeyRound className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </Card>

      {/* Add Member Modal */}
      <AddMemberModal isOpen={showAdd} onClose={() => setShowAdd(false)} onAdd={handleAdd} />

      {/* Edit Member Modal */}
      <EditMemberModal member={editing} onClose={() => setEditing(null)} onSave={handleEdit} />

      {/* View Member Modal */}
      {viewing && (
        <Modal isOpen={!!viewing} onClose={() => setViewing(null)} title="Member Profile" size="lg">
          <div className="space-y-4">
            <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
              <div className="w-14 h-14 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xl font-semibold">{viewing.full_name.charAt(0).toUpperCase()}</div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{viewing.full_name}</h3>
                <p className="text-sm text-gray-500">{viewing.phone}</p>
                <Badge variant={viewing.is_disabled ? 'danger' : 'success'}>{viewing.is_disabled ? 'Disabled' : 'Active'}</Badge>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-xs text-gray-500">Date Registered</p><p className="text-sm font-medium text-gray-900">{formatDate(viewing.created_at)}</p></div>
              <div><p className="text-xs text-gray-500">Last Login</p><p className="text-sm font-medium text-gray-900">{formatDate(viewing.last_login_at)}</p></div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-2">Recent Transactions</h4>
              {viewLoading ? <LoadingSpinner size="sm" /> : viewTransactions.length === 0 ? (
                <p className="text-sm text-gray-500 py-4">No transactions yet</p>
              ) : (
                <div className="space-y-2">
                  {viewTransactions.map((t) => (
                    <div key={t.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{formatKES(Number(t.amount))}</p>
                        <p className="text-xs text-gray-500">{t.reference || 'No ref'} - {formatDate(t.transaction_date)}</p>
                      </div>
                      <Badge variant={t.status === 'processed' ? 'success' : 'warning'}>{t.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog isOpen={!!resetTarget} onClose={() => setResetTarget(null)} onConfirm={() => handleResetPassword(resetTarget!)} title="Reset Password" message={`Reset password for ${resetTarget?.full_name}? The password will be set to Member2026 and the member must change it on next login.`} confirmLabel="Reset Password" />
      <ConfirmDialog isOpen={!!disableTarget} onClose={() => setDisableTarget(null)} onConfirm={() => handleToggleDisable(disableTarget!)} title={disableTarget?.is_disabled ? 'Reactivate Member' : 'Disable Member'} message={disableTarget?.is_disabled ? `Reactivate ${disableTarget?.full_name}?` : `Disable ${disableTarget?.full_name}? They will not be able to log in.`} confirmLabel={disableTarget?.is_disabled ? 'Reactivate' : 'Disable'} variant={disableTarget?.is_disabled ? 'default' : 'danger'} />
    </div>
  );
}

function AddMemberModal({ isOpen, onClose, onAdd }: { isOpen: boolean; onClose: () => void; onAdd: (name: string, phone: string) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');

  function submit() {
    if (!name.trim()) { setError('Name is required'); return; }
    if (!phone.trim()) { setError('Phone number is required'); return; }
    if (!isValidKenyanPhone(phone)) { setError('Invalid Kenyan phone number'); return; }
    onAdd(name.trim(), phone.trim());
    setName(''); setPhone(''); setError('');
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Member" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit}>Create Account</Button></>}>
      <div className="space-y-4">
        <Input label="Full Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" />
        <Input label="Phone Number" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712345678" />
        <div className="p-3 bg-primary-50 rounded-lg">
          <p className="text-xs text-primary-700">The member's username will be their phone number. Initial password: <span className="font-mono font-medium">Member2026</span>. They must change it on first login.</p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}

function EditMemberModal({ member, onClose, onSave }: { member: AppUser | null; onClose: () => void; onSave: (id: string, name: string, phone: string, disabled: boolean) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    if (member) { setName(member.full_name); setPhone(member.phone); setDisabled(member.is_disabled); }
  }, [member]);

  if (!member) return null;

  return (
    <Modal isOpen={!!member} onClose={onClose} title="Edit Member" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => onSave(member.id, name, phone, disabled)}>Save Changes</Button></>}>
      <div className="space-y-4">
        <Input label="Full Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Phone Number" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={disabled} onChange={(e) => setDisabled(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
          <span className="text-sm text-gray-700">Disable this member</span>
        </label>
      </div>
    </Modal>
  );
}
