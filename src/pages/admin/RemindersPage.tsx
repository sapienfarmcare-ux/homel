import { useState, useEffect, useCallback } from 'react';
import { Bell, Plus, Trash2, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { logAudit } from '@/lib/audit';
import { formatDateTime } from '@/lib/utils';
import { Card, CardHeader, Button, Input, Select, Textarea, Modal, ConfirmDialog, Badge, EmptyState, LoadingSpinner } from '@/components/ui';
import type { Reminder, ContributionCategory, RecipientType } from '@/types';

export function RemindersPage() {
  const toast = useToast();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [categories, setCategories] = useState<ContributionCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Reminder | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: rData }, { data: cData }] = await Promise.all([
      supabase.from('reminders').select('*').order('created_at', { ascending: false }),
      supabase.from('contribution_categories').select('*'),
    ]);
    setReminders((rData || []) as Reminder[]);
    setCategories((cData || []) as ContributionCategory[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(reminder: Partial<Reminder>) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('reminders').insert({ ...reminder, created_by: user?.id, status: 'sent' });
    if (error) { toast.error(error.message); return; }
    await logAudit('reminder_create', 'reminders', '', undefined, reminder);
    toast.success('Reminder created');
    setShowModal(false); load();
  }

  async function handleDelete(r: Reminder) {
    await supabase.from('reminders').delete().eq('id', r.id);
    await logAudit('reminder_delete', 'reminders', r.id);
    toast.success('Reminder deleted');
    setDeleteTarget(null); load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold text-gray-900">Reminders</h1><p className="text-sm text-gray-500 mt-1">Create and manage contribution reminders</p></div>
        <Button size="sm" onClick={() => setShowModal(true)}><Plus className="w-4 h-4" /> New Reminder</Button>
      </div>

      {loading ? <LoadingSpinner /> : reminders.length === 0 ? (
        <Card><EmptyState icon={<Bell className="w-12 h-12" />} title="No reminders yet" message="Create reminders to notify members about upcoming or missed contributions." action={<Button size="sm" onClick={() => setShowModal(true)}><Plus className="w-4 h-4" /> New Reminder</Button>} /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reminders.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2"><Bell className="w-5 h-5 text-primary-600" /><h3 className="text-base font-semibold text-gray-900">{r.title}</h3></div>
                <button onClick={() => setDeleteTarget(r)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
              </div>
              <p className="text-sm text-gray-600 mb-3 line-clamp-3">{r.message_template}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="info">{r.recipient_type}</Badge>
                <Badge variant={r.status === 'sent' ? 'success' : 'default'}>{r.status}</Badge>
                <span className="text-xs text-gray-500">{formatDateTime(r.created_at)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ReminderModal isOpen={showModal} onClose={() => setShowModal(false)} categories={categories} onSave={handleCreate} />
      <ConfirmDialog isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => handleDelete(deleteTarget!)} title="Delete Reminder" message="Are you sure you want to delete this reminder?" confirmLabel="Delete" variant="danger" />
    </div>
  );
}

function ReminderModal({ isOpen, onClose, categories, onSave }: { isOpen: boolean; onClose: () => void; categories: ContributionCategory[]; onSave: (r: Partial<Reminder>) => void }) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [recipientType, setRecipientType] = useState<RecipientType>('defaulters');

  function submit() {
    if (!title.trim() || !message.trim()) return;
    onSave({ title, message_template: message, category_id: categoryId || null, recipient_type: recipientType });
    setTitle(''); setMessage(''); setCategoryId(''); setRecipientType('defaulters');
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Reminder" size="lg" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit}><Send className="w-4 h-4" /> Create Reminder</Button></>}>
      <div className="space-y-4">
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Monthly Welfare Reminder" />
        <Textarea label="Message Template" value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="Dear {member_name}, your {contribution_name} of KES {amount_due} is due on {due_date}. Balance: KES {balance}." />
        <div className="p-3 bg-gray-50 rounded-lg"><p className="text-xs text-gray-600">Available variables: {'{member_name}, {amount_due}, {amount_paid}, {balance}, {contribution_name}, {due_date}'}</p></div>
        <div className="grid grid-cols-2 gap-4">
          <Select label="Category (optional)" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">No specific category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select label="Recipients" value={recipientType} onChange={(e) => setRecipientType(e.target.value as RecipientType)}>
            <option value="defaulters">Defaulters Only</option>
            <option value="all">All Members</option>
            <option value="category">Category Members</option>
            <option value="selected">Selected Members</option>
          </Select>
        </div>
      </div>
    </Modal>
  );
}
