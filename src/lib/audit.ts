import { supabase } from '@/lib/supabase';

export async function logAudit(
  action: string,
  entityType: string = '',
  entityId: string = '',
  beforeValues?: Record<string, unknown>,
  afterValues?: Record<string, unknown>
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('audit_logs').insert({
      user_id: user?.id || null,
      action,
      entity_type: entityType,
      entity_id: entityId,
      before_values: beforeValues || null,
      after_values: afterValues || null,
      ip_address: '',
    });
  } catch {
    // Audit logging should not block operations
  }
}
