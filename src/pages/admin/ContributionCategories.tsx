import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Trash2, Wallet, Calendar, Target } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { logAudit } from '@/lib/audit';
import { formatKES } from '@/lib/utils';
import { Card, CardHeader, Button, Input, Select, Textarea, Modal, ConfirmDialog, Badge, EmptyState, LoadingSpinner } from '@/components/ui';
import type { ContributionCategory, ContributionFrequency } from '@/types';

export function ContributionCategories() {
  const toast = useToast();
  const [categories, setCategories] = useState<ContributionCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ContributionCategory | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContributionCategory | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('contribution_categories').select('*').order('created_at', { ascending: false });
    if (error) toast.error('Failed to load categories');
    else setCategories((data || []) as ContributionCategory[]);
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(cat: Partial<ContributionCategory>) {
    if (editing) {
      const { error } = await supabase.from('contribution_categories').update(cat).eq('id', editing.id);
      if (error) { toast.error(error.message); return; }
      await logAudit('category_update', 'contribution_categories', editing.id, undefined, cat);
      toast.success('Category updated');
    } else {
      const { error } = await supabase.from('contribution_categories').insert(cat);
      if (error) { toast.error(error.message); return; }
      await logAudit('category_create', 'contribution_categories', '', undefined, cat);
      toast.success('Category created');
    }
    setShowModal(false); setEditing(null); load();
  }

  async function handleDelete(cat: ContributionCategory) {
    const { error } = await supabase.from('contribution_categories').delete().eq('id', cat.id);
    if (error) { toast.error(error.message); return; }
    await logAudit('category_delete', 'contribution_categories', cat.id);
    toast.success('Category deleted');
    setDeleteTarget(null); load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold text-gray-900">Contribution Categories</h1><p className="text-sm text-gray-500 mt-1">Manage types of church contributions</p></div>
        <Button size="sm" onClick={() => { setEditing(null); setShowModal(true); }}><Plus className="w-4 h-4" /> New Category</Button>
      </div>

      {loading ? <LoadingSpinner /> : categories.length === 0 ? (
        <Card><EmptyState icon={<Wallet className="w-12 h-12" />} title="No contribution categories" message="Create your first contribution category to start tracking payments." action={<Button size="sm" onClick={() => setShowModal(true)}><Plus className="w-4 h-4" /> New Category</Button>} /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((cat) => (
            <Card key={cat.id} className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-primary-50 text-primary-600 rounded-xl flex items-center justify-center"><Wallet className="w-5 h-5" /></div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditing(cat); setShowModal(true); }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><Edit className="w-4 h-4" /></button>
                  <button onClick={() => setDeleteTarget(cat)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-1">{cat.name}</h3>
              {cat.description && <p className="text-sm text-gray-500 mb-3 line-clamp-2">{cat.description}</p>}
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Frequency</span><span className="font-medium text-gray-900 capitalize">{cat.frequency.replace('_', ' ')}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Target</span><span className="font-medium text-gray-900">{formatKES(Number(cat.target_amount))}</span></div>
                {Number(cat.monthly_requirement) > 0 && <div className="flex justify-between"><span className="text-gray-500">Monthly Req.</span><span className="font-medium text-gray-900">{formatKES(Number(cat.monthly_requirement))}</span></div>}
                <div className="flex justify-between"><span className="text-gray-500">Grace Days</span><span className="font-medium text-gray-900">{cat.defaulter_grace_days} days</span></div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100"><Badge variant={cat.is_active ? 'success' : 'default'}>{cat.is_active ? 'Active' : 'Inactive'}</Badge></div>
            </Card>
          ))}
        </div>
      )}

      <CategoryModal isOpen={showModal} category={editing} onClose={() => { setShowModal(false); setEditing(null); }} onSave={handleSave} />
      <ConfirmDialog isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => handleDelete(deleteTarget!)} title="Delete Category" message={`Delete "${deleteTarget?.name}"? This will also delete all contribution records for this category.`} confirmLabel="Delete" variant="danger" />
    </div>
  );
}

function CategoryModal({ isOpen, category, onClose, onSave }: { isOpen: boolean; category: ContributionCategory | null; onClose: () => void; onSave: (cat: Partial<ContributionCategory>) => void }) {
  const [form, setForm] = useState<Partial<ContributionCategory>>({ name: '', description: '', target_amount: 0, frequency: 'monthly', minimum_amount: 0, monthly_requirement: 0, start_date: new Date().toISOString().split('T')[0], end_date: null, is_active: true, defaulter_grace_days: 7, reminder_template: '' });

  useEffect(() => {
    if (category) setForm(category);
    else setForm({ name: '', description: '', target_amount: 0, frequency: 'monthly', minimum_amount: 0, monthly_requirement: 0, start_date: new Date().toISOString().split('T')[0], end_date: null, is_active: true, defaulter_grace_days: 7, reminder_template: '' });
  }, [category]);

  function submit() {
    if (!form.name?.trim()) return;
    onSave(form);
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={category ? 'Edit Category' : 'New Category'} size="lg" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit}>{category ? 'Save' : 'Create'}</Button></>}>
      <div className="space-y-4">
        <Input label="Name" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Monthly Welfare" />
        <Textarea label="Description" value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Target Amount (KES)" type="number" value={form.target_amount || 0} onChange={(e) => setForm({ ...form, target_amount: Number(e.target.value) })} />
          <Select label="Frequency" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as ContributionFrequency })}>
            <option value="one_time">One Time</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annual">Annual</option>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Minimum Amount (KES)" type="number" value={form.minimum_amount || 0} onChange={(e) => setForm({ ...form, minimum_amount: Number(e.target.value) })} />
          <Input label="Monthly Requirement (KES)" type="number" value={form.monthly_requirement || 0} onChange={(e) => setForm({ ...form, monthly_requirement: Number(e.target.value) })} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Start Date" type="date" value={form.start_date || ''} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          <Input label="End Date (optional)" type="date" value={form.end_date || ''} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Defaulter Grace Days" type="number" value={form.defaulter_grace_days || 7} onChange={(e) => setForm({ ...form, defaulter_grace_days: Number(e.target.value) })} />
          <label className="flex items-end gap-2 pb-2 cursor-pointer">
            <input type="checkbox" checked={form.is_active ?? true} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="w-4 h-4 rounded border-gray-300 text-primary-600" />
            <span className="text-sm text-gray-700">Active</span>
          </label>
        </div>
        <Textarea label="Reminder Template" value={form.reminder_template || ''} onChange={(e) => setForm({ ...form, reminder_template: e.target.value })} rows={3} placeholder="Dear {member_name}, your {contribution_name} of KES {amount_due} is due on {due_date}." />
        <div className="p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-600">Variables: {'{member_name}, {amount_due}, {amount_paid}, {balance}, {contribution_name}, {due_date}'}</p>
        </div>
      </div>
    </Modal>
  );
}
