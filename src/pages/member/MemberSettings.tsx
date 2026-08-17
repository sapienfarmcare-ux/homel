import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, LogOut, Mail, Phone } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Card, CardHeader, Button, Input } from '@/components/ui';

export function MemberSettings() {
  const { user, signOut, refreshUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.full_name || '');
  const [savingName, setSavingName] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  async function saveName() {
    if (!name.trim()) { toast.error('Name cannot be empty'); return; }
    setSavingName(true);
    const { error } = await supabase.from('app_users').update({ full_name: name }).eq('id', user!.id);
    if (error) { toast.error(error.message); setSavingName(false); return; }
    await refreshUser();
    toast.success('Name updated');
    setSavingName(false);
  }

  async function changePassword() {
    if (newPassword.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { toast.error(error.message); setSavingPassword(false); return; }
    toast.success('Password changed successfully');
    setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    setSavingPassword(false);
  }

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Account Settings</h1>

      <Card>
        <CardHeader title="Profile Information" />
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <div className="w-10 h-10 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center font-semibold">{user?.full_name?.charAt(0).toUpperCase()}</div>
            <div><p className="text-sm font-medium text-gray-900">{user?.full_name}</p><p className="text-xs text-gray-500">Member since {new Date(user?.created_at || '').toLocaleDateString()}</p></div>
          </div>
          <Input label="Full Name" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-gray-50 rounded-lg"><div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><Phone className="w-3.5 h-3.5" /> Phone</div><p className="text-sm font-medium text-gray-900">{user?.phone}</p></div>
            <div className="p-3 bg-gray-50 rounded-lg"><div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><Mail className="w-3.5 h-3.5" /> Email</div><p className="text-sm font-medium text-gray-900 truncate">{user?.phone}@church.local</p></div>
          </div>
          <Button onClick={saveName} loading={savingName} size="sm">Save Name</Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Change Password" />
        <div className="p-4 space-y-3">
          <Input label="New Password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password" />
          <Input label="Confirm Password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" />
          <Button onClick={changePassword} loading={savingPassword} size="sm"><Lock className="w-4 h-4" /> Change Password</Button>
        </div>
      </Card>

      <Card className="p-4">
        <button onClick={handleSignOut} className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors">
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </Card>
    </div>
  );
}
