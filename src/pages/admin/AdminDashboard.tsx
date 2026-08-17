import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, Wallet, TrendingUp, AlertTriangle, Bell, FileText, CheckCircle, ArrowRight, Settings } from 'lucide-react';
import { BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { supabase } from '@/lib/supabase';
import { formatKES, getMonthName } from '@/lib/utils';
import { Card, CardHeader, LoadingSpinner, EmptyState, Badge } from '@/components/ui';

const CHART_COLORS = ['#0d9488', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899'];

interface DashboardStats {
  totalMembers: number;
  activeMembers: number;
  totalContributions: number;
  contributionsThisMonth: number;
  contributionsToday: number;
  outstanding: number;
  defaulters: number;
  unmatched: number;
}

export function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [monthlyTrend, setMonthlyTrend] = useState<{ month: string; amount: number }[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<{ name: string; value: number }[]>([]);
  const [targetVsActual, setTargetVsActual] = useState<{ name: string; target: number; actual: number }[]>([]);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const todayStart = new Date(year, now.getMonth(), now.getDate()).toISOString();
      const todayEnd = new Date(year, now.getMonth(), now.getDate() + 1).toISOString();
      const monthStart = new Date(year, now.getMonth(), 1).toISOString();

      const [membersRes, activeRes, totalRes, monthRes, todayRes, unmatchedRes, settingsRes, categoriesRes] = await Promise.all([
        supabase.from('app_users').select('id', { count: 'exact', head: true }).eq('role', 'member'),
        supabase.from('app_users').select('id', { count: 'exact', head: true }).eq('role', 'member').eq('is_disabled', false),
        supabase.from('transactions').select('amount').eq('status', 'processed'),
        supabase.from('transactions').select('amount').eq('status', 'processed').gte('transaction_date', monthStart),
        supabase.from('transactions').select('amount').eq('status', 'processed').gte('transaction_date', todayStart).lt('transaction_date', todayEnd),
        supabase.from('unmatched_transactions').select('id', { count: 'exact', head: true }).eq('is_resolved', false),
        supabase.from('church_settings').select('setup_completed').maybeSingle(),
        supabase.from('contribution_categories').select('*').eq('is_active', true),
      ]);

      const totalContributions = (totalRes.data || []).reduce((sum, t) => sum + Number(t.amount), 0);
      const contributionsThisMonth = (monthRes.data || []).reduce((sum, t) => sum + Number(t.amount), 0);
      const contributionsToday = (todayRes.data || []).reduce((sum, t) => sum + Number(t.amount), 0);
      const activeMembers = activeRes.count || 0;
      const categories = categoriesRes.data || [];

      let outstanding = 0;
      let defaulters = 0;
      if (categories.length > 0 && activeMembers > 0) {
        for (const cat of categories) {
          const req = Number(cat.monthly_requirement) || 0;
          if (req > 0) {
            const expected = req * activeMembers;
            const { data: catContributions } = await supabase
              .from('contributions')
              .select('amount')
              .eq('category_id', cat.id)
              .eq('period_year', year)
              .eq('period_month', month);
            const paid = (catContributions || []).reduce((s, c) => s + Number(c.amount), 0);
            outstanding += Math.max(0, expected - paid);
          }
        }
        const { count: defaulterCount } = await supabase
          .from('app_users')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'member')
          .eq('is_disabled', false);
        defaulters = defaulterCount || 0;
      }

      setStats({
        totalMembers: membersRes.count || 0,
        activeMembers,
        totalContributions,
        contributionsThisMonth,
        contributionsToday,
        outstanding,
        defaulters,
        unmatched: unmatchedRes.count || 0,
      });
      setSetupNeeded(!settingsRes.data?.setup_completed);

      // Monthly trend - last 6 months
      const trend: { month: string; amount: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(year, now.getMonth() - i, 1);
        const m = d.getMonth() + 1;
        const y = d.getFullYear();
        const start = new Date(y, m - 1, 1).toISOString();
        const end = new Date(y, m, 1).toISOString();
        const { data } = await supabase
          .from('transactions')
          .select('amount')
          .eq('status', 'processed')
          .gte('transaction_date', start)
          .lt('transaction_date', end);
        const amount = (data || []).reduce((s, t) => s + Number(t.amount), 0);
        trend.push({ month: getMonthName(m).substring(0, 3), amount });
      }
      setMonthlyTrend(trend);

      // Category breakdown
      const breakdown: { name: string; value: number }[] = [];
      for (const cat of categories) {
        const { data } = await supabase
          .from('contributions')
          .select('amount')
          .eq('category_id', cat.id);
        const total = (data || []).reduce((s, c) => s + Number(c.amount), 0);
        if (total > 0) breakdown.push({ name: cat.name, value: total });
      }
      setCategoryBreakdown(breakdown);

      // Target vs actual
      const tvs: { name: string; target: number; actual: number }[] = [];
      for (const cat of categories) {
        const { data } = await supabase
          .from('contributions')
          .select('amount')
          .eq('category_id', cat.id)
          .eq('period_year', year)
          .eq('period_month', month);
        const actual = (data || []).reduce((s, c) => s + Number(c.amount), 0);
        tvs.push({ name: cat.name.substring(0, 15), target: Number(cat.target_amount), actual });
      }
      setTargetVsActual(tvs);
    } catch (e) {
      console.error('Dashboard error:', e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <LoadingSpinner label="Loading dashboard..." />;

  const cards = [
    { label: 'Total Members', value: stats?.totalMembers ?? 0, icon: Users, color: 'bg-blue-50 text-blue-600' },
    { label: 'Active Members', value: stats?.activeMembers ?? 0, icon: CheckCircle, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Total Contributions', value: formatKES(stats?.totalContributions ?? 0), icon: Wallet, color: 'bg-primary-50 text-primary-600' },
    { label: 'This Month', value: formatKES(stats?.contributionsThisMonth ?? 0), icon: TrendingUp, color: 'bg-amber-50 text-amber-600' },
    { label: 'Today', value: formatKES(stats?.contributionsToday ?? 0), icon: TrendingUp, color: 'bg-purple-50 text-purple-600' },
    { label: 'Outstanding', value: formatKES(stats?.outstanding ?? 0), icon: AlertTriangle, color: 'bg-red-50 text-red-600' },
    { label: 'Defaulters', value: stats?.defaulters ?? 0, icon: AlertTriangle, color: 'bg-orange-50 text-orange-600' },
    { label: 'Unmatched', value: stats?.unmatched ?? 0, icon: Bell, color: 'bg-pink-50 text-pink-600' },
  ];

  return (
    <div className="space-y-6">
      {setupNeeded && (
        <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-2xl p-5 text-white flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Settings className="w-6 h-6" />
            <div>
              <p className="font-semibold">Complete your church setup</p>
              <p className="text-sm text-primary-100">Configure your church details, contribution categories, and import members.</p>
            </div>
          </div>
          <Link to="/admin/setup" className="inline-flex items-center gap-2 px-4 py-2 bg-white text-primary-700 rounded-lg text-sm font-medium hover:bg-primary-50 transition-colors">
            Start Setup <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Overview of your church contribution system</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card key={card.label} className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${card.color}`}>
                <card.icon className="w-5 h-5" />
              </div>
            </div>
            <p className="text-xs text-gray-500 font-medium mb-1">{card.label}</p>
            <p className="text-xl font-bold text-gray-900">{card.value}</p>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Monthly Contribution Trend" subtitle="Last 6 months" />
          <div className="p-4 h-72">
            {monthlyTrend.every((d) => d.amount === 0) ? (
              <EmptyState icon={<TrendingUp className="w-12 h-12" />} title="No contribution data yet" message="Contributions will appear here once SMS payments are processed." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                  <Tooltip formatter={(v) => formatKES(Number(v))} />
                  <Bar dataKey="amount" fill="#0d9488" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Contribution Categories" subtitle="Breakdown by category" />
          <div className="p-4 h-72">
            {categoryBreakdown.length === 0 ? (
              <EmptyState icon={<Wallet className="w-12 h-12" />} title="No category data" message="Create contribution categories and process payments to see the breakdown." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoryBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e) => e.name}>
                    {categoryBreakdown.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatKES(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Monthly Target vs Actual" subtitle="Current month performance by category" />
          <div className="p-4 h-72">
            {targetVsActual.length === 0 ? (
              <EmptyState icon={<FileText className="w-12 h-12" />} title="No targets set" message="Set target amounts on your contribution categories to track progress." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={targetVsActual}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                  <Tooltip formatter={(v) => formatKES(Number(v))} />
                  <Legend />
                  <Bar dataKey="target" name="Target" fill="#e5e7eb" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="actual" name="Actual" fill="#0d9488" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
