import { useState, useEffect } from 'react';
import { Wallet, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { formatKES, formatDate, exportToCSV } from '@/lib/utils';
import { Card, CardHeader, EmptyState, LoadingSpinner, Badge } from '@/components/ui';
import type { Transaction } from '@/types';

export function MemberContributions() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from('transactions').select('*').eq('member_id', user.id).order('transaction_date', { ascending: false }).then(({ data }) => {
      setTransactions((data || []) as Transaction[]);
      setLoading(false);
    });
  }, [user]);

  function handleExport() {
    exportToCSV('my-contributions.csv', ['Date', 'Amount', 'Reference', 'Provider', 'Status'], transactions.map((t) => [formatDate(t.transaction_date), Number(t.amount), t.reference || '', t.provider || '', t.status]));
  }

  if (loading) return <LoadingSpinner />;
  const total = transactions.filter((t) => t.status === 'processed').reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900">My Contributions</h1><p className="text-sm text-gray-500">Total: {formatKES(total)}</p></div>
        {transactions.length > 0 && <button onClick={handleExport} className="p-2 text-gray-500 hover:text-primary-600"><Download className="w-5 h-5" /></button>}
      </div>

      {transactions.length === 0 ? (
        <Card><EmptyState icon={<Wallet className="w-12 h-12" />} title="No contributions yet" message="Your payment history will appear here once contributions are recorded." /></Card>
      ) : (
        <div className="space-y-2">
          {transactions.map((t) => (
            <Card key={t.id} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-base font-bold text-gray-900">{formatKES(Number(t.amount))}</p>
                  <p className="text-xs text-gray-500 mt-1">Ref: {t.reference || 'N/A'}</p>
                  <p className="text-xs text-gray-500">{t.provider || 'Unknown provider'}</p>
                  <p className="text-xs text-gray-400 mt-1">{formatDate(t.transaction_date)}</p>
                </div>
                <Badge variant={t.status === 'processed' ? 'success' : t.status === 'reversed' ? 'danger' : 'warning'}>{t.status.replace('_', ' ')}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
