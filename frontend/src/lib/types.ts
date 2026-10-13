// Hand-written mirrors of backend/models/schemas.py — keep in sync.
export type Role = "customer" | "employee" | "admin" | "superadmin";

export interface User {
  id: string; email: string | null; name: string; role: Role; org_id: string | null; avatar: string; title: string;
  phone: string | null; backup_skipped: boolean; bio: string; profile_link: string; status: string; verified: boolean; active: boolean; calls_enabled: boolean; guest: boolean; target: number;
  notify_sound: boolean; notify_push: boolean;
}
export interface EmployeeStat extends User { open_conversations: number; total_conversations: number; deposits_total: number }

export interface Organization {
  id: string; name: string; slug: string; domain: string; domain_status: string; plan_id: string; billing_cycle: string;
  seats: number; status: string; primary_color: string; accent_color: string; font: string; logo_url: string; banner_url: string;
  retention_days: number; created_at: string; trial_ends: string | null; features: Record<string, boolean>;
}
export interface OrgRow extends Organization { plan_name: string; employees: number; customers: number; conversations: number; deposits_total: number; mrr: number }

export interface Note { id: string; text: string; author_name: string; created_at: string }
export interface FollowUp { id: string; title: string; due: string; done: boolean }
export interface CustomerProfile {
  id: string; org_id: string; user_id: string; name: string; phone: string; calls_allowed: boolean; labels: string[]; stage: string;
  assigned_employee_id: string | null; assigned_employee_name: string; blocked: boolean; opted_in: boolean; notes: Note[];
  follow_ups: FollowUp[]; created_at: string; last_active: string; total_deposits: number; deposit_count: number;
}

export interface Attachment { kind: "image" | "video" | "audio" | "file"; name: string; url: string; size: number }
export interface Conversation {
  id: string; org_id: string; org_name: string; org_color: string; customer_id: string; customer_user_id: string; customer_name: string;
  customer_phone: string; employee_id: string | null; employee_name: string; employee_avatar: string; employee_status: string; employee_title: string; employee_bio: string; employee_link: string; employee_verified: boolean;
  landing_page_id: string | null; landing_title: string; last_message: string; last_message_at: string; unread: number;
  archived: boolean; muted: boolean; vip: boolean; follow_up: boolean; blocked: boolean; calls_enabled: boolean; customer_calls_allowed: boolean; typing: boolean; created_at: string;
}
export interface Message {
  id: string; conversation_id: string; sender_role: string; sender_id: string | null; sender_name: string; text: string;
  attachment: Attachment | null; reply_to: string | null; reply_preview: string; status: string; kind?: string; deleted_by_customer?: boolean; created_at: string;
  pending?: boolean; failed?: boolean; idempotency_key?: string;
}
export interface Call { id: string; conversation_id: string; initiated_by: string; status: string; duration: number; at: string }
export interface Transfer {
  id: string; org_id: string; conversation_id: string; customer_name: string; from_employee_id: string; from_employee_name: string;
  to_employee_id: string; to_employee_name: string; reason: string; status: string; created_at: string; decided_by_name: string;
}

export type DepositStatus = "Recorded" | "Reviewed" | "Disputed" | "Reversed";
export interface Deposit {
  id: string; org_id: string; customer_id: string; customer_name: string; employee_id: string; employee_name: string; amount: number;
  currency: string; product: string; method: string; reference: string; payment_date: string; notes: string; proof_name: string;
  status: DepositStatus; created_at: string;
}
export interface DepositEvent {
  id: string; deposit_id: string; action: string; from_status: string; to_status: string; old_amount: number | null;
  new_amount: number | null; reason: string; actor_name: string; at: string;
}

export type Routing = "fixed" | "round_robin" | "least_busy" | "manual" | "team";
export interface LPImage { id: string; url: string; label: string; description: string; default_message: string; employee_id: string | null }
export interface LandingPageInput {
  title: string; slug: string; template: "A" | "B"; description: string; cta_text: string; primary_color: string; font: string;
  logo_url: string; banner_url: string; trust_items: string[]; routing: Routing; assigned_employee_ids: string[]; images: LPImage[];
  calls_enabled: boolean; pixel_id: string; pixel_ids: string[]; published: boolean; available_24_7: boolean;
  default_message: string; auto_send_default: boolean; employee_can_edit_message: boolean;
}
export interface LandingPage extends LandingPageInput { id: string; org_id: string; views: number; leads: number; archived: boolean; created_at: string }
export interface PublicEmployee { id: string; name: string; avatar: string; title: string; status: string; verified: boolean }
export interface PublicLanding { page: LandingPage; org: Organization; employees: PublicEmployee[] }
export interface StartChatOut { status: "ok" | "verification_required"; conversation_id: string | null; challenge_id: string | null; mock_code: string | null; prefill: string }

export interface Broadcast {
  id: string; org_id: string; title: string; message: string; segment: string; scheduled_at: string | null; status: string;
  recipients: number; delivered: number; read: number; opted_out: number; created_at: string;
}
export interface Plan { id: string; name: string; price_monthly: number; price_yearly: number; seats: number; features: string[]; active: boolean }
export interface Invoice { id: string; org_id: string; org_name: string; plan_name: string; cycle: string; seats: number; amount: number; status: string; date: string; screenshot_url: string; reference: string }
export interface Billing { org: Organization; plan: Plan; plans: Plan[]; invoices: Invoice[]; seats_used: number; payment_qr_url: string; upi_id: string }
export interface AuditLog { id: string; org_id: string | null; actor_name: string; actor_role: string; action: string; resource: string; reason: string; at: string }
export interface PlatformSettings {
  feature_flags: Record<string, boolean>; theme_presets: Record<string, string>[]; default_retention_days: number; maintenance_mode: boolean; payment_qr_url: string; upi_id: string;
}
export interface Analytics {
  kpis: Record<string, number>;
  series: { date: string; conversations: number; deposits: number }[];
  by_employee: { id: string; name: string; avatar: string; conversations: number; deposits: number; target: number; conversion: number }[];
  by_landing: { id: string; title: string; views: number; leads: number; conversations: number; revenue: number }[];
  recent: { customer_name: string; text: string; at: string; conversation_id: string }[];
}
export interface Overview {
  kpis: Record<string, number>; orgs: OrgRow[]; health: { name: string; status: string }[];
}
export interface Ok { ok: boolean; message: string }
export interface EmployeeDetails {
  employee: User; conversations: { id: string; customer_name: string; customer_phone: string; last_message: string; last_message_at: string; landing_title: string }[];
  deposits: Deposit[]; customers: number; calls: number; activity: AuditLog[];
}
export interface OrgDetails { org: OrgRow; staff: EmployeeStat[]; landing_pages: { id: string; title: string; slug: string; published: boolean; views: number; leads: number }[]; invoices: Invoice[] }

// Super Admin customer explorer (mirrors SAEmployee / SACustomerRow / SAConversation / SACustomerDetail)
export interface SAEmployee { id: string; name: string; email: string; org_id: string; org_name: string; avatar: string; status: string; active: boolean; customers: number; conversations: number }
export interface SACustomerRow extends CustomerProfile { org_name: string; email: string; employees: string[]; conversation_count: number; message_count: number; last_message: string }
export interface SAConversation { id: string; employee_id: string | null; employee_name: string; landing_title: string; status: string; last_message: string; last_message_at: string; created_at: string; message_count: number }
export interface SACustomerDetail { customer: SACustomerRow; conversations: SAConversation[]; deposits: Deposit[] }
export interface SACompareRow { id: string; name: string; email: string; org_id: string; org_name: string; avatar: string; active: boolean; customers: number; conversations: number; messages_sent: number; avg_reply_minutes: number | null; converted: number; conversion_rate: number; deposits_total: number; deposit_count: number; target: number }
export interface SASearchHit { kind: "message" | "phone"; message_id: string | null; conversation_id: string; customer_id: string; customer_name: string; customer_phone: string; employee_name: string; org_id: string; org_name: string; sender_name: string; sender_role: string; text: string; created_at: string }
// Employee auto messages (mirrors AutoMsg / AutoMessages)
export interface AutoMsg { id: string; text: string; enabled: boolean }
export interface AutoMessages { enabled: boolean; welcome: AutoMsg[]; return_enabled: boolean; return_text: string }

// Super Admin control center / platform support / admin notifications (mirror backend/models/schemas.py)
export interface JobOut { id: string; kind: string; status: string; org_id: string; result: Record<string, unknown>; created_at: string; finished_at: string }
export interface OrgResetPreview { org_id: string; org_name: string; will_reset: Record<string, number>; preserved: string[] }
export interface SALandingRow extends LandingPage { org_name: string; org_slug: string; domain: string; employee_names: string[]; conversions: number; deleted: boolean }
export interface SupportIdentity { display_name: string; avatar: string }
export interface SACustomerPick { user_id: string; name: string; phone: string; orgs: string[]; opted_in: boolean }
export interface NotificationRecord { id: string; org_id: string; customer_id: string; customer_name: string; title: string; body: string; url: string; status: string; devices: number; delivered: number; sent_by: string; created_at: string }
export interface PushTestOut { devices: number; delivered: number }
export interface NotifyHealthRow { user_id: string; profile_id: string; kind: "employee" | "customer"; name: string; contact: string; avatar: string; status: "on" | "off" | "muted"; devices: number; last_subscribed_at: string; last_reminded_at: string }
export interface NotifyRemindOut { live: boolean; in_chat: boolean; last_reminded_at: string; message: string }
export interface PendingNotifyReminder { org_id: string; org_name: string; from_name: string; text: string; at: string }
