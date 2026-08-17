import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Church, Lock, Mail, Eye, EyeOff, Shield } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Button, Input } from '@/components/ui';

export function LoginPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter both email and password');
      return;
    }
    setLoading(true);
    const { error } = await signIn(email.trim(), password);
    if (error) {
      toast.error(error);
      setLoading(false);
    } else {
      toast.success('Welcome back!');
      navigate('/');
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-gray-50">
      {/* Left side - branding */}
      <div className="lg:w-1/2 bg-gradient-to-br from-primary-700 via-primary-800 to-primary-900 flex flex-col justify-center items-center p-8 lg:p-16 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-primary-400 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 text-center lg:text-left max-w-md">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 backdrop-blur-sm rounded-2xl mb-6 border border-white/20">
            <Church className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold text-white mb-3 leading-tight">
            Church Contribution Manager
          </h1>
          <p className="text-primary-100 text-lg leading-relaxed mb-8">
            A complete system for managing church members, contributions, payments, and reports — all in one place.
          </p>
          <div className="space-y-3">
            {[
              'Track contributions automatically from SMS payments',
              'Manage members with Excel import',
              'Generate statements and reports',
              'Monitor defaulters and send reminders',
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-3 text-primary-100">
                <div className="w-1.5 h-1.5 bg-accent-400 rounded-full" />
                <span className="text-sm">{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right side - login form */}
      <div className="lg:w-1/2 flex items-center justify-center p-8 lg:p-16">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Sign in to your account</h2>
            <p className="text-gray-500 text-sm">
              Enter your credentials below to access the dashboard.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@church.local"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-gray-300 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-10 py-2.5 text-sm border border-gray-300 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" loading={loading} className="w-full" size="lg">
              Sign In
            </Button>
          </form>

          <div className="mt-8 p-4 bg-primary-50 border border-primary-100 rounded-xl">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-primary-900 mb-1">Initial Admin Account</p>
                <p className="text-xs text-primary-700 leading-relaxed">
                  Email: <span className="font-mono font-medium">admin@church.local</span>
                  <br />
                  Password: <span className="font-mono font-medium">Admin@2026</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
