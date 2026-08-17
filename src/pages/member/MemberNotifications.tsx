import { useState, useEffect } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { formatDateTime } from '@/lib/utils';
import { Card, CardHeader, Button, EmptyState, LoadingSpinner, Badge } from '@/components/ui';
import type { Notification } from '@/types';

export function MemberNotifications() {
  const { user } = useAuth();
  const toast = useToast();
  const [notifications, setNotifications] = useState<(Notification & { is_read?: boolean; recipient_id?: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      // Get all notifications (recipient_type = 'all' or addressed to this member)
      const { data: allNotifs } = await supabase.from('notifications').select('*').or('recipient_type.eq.all').order('created_at', { ascending: false });
      const { data: recipients } = await supabase.from('notification_recipients').select('*').eq('member_id', user.id);
      const recipientMap = new Map((recipients || []).map((r) => [r.notification_id, r]));

      const combined = ((allNotifs || []) as Notification[]).map((n) => {
        const rec = recipientMap.get(n.id);
        return { ...n, is_read: rec?.is_read ?? (n.recipient_type === 'all' ? false : true), recipient_id: rec?.id };
      });
      setNotifications(combined);
      setLoading(false);
    })();
  }, [user]);

  async function markAsRead(notifId: string, recipientId?: string) {
    if (!user) return;
    if (recipientId) {
      await supabase.from('notification_recipients').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', recipientId);
    } else {
      await supabase.from('notification_recipients').insert({ notification_id: notifId, member_id: user.id, is_read: true, read_at: new Date().toISOString() });
    }
    setNotifications((prev) => prev.map((n) => n.id === notifId ? { ...n, is_read: true } : n));
  }

  async function markAllRead() {
    for (const n of notifications.filter((n) => !n.is_read)) {
      await markAsRead(n.id, n.recipient_id);
    }
    toast.success('All notifications marked as read');
  }

  if (loading) return <LoadingSpinner />;
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900">Notifications</h1>{unreadCount > 0 && <p className="text-sm text-gray-500">{unreadCount} unread</p>}</div>
        {unreadCount > 0 && <Button size="sm" variant="outline" onClick={markAllRead}><CheckCheck className="w-4 h-4" /> Mark all read</Button>}
      </div>

      {notifications.length === 0 ? (
        <Card><EmptyState icon={<Bell className="w-12 h-12" />} title="No notifications" message="Church notifications will appear here." /></Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <Card key={n.id} className={`p-4 ${!n.is_read ? 'border-l-4 border-l-primary-500' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-gray-900">{n.title}</p>
                    {!n.is_read && <Badge variant="info">New</Badge>}
                    <Badge variant={n.priority === 'high' ? 'danger' : 'default'}>{n.priority}</Badge>
                  </div>
                  <p className="text-sm text-gray-600">{n.message}</p>
                  <p className="text-xs text-gray-400 mt-2">{formatDateTime(n.created_at)}</p>
                </div>
                {!n.is_read && <button onClick={() => markAsRead(n.id, n.recipient_id)} className="text-xs text-primary-600 font-medium hover:text-primary-700">Mark read</button>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
