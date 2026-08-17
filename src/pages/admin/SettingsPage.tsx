import { useState, useEffect, useCallback } from 'react';
import { Settings as SettingsIcon, Church, Key, Shield, Bell } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/context/ToastContext';
import { logAudit } from '@/lib/audit';
import { Card, CardHeader, Button, Input, Textarea, Badge, LoadingSpinner } from '@/components/ui';
import type { ChurchSettings, AdminSetting } from '@/types';

type Tab = 'church' | 'sms' | 'security' | 'notifications';

export function SettingsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('church');
  const [churchSettings, setChurchSettings] = useState<ChurchSettings | null>(null);
  const [adminSettings, setAdminSettings] = useState<AdminSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: cs }, { data: as }] = await Promise.all([
      supabase.from('church_settings').select('*').maybeSingle(),
      supabase.from('admin_settings').select('*'),
    ]);
    setChurchSettings(cs as ChurchSettings);
    setAdminSettings((as || []) as AdminSetting[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveChurch() {
    if (!churchSettings) return;
    setSaving(true);
    const { error } = await supabase.from('church_settings').update({
      church_name: churchSettings.church_name, logo_url: churchSettings.logo_url, address: churchSettings.address,
      phone: churchSettings.phone, email: churchSettings.email, website: churchSettings.website, about: churchSettings.about,
    }).eq('id', churchSettings.id);
    if (error) { toast.error(error.message); setSaving(false); return; }
    await logAudit('settings_update', 'church_settings', churchSettings.id);
    toast.success('Church settings saved');
    setSaving(false);
  }

  async function saveAdminSetting(key: string, value: string) {
    const { error } = await supabase.from('admin_settings').update({ value }).eq('key', key);
    if (error) { toast.error(error.message); return; }
    await logAudit('settings_update', 'admin_settings', key, undefined, { key, value });
    toast.success('Setting saved');
    load();
  }

  if (loading) return <LoadingSpinner />;

  const tabs: { id: Tab; label: string; icon: typeof Church }[] = [
    { id: 'church', label: 'Church Info', icon: Church },
    { id: 'sms', label: 'SMS Settings', icon: Key },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ];

  const getSetting = (key: string) => adminSettings.find((s) => s.key === key)?.value || '';

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-gray-900">Settings</h1><p className="text-sm text-gray-500 mt-1">Configure your church contribution system</p></div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === t.id ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'church' && churchSettings && (
        <Card>
          <CardHeader title="Church Information" subtitle="Displayed throughout the application" />
          <div className="p-5 space-y-4">
            <Input label="Church Name" value={churchSettings.church_name} onChange={(e) => setChurchSettings({ ...churchSettings, church_name: e.target.value })} placeholder="e.g. Grace Community Church" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Phone" value={churchSettings.phone} onChange={(e) => setChurchSettings({ ...churchSettings, phone: e.target.value })} placeholder="+254712345678" />
              <Input label="Email" value={churchSettings.email} onChange={(e) => setChurchSettings({ ...churchSettings, email: e.target.value })} placeholder="info@church.org" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Website" value={churchSettings.website} onChange={(e) => setChurchSettings({ ...churchSettings, website: e.target.value })} placeholder="https://church.org" />
              <Input label="Logo URL" value={churchSettings.logo_url} onChange={(e) => setChurchSettings({ ...churchSettings, logo_url: e.target.value })} placeholder="https://..." />
            </div>
            <Textarea label="Address" value={churchSettings.address} onChange={(e) => setChurchSettings({ ...churchSettings, address: e.target.value })} rows={2} />
            <Textarea label="About" value={churchSettings.about} onChange={(e) => setChurchSettings({ ...churchSettings, about: e.target.value })} rows={4} />
            <Button onClick={saveChurch} loading={saving}>Save Changes</Button>
          </div>
        </Card>
      )}

      {tab === 'sms' && (
        <Card>
          <CardHeader title="SMS Settings" subtitle="Configure the SMS forwarder API" />
          <div className="p-5 space-y-4">
            <div>
              <Input label="SMS API Key" value={getSetting('sms_api_key')} onChange={(e) => setAdminSettings((prev) => prev.map((s) => s.key === 'sms_api_key' ? { ...s, value: e.target.value } : s))} placeholder="Enter your API key" />
              <p className="text-xs text-gray-500 mt-1">This key authenticates the SMS Forwarder app when sending payment SMS to the system.</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium text-gray-900 mb-2">SMS Forwarder API Endpoint</p>
              <p className="text-xs text-gray-600 font-mono break-all">{import.meta.env.VITE_SUPABASE_URL}/functions/v1/sms-ingestion</p>
              <p className="text-xs text-gray-500 mt-2">Send POST requests with header <span className="font-mono">X-API-Key</span> and JSON body containing the SMS data.</p>
            </div>
            <div className="p-4 bg-primary-50 rounded-lg">
              <p className="text-sm font-medium text-primary-900 mb-1">Request Format</p>
              <pre className="text-xs text-primary-700 font-mono overflow-x-auto">{`{
  "body": "QK7ABC123 Confirmed. You have received...",
  "sender": "MPESA",
  "recipient": "+254712345678",
  "device_id": "device-001",
  "received_at": "2026-08-15T10:30:00Z"
}`}</pre>
            </div>
            <Button onClick={() => saveAdminSetting('sms_api_key', getSetting('sms_api_key'))}>Save SMS Settings</Button>
          </div>
        </Card>
      )}

      {tab === 'security' && (
        <Card>
          <CardHeader title="Security Settings" subtitle="Password policies and session management" />
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Session Timeout (minutes)" type="number" value={getSetting('session_timeout')} onChange={(e) => setAdminSettings((prev) => prev.map((s) => s.key === 'session_timeout' ? { ...s, value: e.target.value } : s))} />
              <Input label="Minimum Password Length" type="number" value={getSetting('min_password_length')} onChange={(e) => setAdminSettings((prev) => prev.map((s) => s.key === 'min_password_length' ? { ...s, value: e.target.value } : s))} />
            </div>
            <div className="p-4 bg-gray-50 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Force password change on first login</span>
                <Badge variant={getSetting('require_password_change') === 'true' ? 'success' : 'default'}>{getSetting('require_password_change') === 'true' ? 'Enabled' : 'Disabled'}</Badge>
              </div>
            </div>
            <div className="p-4 bg-amber-50 rounded-lg">
              <p className="text-sm text-amber-700"><strong>Initial Admin Account:</strong> Email: admin@church.local, Password: Admin@2026. Change this password after first login.</p>
            </div>
            <Button onClick={() => { saveAdminSetting('session_timeout', getSetting('session_timeout')); saveAdminSetting('min_password_length', getSetting('min_password_length')); }}>Save Security Settings</Button>
          </div>
        </Card>
      )}

      {tab === 'notifications' && (
        <Card>
          <CardHeader title="Notification Settings" subtitle="Configure notification and reminder behavior" />
          <div className="p-5 space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Notifications enabled</span>
                <Badge variant={getSetting('notification_enabled') === 'true' ? 'success' : 'default'}>{getSetting('notification_enabled') === 'true' ? 'Enabled' : 'Disabled'}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Reminders enabled</span>
                <Badge variant={getSetting('reminder_enabled') === 'true' ? 'success' : 'default'}>{getSetting('reminder_enabled') === 'true' ? 'Enabled' : 'Disabled'}</Badge>
              </div>
            </div>
            <p className="text-sm text-gray-500">Notification and reminder systems are active. Configure SMS provider credentials in the SMS tab to enable actual SMS delivery.</p>
          </div>
        </Card>
      )}
    </div>
  );
}
