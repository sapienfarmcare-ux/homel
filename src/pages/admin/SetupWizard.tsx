import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Church, Wallet, Users, Key, CheckCircle, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { logAudit } from '@/lib/audit';
import { Card, Button, Input, Textarea } from '@/components/ui';

export function SetupWizard() {
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [churchName, setChurchName] = useState('');
  const [churchPhone, setChurchPhone] = useState('');
  const [churchEmail, setChurchEmail] = useState('');
  const [churchAddress, setChurchAddress] = useState('');
  const [catName, setCatName] = useState('Monthly Welfare');
  const [catTarget, setCatTarget] = useState('50000');
  const [catMonthly, setCatMonthly] = useState('500');
  const [apiKey, setApiKey] = useState('');

  const steps = [
    { num: 1, label: 'Church Info', icon: Church },
    { num: 2, label: 'First Category', icon: Wallet },
    { num: 3, label: 'SMS API', icon: Key },
    { num: 4, label: 'Done', icon: CheckCircle },
  ];

  async function nextStep() {
    if (step === 1) {
      if (!churchName.trim()) { toast.error('Please enter church name'); return; }
      setSaving(true);
      const { data: settings } = await supabase.from('church_settings').select('id').maybeSingle();
      if (settings) {
        await supabase.from('church_settings').update({ church_name: churchName, phone: churchPhone, email: churchEmail, address: churchAddress }).eq('id', settings.id);
      }
      await logAudit('setup_church_info', 'church_settings');
      setSaving(false);
      setStep(2);
    } else if (step === 2) {
      if (!catName.trim()) { toast.error('Please enter category name'); return; }
      setSaving(true);
      await supabase.from('contribution_categories').insert({ name: catName, target_amount: Number(catTarget) || 0, monthly_requirement: Number(catMonthly) || 0, frequency: 'monthly', is_active: true, defaulter_grace_days: 7 });
      await logAudit('setup_first_category', 'contribution_categories');
      setSaving(false);
      setStep(3);
    } else if (step === 3) {
      setSaving(true);
      if (apiKey) {
        await supabase.from('admin_settings').update({ value: apiKey }).eq('key', 'sms_api_key');
      }
      const { data: settings } = await supabase.from('church_settings').select('id').maybeSingle();
      if (settings) {
        await supabase.from('church_settings').update({ setup_completed: true }).eq('id', settings.id);
      }
      await logAudit('setup_complete', 'church_settings');
      setSaving(false);
      setStep(4);
    } else if (step === 4) {
      navigate('/admin');
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900">Welcome to Church Manager</h1>
        <p className="text-sm text-gray-500 mt-1">Let's set up your church contribution system in a few steps</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2">
        {steps.map((s, i) => (
          <div key={s.num} className="flex items-center">
            <div className={`flex flex-col items-center gap-1 ${step >= s.num ? 'text-primary-700' : 'text-gray-400'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${step >= s.num ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                {step > s.num ? <CheckCircle className="w-5 h-5" /> : <s.icon className="w-5 h-5" />}
              </div>
              <span className="text-xs font-medium">{s.label}</span>
            </div>
            {i < steps.length - 1 && <div className={`w-12 h-0.5 mx-1 ${step > s.num ? 'bg-primary-600' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>

      <Card className="p-6">
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2"><Church className="w-5 h-5 text-primary-600" /><h2 className="text-lg font-semibold text-gray-900">Church Information</h2></div>
            <Input label="Church Name" value={churchName} onChange={(e) => setChurchName(e.target.value)} placeholder="e.g. Grace Community Church" />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Phone" value={churchPhone} onChange={(e) => setChurchPhone(e.target.value)} placeholder="+254712345678" />
              <Input label="Email" value={churchEmail} onChange={(e) => setChurchEmail(e.target.value)} placeholder="info@church.org" />
            </div>
            <Textarea label="Address" value={churchAddress} onChange={(e) => setChurchAddress(e.target.value)} rows={2} placeholder="Church physical address" />
          </div>
        )}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2"><Wallet className="w-5 h-5 text-primary-600" /><h2 className="text-lg font-semibold text-gray-900">Create First Contribution Category</h2></div>
            <p className="text-sm text-gray-500">You can add more categories later from the Contributions page.</p>
            <Input label="Category Name" value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="e.g. Monthly Welfare" />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Target Amount (KES)" type="number" value={catTarget} onChange={(e) => setCatTarget(e.target.value)} />
              <Input label="Monthly Requirement per Member (KES)" type="number" value={catMonthly} onChange={(e) => setCatMonthly(e.target.value)} />
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2"><Key className="w-5 h-5 text-primary-600" /><h2 className="text-lg font-semibold text-gray-900">SMS Forwarder API Key</h2></div>
            <p className="text-sm text-gray-500">Set an API key that your SMS Forwarder app will use to send payment SMS to the system. You can change this later in Settings.</p>
            <Input label="API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Enter a secure API key" />
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600">API Endpoint: <span className="font-mono">{import.meta.env.VITE_SUPABASE_URL}/functions/v1/sms-ingestion</span></p>
              <p className="text-xs text-gray-600 mt-1">The SMS Forwarder app sends POST requests with header <span className="font-mono">X-API-Key</span> and the SMS body.</p>
            </div>
          </div>
        )}
        {step === 4 && (
          <div className="text-center py-8">
            <div className="inline-flex w-16 h-16 bg-emerald-100 rounded-full items-center justify-center mb-4"><CheckCircle className="w-8 h-8 text-emerald-600" /></div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Setup Complete!</h2>
            <p className="text-sm text-gray-500 mb-6">Your church contribution system is ready. Next steps:</p>
            <div className="text-left space-y-2 max-w-sm mx-auto mb-6">
              {['Import members from Excel', 'Create more contribution categories', 'Configure your SMS Forwarder app', 'Start receiving contributions'].map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-gray-700"><CheckCircle className="w-4 h-4 text-primary-600" /> {item}</div>
              ))}
            </div>
          </div>
        )}
        <div className="flex justify-between mt-6">
          {step > 1 && step < 4 && <Button variant="secondary" onClick={() => setStep(step - 1)}>Back</Button>}
          <div className="ml-auto"><Button onClick={nextStep} loading={saving}>{step === 4 ? 'Go to Dashboard' : 'Continue'} <ArrowRight className="w-4 h-4" /></Button></div>
        </div>
      </Card>
    </div>
  );
}
