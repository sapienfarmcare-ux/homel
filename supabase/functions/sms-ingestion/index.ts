import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-API-Key",
};

interface SmsIngestionRequest {
  body?: string;
  sender?: string;
  recipient?: string;
  device_id?: string;
  received_at?: string;
  parsed_amount?: number;
  parsed_reference?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ status: "invalid", error: "Only POST is supported" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Authenticate via X-API-Key header
    const apiKey = req.headers.get("X-API-Key");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ status: "unauthorized", error: "Missing API key" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role to bypass RLS
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate API key from admin_settings
    const { data: apiKeySetting } = await supabase
      .from("admin_settings")
      .select("value")
      .eq("key", "sms_api_key")
      .single();

    if (!apiKeySetting || !apiKeySetting.value || apiKeySetting.value !== apiKey) {
      return new Response(
        JSON.stringify({ status: "unauthorized", error: "Invalid API key" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const payload: SmsIngestionRequest = await req.json();
    if (!payload.body || payload.body.trim().length === 0) {
      return new Response(
        JSON.stringify({ status: "invalid", error: "SMS body is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawBody = payload.body;
    const senderPhone = payload.sender || "";
    const recipientPhone = payload.recipient || "";
    const deviceId = payload.device_id || "";
    const receivedAt = payload.received_at ? new Date(payload.received_at) : new Date();

    // Parse the SMS body
    const parsed = parseSms(rawBody);

    // Check for duplicates by reference
    let isDuplicate = false;
    if (parsed.reference) {
      const { data: existingTx } = await supabase
        .from("transactions")
        .select("id")
        .eq("reference", parsed.reference)
        .maybeSingle();
      if (existingTx) {
        isDuplicate = true;
      }
    }

    // Insert the raw SMS message
    const { data: smsMessage, error: smsError } = await supabase
      .from("sms_messages")
      .insert({
        raw_body: rawBody,
        sender_phone: senderPhone,
        recipient_phone: recipientPhone,
        device_id: deviceId,
        received_at: receivedAt.toISOString(),
        parsed_amount: parsed.amount,
        parsed_reference: parsed.reference,
        parsed_phone: parsed.phone,
        parsed_name: parsed.name,
        parsed_date: parsed.date,
        parsed_time: parsed.time,
        provider: parsed.provider,
        status: isDuplicate ? "duplicate" : "pending",
        processing_notes: isDuplicate ? "Duplicate reference detected" : "",
      })
      .select()
      .single();

    if (smsError) {
      return new Response(
        JSON.stringify({ status: "processing_error", error: smsError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (isDuplicate) {
      return new Response(
        JSON.stringify({
          status: "duplicate",
          message: "Duplicate transaction reference detected",
          sms_id: smsMessage.id,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If no amount was parsed, mark as pending review
    if (!parsed.amount || parsed.amount <= 0) {
      await supabase
        .from("sms_messages")
        .update({ status: "pending_review", processing_notes: "Could not parse amount from SMS" })
        .eq("id", smsMessage.id);

      return new Response(
        JSON.stringify({
          status: "pending_review",
          message: "SMS received but amount could not be parsed. Pending admin review.",
          sms_id: smsMessage.id,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize the phone number
    const normalizedPhone = normalizeKenyanPhone(parsed.phone || senderPhone);

    // Try to match member by phone
    let matchedMember: { id: string; full_name: string } | null = null;
    if (normalizedPhone) {
      const { data: member } = await supabase
        .from("app_users")
        .select("id, full_name")
        .eq("phone", normalizedPhone)
        .eq("is_disabled", false)
        .maybeSingle();
      if (member) {
        matchedMember = member;
      }
    }

    // Create the transaction record
    const { data: transaction, error: txError } = await supabase
      .from("transactions")
      .insert({
        member_id: matchedMember?.id || null,
        amount: parsed.amount,
        reference: parsed.reference,
        phone: normalizedPhone || senderPhone,
        member_name_snapshot: matchedMember?.full_name || parsed.name || "",
        provider: parsed.provider,
        sms_message_id: smsMessage.id,
        status: matchedMember ? "processed" : "pending_review",
        transaction_date: parsed.date
          ? new Date(`${parsed.date}T${parsed.time || "00:00:00"}`).toISOString()
          : receivedAt.toISOString(),
        received_at: receivedAt.toISOString(),
      })
      .select()
      .single();

    if (txError) {
      // If it's a unique constraint violation on reference, it's a duplicate
      if (txError.code === "23505") {
        await supabase
          .from("sms_messages")
          .update({ status: "duplicate", processing_notes: "Duplicate reference" })
          .eq("id", smsMessage.id);

        return new Response(
          JSON.stringify({ status: "duplicate", message: "Duplicate transaction", sms_id: smsMessage.id }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ status: "processing_error", error: txError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (matchedMember) {
      // Update SMS status to processed
      await supabase
        .from("sms_messages")
        .update({ status: "processed", processing_notes: `Matched to member: ${matchedMember.full_name}` })
        .eq("id", smsMessage.id);

      // Create a notification for the member
      await supabase.from("notifications").insert({
        title: "Contribution Received",
        message: `Your contribution of KES ${parsed.amount.toFixed(2)} has been received. Reference: ${parsed.reference || "N/A"}`,
        recipient_type: "selected",
        priority: "normal",
        status: "sent",
        created_by: null,
      });

      // Get the notification we just created and add recipient
      const { data: notif } = await supabase
        .from("notifications")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (notif) {
        await supabase.from("notification_recipients").insert({
          notification_id: notif.id,
          member_id: matchedMember.id,
          is_read: false,
        });
      }

      return new Response(
        JSON.stringify({
          status: "accepted",
          message: "SMS processed and matched to member",
          sms_id: smsMessage.id,
          transaction_id: transaction.id,
          member: matchedMember.full_name,
          amount: parsed.amount,
          reference: parsed.reference,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // Unmatched - create unmatched transaction record
      await supabase.from("unmatched_transactions").insert({
        transaction_id: transaction.id,
        sms_message_id: smsMessage.id,
        phone: normalizedPhone || senderPhone,
        member_name_snapshot: parsed.name || "",
        amount: parsed.amount,
        reference: parsed.reference || "",
        reason: "No matching member found for phone number",
        is_resolved: false,
      });

      await supabase
        .from("sms_messages")
        .update({ status: "unmatched", processing_notes: "No matching member found" })
        .eq("id", smsMessage.id);

      return new Response(
        JSON.stringify({
          status: "unmatched",
          message: "SMS received but no matching member found. Pending admin assignment.",
          sms_id: smsMessage.id,
          transaction_id: transaction.id,
          phone: normalizedPhone || senderPhone,
          amount: parsed.amount,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ status: "processing_error", error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ============================================================
// SMS PARSER
// ============================================================
interface ParsedSms {
  amount: number | null;
  reference: string | null;
  phone: string | null;
  name: string | null;
  date: string | null;
  time: string | null;
  provider: string | null;
}

function parseSms(body: string): ParsedSms {
  const result: ParsedSms = {
    amount: null,
    reference: null,
    phone: null,
    name: null,
    date: null,
    time: null,
    provider: null,
  };

  const text = body.trim();

  // Detect provider
  if (/m-pesa|mpesa|safaricom/i.test(text)) {
    result.provider = "M-Pesa";
  } else if (/airtel/i.test(text)) {
    result.provider = "Airtel Money";
  } else if (/t-kash|tkash|telkom/i.test(text)) {
    result.provider = "T-Kash";
  } else if (/equity|equitel/i.test(text)) {
    result.provider = "Equity";
  } else if (/kcb/i.test(text)) {
    result.provider = "KCB";
  } else if (/co-op|coop/i.test(text)) {
    result.provider = "Co-op Bank";
  } else if (/family bank/i.test(text)) {
    result.provider = "Family Bank";
  }

  // Extract amount - look for patterns like "KES 1,500", "Ksh 1500", "Amount: 1,500.00"
  const amountPatterns = [
    /(?:kes|ksh|kshs|sh|amount)\.?\s*:?\s*([\d,]+\.?\d*)/i,
    /([\d,]+\.\d{2})\s*(?:has been|received|sent|paid|transferred|deposited)/i,
    /(?:received|sent|paid|transferred|deposited)\s*(?:kes|ksh|kshs)?\s*([\d,]+\.?\d*)/i,
    /([\d,]+)\s*\/=/i,
  ];

  for (const pattern of amountPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const amountStr = match[1].replace(/,/g, "");
      const amount = parseFloat(amountStr);
      if (!isNaN(amount) && amount > 0) {
        result.amount = Math.round(amount * 100) / 100;
        break;
      }
    }
  }

  // Extract reference - look for patterns like "Ref: ABC123", "Transaction ID: XYZ"
  const refPatterns = [
    /(?:ref|reference|transaction\s*(?:id|code)|confirmation\s*code|mpesa\s*code)\.?\s*:?\s*([A-Z0-9]{6,})/i,
    /\b([A-Z0-9]{8,12})\b\s*(?:confirmed|has been)/i,
    /code\s*([A-Z0-9]{6,})/i,
  ];

  for (const pattern of refPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      result.reference = match[1].toUpperCase();
      break;
    }
  }

  // Extract phone number - look for patterns like "from 0712345678", "07XX XXX XXX"
  const phonePatterns = [
    /from\s*(\+?254[789]\d{8})/i,
    /from\s*(0[789]\d{8})/i,
    /(\+?254[789]\d{8})/i,
    /\b(0[789]\d{8})\b/,
    /(\+?2547\d{8})/i,
  ];

  for (const pattern of phonePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      result.phone = match[1].replace(/\s/g, "");
      break;
    }
  }

  // Extract name - look for "from JOHN DOE", "Name: JOHN DOE"
  const namePatterns = [
    /from\s+([A-Z][A-Z\s]{3,30})\s+(?:on|at|via|received|sent|paid)/i,
    /name\s*:?\s*([A-Z][a-zA-Z\s]{3,40})/i,
    /(?:received|sent|from)\s+(?:from\s+)?([A-Z][a-zA-Z\s]{3,40})\s+(?:on|at|via)/i,
  ];

  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      // Filter out common false positives
      if (!/^(kes|ksh|amount|ref|date|time|on|at|via)$/i.test(name)) {
        result.name = name;
        break;
      }
    }
  }

  // Extract date - look for patterns like "15/8/26", "15/8/2026", "2026-08-15"
  const datePatterns = [
    /(\d{1,2}\/\d{1,2}\/\d{2,4})/,
    /(\d{4}-\d{2}-\d{2})/,
    /(\d{1,2}-\d{1,2}-\d{2,4})/,
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      result.date = match[1];
      break;
    }
  }

  // Extract time - look for patterns like "2:30 PM", "14:30:00"
  const timePatterns = [
    /(\d{1,2}:\d{2}\s*(?:am|pm)?)/i,
    /(\d{2}:\d{2}:\d{2})/,
  ];

  for (const pattern of timePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      result.time = match[1].trim();
      break;
    }
  }

  return result;
}

// ============================================================
// PHONE NUMBER NORMALIZATION (Kenyan format)
// ============================================================
function normalizeKenyanPhone(phone: string): string | null {
  if (!phone) return null;

  // Remove all spaces, dashes, parentheses
  let cleaned = phone.replace(/[\s\-()]/g, "");

  // Handle different Kenyan formats:
  // 0712345678 -> +254712345678
  // 254712345678 -> +254712345678
  // +254712345678 -> +254712345678
  // 712345678 -> +254712345678

  if (cleaned.startsWith("+254")) {
    cleaned = cleaned.substring(1);
  } else if (cleaned.startsWith("254")) {
    // already correct
  } else if (cleaned.startsWith("0")) {
    cleaned = "254" + cleaned.substring(1);
  } else if (cleaned.startsWith("7") || cleaned.startsWith("8") || cleaned.startsWith("9")) {
    cleaned = "254" + cleaned;
  } else {
    return null;
  }

  // Validate: should be 254 followed by 9 digits
  if (/^254[789]\d{8}$/.test(cleaned)) {
    return "+" + cleaned;
  }

  return null;
}
