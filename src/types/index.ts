export type UserRole = 'admin' | 'member';

export type ContributionFrequency = 'one_time' | 'weekly' | 'monthly' | 'quarterly' | 'annual';

export type TransactionStatus = 'processed' | 'pending_review' | 'reversed' | 'manual';

export type SmsStatus = 'pending' | 'processed' | 'pending_review' | 'failed' | 'duplicate' | 'unmatched';

export type NotificationPriority = 'low' | 'normal' | 'high';

export type RecipientType = 'all' | 'selected' | 'category' | 'defaulters';

export interface AppUser {
  id: string;
  full_name: string;
  phone: string;
  role: UserRole;
  must_change_password: boolean;
  is_disabled: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChurchSettings {
  id: string;
  church_name: string;
  logo_url: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  about: string;
  setup_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContributionCategory {
  id: string;
  name: string;
  description: string;
  target_amount: number;
  frequency: ContributionFrequency;
  minimum_amount: number;
  monthly_requirement: number;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  defaulter_grace_days: number;
  reminder_template: string;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  member_id: string | null;
  amount: number;
  reference: string | null;
  phone: string;
  member_name_snapshot: string;
  provider: string;
  sms_message_id: string | null;
  category_id: string | null;
  status: TransactionStatus;
  transaction_date: string;
  received_at: string;
  reversal_reason: string;
  reversed_by: string | null;
  reversed_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  correction_reason: string;
  created_at: string;
  updated_at: string;
}

export interface Contribution {
  id: string;
  member_id: string;
  category_id: string;
  transaction_id: string | null;
  amount: number;
  period_year: number;
  period_month: number;
  created_at: string;
}

export interface SmsMessage {
  id: string;
  raw_body: string;
  sender_phone: string;
  recipient_phone: string;
  device_id: string;
  received_at: string;
  parsed_amount: number | null;
  parsed_reference: string | null;
  parsed_phone: string | null;
  parsed_name: string | null;
  parsed_date: string | null;
  parsed_time: string | null;
  provider: string;
  status: SmsStatus;
  processing_notes: string;
  created_at: string;
}

export interface UnmatchedTransaction {
  id: string;
  transaction_id: string;
  sms_message_id: string | null;
  phone: string;
  member_name_snapshot: string;
  amount: number;
  reference: string | null;
  reason: string;
  assigned_to: string | null;
  assigned_by: string | null;
  assigned_at: string | null;
  is_resolved: boolean;
  created_at: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  recipient_type: RecipientType;
  priority: NotificationPriority;
  scheduled_for: string | null;
  status: 'draft' | 'sent' | 'scheduled';
  created_by: string | null;
  created_at: string;
}

export interface NotificationRecipient {
  id: string;
  notification_id: string;
  member_id: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface Reminder {
  id: string;
  title: string;
  message_template: string;
  category_id: string | null;
  recipient_type: RecipientType;
  status: 'draft' | 'sent' | 'scheduled';
  created_by: string | null;
  scheduled_for: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  before_values: Record<string, unknown> | null;
  after_values: Record<string, unknown> | null;
  ip_address: string;
  created_at: string;
}

export interface AdminSetting {
  id: string;
  key: string;
  value: string;
  description: string;
  category: 'sms' | 'security' | 'notifications' | 'general';
  created_at: string;
  updated_at: string;
}
