import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import { Home, Wallet, FileText, Bell, LogOut, Church, User } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useState } from 'react';

const memberNav = [
  { to: '/member', label: 'Home', icon: Home, end: true },
  { to: '/member/contributions', label: 'Contributions', icon: Wallet },
  { to: '/member/statement', label: 'Statement', icon: FileText },
  { to: '/member/notifications', label: 'Alerts', icon: Bell },
];

export function MemberLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [showProfile, setShowProfile] = useState(false);

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-primary-600 to-primary-800 rounded-lg flex items-center justify-center">
              <Church className="w-4.5 h-4.5 text-white" style={{ width: '1.125rem', height: '1.125rem' }} />
            </div>
            <span className="text-sm font-semibold text-gray-900">Church Manager</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowProfile(!showProfile)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="w-7 h-7 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-semibold">
                {user?.full_name?.charAt(0).toUpperCase() || 'M'}
              </div>
            </button>
          </div>
        </div>

        {/* Profile dropdown */}
        {showProfile && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setShowProfile(false)} />
            <div className="absolute right-4 top-14 z-30 bg-white rounded-xl shadow-lg border border-gray-200 w-56 overflow-hidden animate-slide-up">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-medium text-gray-900 truncate">{user?.full_name}</p>
                <p className="text-xs text-gray-500 truncate">{user?.phone}</p>
              </div>
              <button
                onClick={() => {
                  setShowProfile(false);
                  navigate('/member/settings');
                }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <User className="w-4 h-4" />
                Account Settings
              </button>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </>
        )}
      </header>

      {/* Content */}
      <main className="flex-1 max-w-2xl mx-auto w-full pb-20">
        <Outlet />
      </main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200">
        <div className="max-w-2xl mx-auto flex items-center justify-around px-2 py-1.5">
          {memberNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg transition-colors ${
                  isActive ? 'text-primary-700' : 'text-gray-400'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
