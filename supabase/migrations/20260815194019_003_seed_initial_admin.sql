/*
# Seed Initial Admin Account and Default Settings

## Overview
This migration creates the initial Super Admin/Treasurer account using
Supabase auth, and seeds default church settings and admin settings.

## What It Does
1. Creates an auth.users entry for the admin with email/phone as username
2. Creates the corresponding app_users row with role='admin'
3. Seeds a default church_settings row (empty, to be filled by setup wizard)
4. Seeds default admin_settings (SMS API key placeholder, security policies)

## Initial Admin Credentials
- Email/Username: admin@church.local (configurable via env var in production)
- Password: Admin@2026 (configurable via env var in production)
- Role: admin (super admin + treasurer)

## Security Notes
- The admin password is set here only for initial seeding. In production,
  these should come from environment variables, not hardcoded in source.
- The trigger on auth.users will auto-create the app_users row.
- must_change_password is set to true so the admin must change it on first login.
*/

-- Insert admin into auth.users
-- Using crypt extension for password hashing (Supabase auth uses bcrypt internally)
-- We use the Supabase auth schema directly
DO $$
DECLARE
  admin_email text := 'admin@church.local';
  admin_password text := 'Admin@2026';
  admin_id uuid;
BEGIN
  -- Check if admin already exists
  SELECT id INTO admin_id FROM auth.users WHERE email = admin_email;
  IF admin_id IS NULL THEN
    -- Insert into auth.users with encrypted password
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      admin_email,
      crypt(admin_password, gen_salt('bf')),
      now(),
      now(),
      now(),
      jsonb_build_object('role', 'admin', 'provider', 'email'),
      jsonb_build_object('full_name', 'System Administrator', 'phone', '+254700000000', 'role', 'admin', 'must_change_password', 'true')
    )
    RETURNING id INTO admin_id;

    -- The trigger should create app_users, but also do it explicitly to be safe
    INSERT INTO app_users (id, full_name, phone, role, must_change_password)
    VALUES (admin_id, 'System Administrator', '+254700000000', 'admin', true)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Seed default church settings (empty, admin fills via setup wizard)
INSERT INTO church_settings (church_name, setup_completed)
SELECT '', false
WHERE NOT EXISTS (SELECT 1 FROM church_settings);

-- Seed default admin settings
INSERT INTO admin_settings (key, value, description, category) VALUES
  ('sms_api_key', '', 'API key for SMS forwarder authentication', 'sms'),
  ('sms_rate_limit', '60', 'Maximum SMS API requests per minute', 'sms'),
  ('session_timeout', '60', 'Session timeout in minutes', 'security'),
  ('min_password_length', '8', 'Minimum password length', 'security'),
  ('require_password_change', 'true', 'Force password change on first login', 'security'),
  ('default_currency', 'KES', 'Default currency for the system', 'general'),
  ('church_name', '', 'Church name displayed throughout the app', 'general'),
  ('notification_enabled', 'true', 'Enable notification system', 'notifications'),
  ('reminder_enabled', 'true', 'Enable reminder system', 'notifications')
ON CONFLICT (key) DO NOTHING;
