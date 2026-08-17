import { useState, useEffect, useCallback } from 'react';
import { Bell, Plus, Trash2, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { logAudit } from '@/lib/audit';
import { formatDateTime } from '@/lib/utils';
import { Card, CardHeader, Button, Input, Select, Textarea, Modal, ConfirmDialog, Badge, EmptyState, LoadingSpinner } from '@/components/ui';
import type { Notification, NotificationPriority, RecipientType, AppUser } from '@/types';

export function NotificationsPage() {
  const toast = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Notification | null>(null);
  const [members, setMembers] = useState<AppUser[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false });
    if (error) toast.error('Failed to load notifications');
    else setNotifications((data || []) as Notification[]);
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(notif: Partial<Notification>, selectedMembers: string[]) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: created, error } = await supabase.from('notifications').insert({ ...notif, created_by: user?.id, status: 'sent' }).select().single();
    if (error) { toast.error(error.message); return; }
    if (notif.recipient_type === 'selected' && selectedMembers.length > 0 && created) {
      await supabase.from('notification_recipients').insert(selectedMembers.map((mId) => ({ notification_id: created.id, member_id: mId, is_read: false })));
    }
    await logAudit('notification_create', 'notifications', created?.id || '', undefined, notif);
    toast.success('Notification sent');
    setShowModal(false); load();
  }

  async function handleDelete(n: Notification) {
    await supabase.from('notifications').delete().eq('id', n.id);
    await logAudit('notification_delete', 'notifications', n.id);
    toast.success('Notification deleted');
    setDeleteTarget(null); load();
  }

  const priorityVariant = (p: string) => p === 'high' ? 'danger' : p === 'normal' ? 'info' : 'default';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold text-gray-900">Notifications</h1><p className="text-sm text-gray-500 mt-1">Send notifications to church members</p></div>
        <Button size="sm" onClick={() => { setShowModal(true); supabase.from('app_users').select('*').eq('role', 'member').eq('is_disabled', false).then(({ data }) => setMembers((data || []) as AppUser[])); }}><Plus className="w-4 h-4" /> New Notification</Button>
      </div>

      {loading ? <LoadingSpinner /> : notifications.length === 0 ? (
        <Card><EmptyState icon={<Bell className="w-12 h-12" />} title="No notifications yet" message="Create notifications to inform members about church activities and contributions." action={<Button size="sm" onClick={() => setShowModal(true)}><Plus className="w-4 h-4" /> New Notification</Button>} /></Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <Card key={n.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-base font-semibold text-gray-900">{n.title}</h3>
                    <Badge variant={priorityVariant(n.priority)}>{n.priority}</Badge>
                    <Badge variant="info">{n.recipient_type}</Badge>
                  </div>
                  <p className="text-sm text-gray-600">{n.message}</p>
                  <p className="text-xs text-gray-400 mt-2">{formatDateTime(n.created_at)}</p>
                </div>
                <button onClick={() => setDeleteTarget(n)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <NotificationModal isOpen={showModal} onClose={() => setShowModal(false)} onSave={handleCreate} members={members} />
      <ConfirmDialog isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => handleDelete(deleteTarget!)} title="Delete Notification" message="Are you sure you want to delete this notification?" confirmLabel="Delete" variant="danger" />
    </div>
  );
}

function NotificationModal({ isOpen, onClose, onSave, members }: { isOpen: boolean; onClose: () => void; onSave: (n: Partial<Notification>, selected: string[]) => void; members: AppUser[] }) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<NotificationPriority>('normal');
  const [recipientType, setRecipientType] = useState<RecipientType>('all');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  function toggleMember(id: string) {
    setSelectedMembers((prev) => prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]);
  }

  function submit() {
    if (!title.trim() || !message.trim()) return;
    onSave({ title, message, priority, recipient_type: recipientType }, selectedMembers);
    setTitle(''); setMessage(''); setPriority('normal'); setRecipientType('all'); setSelectedMembers([]);
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Notification" size="lg" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit}><Send className="w-4 h-4" /> Send</Button></>}>
      <div className="space-y-4">
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Special Thanksgiving Contribution" />
        <Textarea label="Message" value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="Write your notification message..." />
        <div className="grid grid-cols-2 gap-4">
          <Select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as NotificationPriority)}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </Select>
          <Select label="Recipients" value={recipientType} onChange={(e) => setRecipientType(e.target.value as RecipientType)}>
            <option value="all">All Members</option>
            <option value="selected">Selected Members</option>
            <option value="defaulters">Defaulters</option>
          </Select>
        </div>
        {recipientType === 'selected' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Select Members</label>
            <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-50">
              {members.length === 0 ? <p className="p-3 text-sm text-gray-500 text-center">No members available</p> : members.map((m) => (
                <label key={m.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={selectedMembers.includes(m.id)} onChange={() => toggleMember(m.id)} className="w-4 h-4 rounded border-gray-300 text-primary-600" />
                  <div><p className="text-sm font-medium text-gray-900">{m.full_name}</p><p className="text-xs text-gray-500">{m.phone}</p></div>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
