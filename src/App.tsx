import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { FullPageLoader } from '@/components/ui';
import { LoginPage } from '@/pages/LoginPage';
import { ChangePasswordPage } from '@/pages/ChangePasswordPage';
import { AdminLayout } from '@/layouts/AdminLayout';
import { MemberLayout } from '@/layouts/MemberLayout';
import { AdminDashboard } from '@/pages/admin/AdminDashboard';
import { MemberManagement } from '@/pages/admin/MemberManagement';
import { ExcelImport } from '@/pages/admin/ExcelImport';
import { ContributionCategories } from '@/pages/admin/ContributionCategories';
import { SmsTransactions } from '@/pages/admin/SmsTransactions';
import { UnmatchedTransactions } from '@/pages/admin/UnmatchedTransactions';
import { DefaultersPage } from '@/pages/admin/DefaultersPage';
import { RemindersPage } from '@/pages/admin/RemindersPage';
import { NotificationsPage } from '@/pages/admin/NotificationsPage';
import { ReportsPage } from '@/pages/admin/ReportsPage';
import { AuditLogsPage } from '@/pages/admin/AuditLogsPage';
import { SettingsPage } from '@/pages/admin/SettingsPage';
import { MemberDashboard } from '@/pages/member/MemberDashboard';
import { MemberContributions } from '@/pages/member/MemberContributions';
import { MemberStatement } from '@/pages/member/MemberStatement';
import { MemberNotifications } from '@/pages/member/MemberNotifications';
import { MemberSettings } from '@/pages/member/MemberSettings';
import { SetupWizard } from '@/pages/admin/SetupWizard';

function ProtectedRoutes() {
  const { session, user, loading } = useAuth();

  if (loading) return <FullPageLoader />;
  if (!session) return <Navigate to="/login" replace />;

  // Force password change
  if (user?.must_change_password) {
    return <ChangePasswordPage />;
  }

  // Route based on role
  const isAdmin = user?.role === 'admin';

  return (
    <Routes>
      <Route path="/login" element={<Navigate to={isAdmin ? '/admin' : '/member'} replace />} />
      {isAdmin ? (
        <>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="members" element={<MemberManagement />} />
            <Route path="import" element={<ExcelImport />} />
            <Route path="contributions" element={<ContributionCategories />} />
            <Route path="transactions" element={<SmsTransactions />} />
            <Route path="unmatched" element={<UnmatchedTransactions />} />
            <Route path="defaulters" element={<DefaultersPage />} />
            <Route path="reminders" element={<RemindersPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="audit" element={<AuditLogsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="setup" element={<SetupWizard />} />
          </Route>
          <Route path="/member/*" element={<Navigate to="/admin" replace />} />
        </>
      ) : (
        <>
          <Route path="/member" element={<MemberLayout />}>
            <Route index element={<MemberDashboard />} />
            <Route path="contributions" element={<MemberContributions />} />
            <Route path="statement" element={<MemberStatement />} />
            <Route path="notifications" element={<MemberNotifications />} />
            <Route path="settings" element={<MemberSettings />} />
          </Route>
          <Route path="/admin/*" element={<Navigate to="/member" replace />} />
        </>
      )}
      <Route path="*" element={<Navigate to={isAdmin ? '/admin' : '/member'} replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/*" element={<ProtectedRoutes />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
