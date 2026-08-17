import { useState, useEffect } from 'react';
import { Wallet, TrendingUp, AlertTriangle, Bell, ArrowRight, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { formatKES, formatDate, getMonthName } from '@/lib/utils';
import { Card, CardHeader, EmptyState, LoadingSpinner, Badge } from '@/components/ui';
import type { ContributionCategory, Transaction, Notification } from '@/types';

export function MemberDashboard() {
  const { user } = useAuth();
  const [totalContributed, setTotalContributed] = useState(0);
  const [thisMonth, setThisMonth] = useState(0);
  const [outstanding, setOutstanding] = useState(0);
  const [categories, setCategories] = useState<{ cat: ContributionCategory; paid: number; expected: number }[]>([]);
  const [recentPayments, setRecentPayments] = useState<Transaction[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const monthStart = new Date(year, now.getMonth(), 1).toISOString();

      const [totalRes, monthRes, catsRes, txRes, notifRes] = await Promise.all([
        supabase.from('transactions').select('amount').eq('member_id', user.id).eq('status', 'processed'),
        supabase.from('transactions').select('amount').eq('member_id', user.id).eq('status', 'processed').gte('transaction_date', monthStart),
        supabase.from('contribution_categories').select('*').eq('is_active', true),
        supabase.from('transactions').select('*').eq('member_id', user.id).order('transaction_date', { ascending: false }).limit(5),
        supabase.from('notifications').select('*').or('recipient_type.eq.all').order('created_at', { ascending: false }).limit(3),
      ]);

      setTotalContributed((totalRes.data || []).reduce((s, t) => s + Number(t.amount), 0));
      setThisMonth((monthRes.data || []).reduce((s, t) => s + Number(t.amount), 0));
      setRecentPayments((txRes.data || []) as Transaction[]);
      setNotifications((notifRes.data || []) as Notification[]);

      const cats = (catsRes.data || []) as ContributionCategory[];
      let totalOutstanding = 0;
      const catData: { cat: ContributionCategory; paid: number; expected: number }[] = [];
      for (const cat of cats) {
        const req = Number(cat.monthly_requirement) || 0;
        const { data: contribs } = await supabase.from('contributions').select('amount').eq('member_id', user.id).eq('category_id', cat.id).eq('period_year', year).eq('period_month', month);
        const paid = (contribs || []).reduce((s, c) => s + Number(c.amount), 0);
        const expected = req;
        if (expected > 0) totalOutstanding += Math.max(0, expected - paid);
        catData.push({ cat, paid, expected });
      }
      setOutstanding(totalOutstanding);
      setCategories(catData);
      setLoading(false);
    })();
  }, [user]);

  if (loading) return <LoadingSpinner label="Loading your dashboard..." />;

  return (
    <div className="p-4 space-y-5">
      {/* Welcome */}
      <div className="bg-gradient-to-br from-primary-700 to-primary-900 rounded-2xl p-5 text-white">
        <p className="text-primary-100 text-sm">Welcome back,</p>
        <h1 className="text-xl font-bold">{user?.full_name}</h1>
        <p className="text-xs text-primary-200 mt-1">{user?.phone}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4"><div className="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center mb-2"><Wallet className="w-4 h-4 text-primary-600" /></div><p className="text-xs text-gray-500">Total Contributed</p><p className="text-lg font-bold text-gray-900">{formatKES(totalContributed)}</p></Card>
        <Card className="p-4"><div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center mb-2"><TrendingUp className="w-4 h-4 text-emerald-600" /></div><p className="text-xs text-gray-500">This Month</p><p className="text-lg font-bold text-gray-900">{formatKES(thisMonth)}</p></Card>
        <Card className="p-4"><div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center mb-2"><AlertTriangle className="w-4 h-4 text-amber-600" /></div><p className="text-xs text-gray-500">Outstanding</p><p className="text-lg font-bold text-gray-900">{formatKES(outstanding)}</p></Card>
        <Card className="p-4"><div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center mb-2"><CheckCircle className="w-4 h-4 text-blue-600" /></div><p className="text-xs text-gray-500">Status</p><p className="text-lg font-bold text-gray-900">{outstanding > 0 ? 'Pending' : 'Current'}</p></Card>
      </div>

      {/* Contribution overview */}
      <Card>
        <CardHeader title="Contribution Overview" />
        <div className="p-4 space-y-3">
          {categories.length === 0 ? <p className="text-sm text-gray-500 py-4 text-center">No active contribution categories</p> : categories.map(({ cat, paid, expected }) => {
            const pct = expected > 0 ? Math.min(100, (paid / expected) * 100) : 0;
            return (
              <div key={cat.id}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-gray-900">{cat.name}</p>
                  <p className="text-xs text-gray-500">{formatKES(paid)} / {formatKES(expected)}</p>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-emerald-500' : 'bg-primary-500'}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="flex justify-between mt-0.5"><span className="text-xs text-gray-400">{pct.toFixed(0)}% complete</span>{pct >= 100 ? <Badge variant="success">Paid</Badge> : <Badge variant="warning">Outstanding: {formatKES(expected - paid)}</Badge>}</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Recent payments */}
      <Card>
        <CardHeader title="Recent Payments" action={<Link to="/member/contributions" className="text-xs text-primary-600 font-medium flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></Link>} />
        <div className="divide-y divide-gray-50">
          {recentPayments.length === 0 ? <EmptyState title="No payments yet" message="Your payment history will appear here." /> : recentPayments.map((t) => (
            <div key={t.id} className="px-4 py-3 flex items-center justify-between">
              <div><p className="text-sm font-medium text-gray-900">{formatKES(Number(t.amount))}</p><p className="text-xs text-gray-500">{t.reference || 'No ref'} - {formatDate(t.transaction_date)}</p></div>
              <Badge variant={t.status === 'processed' ? 'success' : 'warning'}>{t.status.replace('_', ' ')}</Badge>
            </div>
          ))}
        </div>
      </Card>

      {/* Notifications */}
      {notifications.length > 0 && (
        <Card>
          <CardHeader title="Recent Notifications" action={<Link to="/member/notifications" className="text-xs text-primary-600 font-medium flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></Link>} />
          <div className="divide-y divide-gray-50">
            {notifications.map((n) => (
              <div key={n.id} className="px-4 py-3"><p className="text-sm font-medium text-gray-900">{n.title}</p><p className="text-xs text-gray-500 mt-0.5">{n.message}</p><p className="text-xs text-gray-400 mt-1">{formatDate(n.created_at)}</p></div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
