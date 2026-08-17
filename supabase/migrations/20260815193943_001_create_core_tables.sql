/*
# Create Core Database Tables for Church Contribution Management System

## Overview
Creates all tables for the church contribution management system. Policies and
indexes are added in a separate migration to avoid circular dependency issues.

## Tables (in dependency order)
1. app_users — extends auth.users with role and profile data
2. church_settings — church profile information
3. contribution_categories — types of contributions
4. sms_messages — raw SMS messages received from forwarder
5. transactions — financial transaction records
6. contributions — links transactions to categories per member per period
7. unmatched_transactions — transactions that couldn't be matched to members
8. notifications — admin-created notifications
9. notification_recipients — per-member notification delivery
10. reminders — contribution reminders
11. audit_logs — full audit trail
12. admin_settings — system configuration

## Notes
- numeric(12,2) for all monetary values — no floating point
- Phone numbers normalized to +2547XXXXXXXX format
- Soft deletion via is_disabled flag on app_users
- Unique constraint on transaction references for duplicate prevention
*/

-- ============================================================
-- APP USERS (extends auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  must_change_password boolean NOT NULL DEFAULT true,
  is_disabled boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- CHURCH SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS church_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_name text NOT NULL DEFAULT '',
  logo_url text DEFAULT '',
  address text DEFAULT '',
  phone text DEFAULT '',
  email text DEFAULT '',
  website text DEFAULT '',
  about text DEFAULT '',
  setup_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- CONTRIBUTION CATEGORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS contribution_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  target_amount numeric(12,2) NOT NULL DEFAULT 0,
  frequency text NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('one_time', 'weekly', 'monthly', 'quarterly', 'annual')),
  minimum_amount numeric(12,2) DEFAULT 0,
  monthly_requirement numeric(12,2) DEFAULT 0,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  is_active boolean NOT NULL DEFAULT true,
  defaulter_grace_days integer NOT NULL DEFAULT 7,
  reminder_template text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- SMS MESSAGES (raw incoming SMS)
-- ============================================================
CREATE TABLE IF NOT EXISTS sms_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_body text NOT NULL,
  sender_phone text DEFAULT '',
  recipient_phone text DEFAULT '',
  device_id text DEFAULT '',
  received_at timestamptz NOT NULL DEFAULT now(),
  parsed_amount numeric(12,2),
  parsed_reference text,
  parsed_phone text,
  parsed_name text DEFAULT '',
  parsed_date date,
  parsed_time text DEFAULT '',
  provider text DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'pending_review', 'failed', 'duplicate', 'unmatched')),
  processing_notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- TRANSACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL,
  reference text,
  phone text DEFAULT '',
  member_name_snapshot text DEFAULT '',
  provider text DEFAULT '',
  sms_message_id uuid REFERENCES sms_messages(id) ON DELETE SET NULL,
  category_id uuid REFERENCES contribution_categories(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'processed' CHECK (status IN ('processed', 'pending_review', 'reversed', 'manual')),
  transaction_date timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz NOT NULL DEFAULT now(),
  reversal_reason text DEFAULT '',
  reversed_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  reversed_at timestamptz,
  reviewed_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  correction_reason text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- CONTRIBUTIONS (per member per category per period)
-- ============================================================
CREATE TABLE IF NOT EXISTS contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES contribution_categories(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL,
  period_year integer NOT NULL DEFAULT EXTRACT(year FROM now())::integer,
  period_month integer NOT NULL DEFAULT EXTRACT(month FROM now())::integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- UNMATCHED TRANSACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS unmatched_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  sms_message_id uuid REFERENCES sms_messages(id) ON DELETE SET NULL,
  phone text DEFAULT '',
  member_name_snapshot text DEFAULT '',
  amount numeric(12,2) NOT NULL,
  reference text,
  reason text DEFAULT 'No matching member found',
  assigned_to uuid REFERENCES app_users(id) ON DELETE SET NULL,
  assigned_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  is_resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  recipient_type text NOT NULL DEFAULT 'all' CHECK (recipient_type IN ('all', 'selected', 'category', 'defaulters')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  scheduled_for timestamptz,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('draft', 'sent', 'scheduled')),
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- NOTIFICATION RECIPIENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- REMINDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message_template text NOT NULL,
  category_id uuid REFERENCES contribution_categories(id) ON DELETE SET NULL,
  recipient_type text NOT NULL DEFAULT 'defaulters' CHECK (recipient_type IN ('all', 'defaulters', 'selected', 'category')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'scheduled')),
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  scheduled_for timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text DEFAULT '',
  entity_id text DEFAULT '',
  before_values jsonb,
  after_values jsonb,
  ip_address text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- ADMIN SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text NOT NULL DEFAULT '',
  description text DEFAULT '',
  category text NOT NULL DEFAULT 'general' CHECK (category IN ('sms', 'security', 'notifications', 'general')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================
ALTER TABLE church_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE contribution_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE unmatched_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- UNIQUE CONSTRAINTS
-- ============================================================
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_reference_key;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_reference_key') THEN
    ALTER TABLE transactions ADD CONSTRAINT transactions_reference_key UNIQUE (reference);
  END IF;
END $$;

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_app_users_phone ON app_users(phone);
CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role);
CREATE INDEX IF NOT EXISTS idx_transactions_member_id ON transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(reference);
CREATE INDEX IF NOT EXISTS idx_transactions_phone ON transactions(phone);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_contributions_member_id ON contributions(member_id);
CREATE INDEX IF NOT EXISTS idx_contributions_category_id ON contributions(category_id);
CREATE INDEX IF NOT EXISTS idx_contributions_period ON contributions(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_sms_messages_status ON sms_messages(status);
CREATE INDEX IF NOT EXISTS idx_sms_messages_received ON sms_messages(received_at);
CREATE INDEX IF NOT EXISTS idx_unmatched_resolved ON unmatched_transactions(is_resolved);
CREATE INDEX IF NOT EXISTS idx_notification_recipients_member ON notification_recipients(member_id);
CREATE INDEX IF NOT EXISTS idx_notification_recipients_read ON notification_recipients(is_read);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- ============================================================
-- TRIGGERS: Auto-create app_users row on auth signup
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO app_users (id, full_name, phone, role, must_change_password)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'member'),
    COALESCE((NEW.raw_user_meta_data->>'must_change_password')::boolean, true)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- UPDATED_AT trigger helper
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_church_settings_updated') THEN
    CREATE TRIGGER trg_church_settings_updated BEFORE UPDATE ON church_settings
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_app_users_updated') THEN
    CREATE TRIGGER trg_app_users_updated BEFORE UPDATE ON app_users
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_categories_updated') THEN
    CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON contribution_categories
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_transactions_updated') THEN
    CREATE TRIGGER trg_transactions_updated BEFORE UPDATE ON transactions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_admin_settings_updated') THEN
    CREATE TRIGGER trg_admin_settings_updated BEFORE UPDATE ON admin_settings
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
