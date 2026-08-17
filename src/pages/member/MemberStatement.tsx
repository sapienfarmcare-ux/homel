import { useState, useEffect, useRef } from 'react';
import { FileText, Download, Printer } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { formatKES, formatDate, getMonthName } from '@/lib/utils';
import { Card, Button, EmptyState, LoadingSpinner, Input } from '@/components/ui';
import type { Transaction, ChurchSettings } from '@/types';

export function MemberStatement() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [church, setChurch] = useState<ChurchSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [txRes, churchRes] = await Promise.all([
        supabase.from('transactions').select('*').eq('member_id', user.id).eq('status', 'processed').order('transaction_date', { ascending: true }),
        supabase.from('church_settings').select('*').maybeSingle(),
      ]);
      setTransactions((txRes.data || []) as Transaction[]);
      setChurch(churchRes.data as ChurchSettings);
      setLoading(false);
    })();
  }, [user]);

  let filtered = transactions;
  if (startDate) filtered = filtered.filter((t) => new Date(t.transaction_date) >= new Date(startDate));
  if (endDate) { const end = new Date(endDate); end.setDate(end.getDate() + 1); filtered = filtered.filter((t) => new Date(t.transaction_date) < end); }

  let runningTotal = 0;
  const rows = filtered.map((t) => {
    runningTotal += Number(t.amount);
    return { date: formatDate(t.transaction_date), reference: t.reference || 'N/A', amount: Number(t.amount), running: runningTotal };
  });

  function handlePrint() { window.print(); }

  function handlePDF() {
    const doc = new jsPDF();
    const churchName = church?.church_name || 'Church';
    doc.setFontSize(18); doc.text(churchName, 14, 20);
    doc.setFontSize(10); doc.text('Contribution Statement', 14, 28);
    doc.text(`Member: ${user?.full_name}`, 14, 36);
    doc.text(`Phone: ${user?.phone}`, 14, 42);
    doc.text(`Period: ${startDate || 'All time'} to ${endDate || 'Present'}`, 14, 48);
    autoTable(doc, {
      startY: 56, head: [['Date', 'Reference', 'Amount (KES)', 'Running Total']],
      body: rows.map((r) => [r.date, r.reference, r.amount.toFixed(2), r.running.toFixed(2)]),
      headStyles: { fillColor: [13, 148, 136] },
    });
    doc.save('contribution-statement.pdf');
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between no-print">
        <h1 className="text-xl font-bold text-gray-900">My Statement</h1>
        <div className="flex gap-2">
          <button onClick={handlePrint} className="p-2 text-gray-500 hover:text-primary-600"><Printer className="w-5 h-5" /></button>
          <button onClick={handlePDF} className="p-2 text-gray-500 hover:text-primary-600"><Download className="w-5 h-5" /></button>
        </div>
      </div>

      <Card className="p-4 no-print">
        <div className="grid grid-cols-2 gap-3">
          <Input label="From" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input label="To" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </Card>

      <div className="print-area" ref={printRef}>
        <Card className="p-6">
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold text-gray-900">{church?.church_name || 'Church'}</h1>
            <p className="text-sm text-gray-500">Contribution Statement</p>
            {church?.address && <p className="text-xs text-gray-400 mt-1">{church.address}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
            <div><p className="text-xs text-gray-500">Member Name</p><p className="font-medium text-gray-900">{user?.full_name}</p></div>
            <div><p className="text-xs text-gray-500">Phone</p><p className="font-medium text-gray-900">{user?.phone}</p></div>
            <div><p className="text-xs text-gray-500">Period</p><p className="font-medium text-gray-900">{startDate || 'All time'} - {endDate || 'Present'}</p></div>
            <div><p className="text-xs text-gray-500">Generated</p><p className="font-medium text-gray-900">{formatDate(new Date())}</p></div>
          </div>

          {rows.length === 0 ? <EmptyState icon={<FileText className="w-12 h-12" />} title="No transactions" message="No contributions found for the selected period." /> : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b-2 border-gray-200">
                  <th className="text-left py-2 text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="text-left py-2 text-xs font-medium text-gray-500 uppercase">Reference</th>
                  <th className="text-right py-2 text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="text-right py-2 text-xs font-medium text-gray-500 uppercase">Running Total</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="py-2 text-sm text-gray-600">{r.date}</td>
                      <td className="py-2 text-sm text-gray-600 font-mono text-xs">{r.reference}</td>
                      <td className="py-2 text-sm text-gray-900 text-right">{formatKES(r.amount)}</td>
                      <td className="py-2 text-sm font-semibold text-gray-900 text-right">{formatKES(r.running)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t-2 border-gray-200">
                  <td colSpan={2} className="py-3 text-sm font-bold text-gray-900">Total</td>
                  <td colSpan={2} className="py-3 text-sm font-bold text-gray-900 text-right">{formatKES(runningTotal)}</td>
                </tr></tfoot>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
