/*
# Create RLS Policies for All Tables

## Overview
This migration adds Row Level Security policies to all tables created in
migration 001. The policies enforce:
- Members can only see/modify their own data (contributions, notifications, profile)
- Admins (role = 'admin') can see and manage everything
- Church settings and contribution categories are readable by all authenticated users
- SMS messages, unmatched transactions, audit logs, and admin settings are admin-only
- The SMS ingestion edge function uses the service role key, which bypasses RLS

## Policy Summary by Table
- church_settings: read by all authenticated, write by admins
- app_users: read own or all (admin), update own or all (admin)
- contribution_categories: read by all, write by admins
- transactions: read own or all (admin), write by admins
- contributions: read own or all (admin), write by admins
- sms_messages: admin only
- unmatched_transactions: admin only
- notifications: read (admin sees all, members see their own or 'all' type)
- notification_recipients: read own or all (admin), update own (mark read) or all (admin)
- reminders: read by all, write by admins
- audit_logs: read by admins, insert by any authenticated
- admin_settings: admin only
*/

-- ============================================================
-- CHURCH SETTINGS
-- ============================================================
DROP POLICY IF EXISTS "read_church_settings" ON church_settings;
CREATE POLICY "read_church_settings" ON church_settings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_church_settings" ON church_settings;
CREATE POLICY "admin_insert_church_settings" ON church_settings FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "admin_update_church_settings" ON church_settings;
CREATE POLICY "admin_update_church_settings" ON church_settings FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- APP USERS
-- ============================================================
DROP POLICY IF EXISTS "read_app_users" ON app_users;
CREATE POLICY "read_app_users" ON app_users FOR SELECT
  TO authenticated USING (
    auth.uid() = id OR
    EXISTS (SELECT 1 FROM app_users au WHERE au.id = auth.uid() AND au.role = 'admin')
  );

DROP POLICY IF EXISTS "insert_app_users" ON app_users;
CREATE POLICY "insert_app_users" ON app_users FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_app_users" ON app_users;
CREATE POLICY "update_app_users" ON app_users FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = id OR
    EXISTS (SELECT 1 FROM app_users au WHERE au.id = auth.uid() AND au.role = 'admin')
  )
  WITH CHECK (
    auth.uid() = id OR
    EXISTS (SELECT 1 FROM app_users au WHERE au.id = auth.uid() AND au.role = 'admin')
  );

-- ============================================================
-- CONTRIBUTION CATEGORIES
-- ============================================================
DROP POLICY IF EXISTS "read_contribution_categories" ON contribution_categories;
CREATE POLICY "read_contribution_categories" ON contribution_categories FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_categories" ON contribution_categories;
CREATE POLICY "admin_insert_categories" ON contribution_categories FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "admin_update_categories" ON contribution_categories;
CREATE POLICY "admin_update_categories" ON contribution_categories FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "admin_delete_categories" ON contribution_categories;
CREATE POLICY "admin_delete_categories" ON contribution_categories FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- TRANSACTIONS
-- ============================================================
DROP POLICY IF EXISTS "read_transactions" ON transactions;
CREATE POLICY "read_transactions" ON transactions FOR SELECT
  TO authenticated USING (
    member_id = auth.uid() OR
    EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "admin_insert_transactions" ON transactions;
CREATE POLICY "admin_insert_transactions" ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "admin_update_transactions" ON transactions;
CREATE POLICY "admin_update_transactions" ON transactions FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- CONTRIBUTIONS
-- ============================================================
DROP POLICY IF EXISTS "read_contributions" ON contributions;
CREATE POLICY "read_contributions" ON contributions FOR SELECT
  TO authenticated USING (
    member_id = auth.uid() OR
    EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "admin_insert_contributions" ON contributions;
CREATE POLICY "admin_insert_contributions" ON contributions FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "admin_update_contributions" ON contributions;
CREATE POLICY "admin_update_contributions" ON contributions FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "admin_delete_contributions" ON contributions;
CREATE POLICY "admin_delete_contributions" ON contributions FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- SMS MESSAGES
-- ============================================================
DROP POLICY IF EXISTS "admin_read_sms_messages" ON sms_messages;
CREATE POLICY "admin_read_sms_messages" ON sms_messages FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "admin_insert_sms_messages" ON sms_messages;
CREATE POLICY "admin_insert_sms_messages" ON sms_messages FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "admin_update_sms_messages" ON sms_messages;
CREATE POLICY "admin_update_sms_messages" ON sms_messages FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- UNMATCHED TRANSACTIONS
-- ============================================================
DROP POLICY IF EXISTS "admin_read_unmatched" ON unmatched_transactions;
CREATE POLICY "admin_read_unmatched" ON unmatched_transactions FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "admin_insert_unmatched" ON unmatched_transactions;
CREATE POLICY "admin_insert_unmatched" ON unmatched_transactions FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "admin_update_unmatched" ON unmatched_transactions;
CREATE POLICY "admin_update_unmatched" ON unmatched_transactions FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
DROP POLICY IF EXISTS "read_notifications" ON notifications;
CREATE POLICY "read_notifications" ON notifications FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin')
    OR recipient_type = 'all'
    OR EXISTS (
      SELECT 1 FROM notification_recipients nr
      WHERE nr.notification_id = notifications.id AND nr.member_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "admin_insert_notifications" ON notifications;
CREATE POLICY "admin_insert_notifications" ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "admin_update_notifications" ON notifications;
CREATE POLICY "admin_update_notifications" ON notifications FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "admin_delete_notifications" ON notifications;
CREATE POLICY "admin_delete_notifications" ON notifications FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- NOTIFICATION RECIPIENTS
-- ============================================================
DROP POLICY IF EXISTS "read_notification_recipients" ON notification_recipients;
CREATE POLICY "read_notification_recipients" ON notification_recipients FOR SELECT
  TO authenticated USING (
    member_id = auth.uid() OR
    EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "admin_insert_notification_recipients" ON notification_recipients;
CREATE POLICY "admin_insert_notification_recipients" ON notification_recipients FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "update_notification_recipients" ON notification_recipients;
CREATE POLICY "update_notification_recipients" ON notification_recipients FOR UPDATE
  TO authenticated
  USING (
    member_id = auth.uid() OR
    EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    member_id = auth.uid() OR
    EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- REMINDERS
-- ============================================================
DROP POLICY IF EXISTS "read_reminders" ON reminders;
CREATE POLICY "read_reminders" ON reminders FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_reminders" ON reminders;
CREATE POLICY "admin_insert_reminders" ON reminders FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "admin_update_reminders" ON reminders;
CREATE POLICY "admin_update_reminders" ON reminders FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "admin_delete_reminders" ON reminders;
CREATE POLICY "admin_delete_reminders" ON reminders FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- AUDIT LOGS
-- ============================================================
DROP POLICY IF EXISTS "admin_read_audit_logs" ON audit_logs;
CREATE POLICY "admin_read_audit_logs" ON audit_logs FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "insert_audit_logs" ON audit_logs;
CREATE POLICY "insert_audit_logs" ON audit_logs FOR INSERT
  TO authenticated WITH CHECK (true);

-- ============================================================
-- ADMIN SETTINGS
-- ============================================================
DROP POLICY IF EXISTS "admin_read_admin_settings" ON admin_settings;
CREATE POLICY "admin_read_admin_settings" ON admin_settings FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "admin_insert_admin_settings" ON admin_settings;
CREATE POLICY "admin_insert_admin_settings" ON admin_settings FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "admin_update_admin_settings" ON admin_settings;
CREATE POLICY "admin_update_admin_settings" ON admin_settings FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "admin_delete_admin_settings" ON admin_settings;
CREATE POLICY "admin_delete_admin_settings" ON admin_settings FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin'));
