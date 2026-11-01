"""Pydantic v2 models. Every model here has a hand-written TS twin in frontend/src/lib/types.ts."""
import re
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator



def pixel_from(v: str) -> str:
    """Admins may paste the Pixel ID or the whole Meta Pixel base code: return the numeric Pixel ID."""
    v = v.strip()
    if not v or v.isdigit():
        return v
    m = re.search(r"fbq\(\s*['\"]init['\"]\s*,\s*['\"](\d{6,20})", v) or re.search(r"[?&]id=(\d{6,20})", v) or re.search(r"\b(\d{15,16})\b", v)
    if not m:
        raise ValueError("Couldn't find a Meta Pixel ID. Paste the Pixel ID (15-16 digits) or the full Meta Pixel code.")
    return m.group(1)

class Base(BaseModel):
    model_config = ConfigDict(extra="ignore")


# ---------- users / auth ----------
class User(Base):
    id: str
    email: Optional[str] = None
    name: str
    role: Literal["customer", "employee", "admin", "superadmin"]
    org_id: Optional[str] = None
    avatar: str = ""
    title: str = ""
    phone: Optional[str] = ""
    backup_skipped: bool = False
    bio: str = ""
    profile_link: str = ""
    status: str = "offline"
    verified: bool = False
    active: bool = True
    calls_enabled: bool = True
    guest: bool = False
    target: float = 0
    notify_sound: bool = True
    notify_push: bool = False
    display_phone: str = ""
    show_phone: bool = False


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class MeUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=60)
    avatar: Optional[str] = None
    status: Optional[Literal["online", "offline", "away"]] = None
    calls_enabled: Optional[bool] = None
    notify_sound: Optional[bool] = None
    notify_push: Optional[bool] = None


# ---------- organizations ----------
class Organization(Base):
    id: str
    name: str
    slug: str
    domain: str = ""
    domain_status: str = "unconfigured"
    plan_id: str
    billing_cycle: str = "monthly"
    seats: int = 3
    status: str = "active"
    primary_color: str = "#0284C7"
    accent_color: str = "#8B5CF6"
    font: str = "Inter"
    logo_url: str = ""
    banner_url: str = ""
    retention_days: int = 90
    created_at: str
    trial_ends: Optional[str] = None
    features: dict[str, bool] = {}
    intro_video_url: str = ""
    intro_enabled: bool = True
    verified: bool = False  # "Verified by TalksMe" badge, granted by Super Admin


class OrgBrandingUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2)
    primary_color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    accent_color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    font: Optional[str] = None
    logo_url: Optional[str] = None
    banner_url: Optional[str] = None
    retention_days: Optional[int] = Field(None, ge=7, le=3650)
    intro_video_url: Optional[str] = Field(None, pattern=r"^(https://\S{3,500})?$")
    intro_enabled: Optional[bool] = None


class DomainIn(BaseModel):
    domain: str = Field(pattern=r"^([a-z0-9-]+\.)+[a-z]{2,}$")


# ---------- CRM ----------
class Note(Base):
    id: str
    text: str
    author_name: str
    created_at: str


class FollowUp(Base):
    id: str
    title: str
    due: str
    done: bool = False


class CustomerProfile(Base):
    id: str
    org_id: str
    user_id: str
    name: str
    phone: str = ""
    calls_allowed: bool = True
    labels: list[str] = []
    stage: str = "New Lead"
    assigned_employee_id: Optional[str] = None
    assigned_employee_name: str = ""
    blocked: bool = False
    opted_in: bool = True
    notes: list[Note] = []
    follow_ups: list[FollowUp] = []
    created_at: str
    last_active: str
    total_deposits: float = 0
    deposit_count: int = 0


class CustomerUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=80)
    phone: Optional[str] = Field(None, pattern=r"^\+?\d{6,16}$")
    calls_allowed: Optional[bool] = None
    labels: Optional[list[str]] = None
    stage: Optional[str] = None
    blocked: Optional[bool] = None
    opted_in: Optional[bool] = None
    assigned_employee_id: Optional[str] = None


class NoteIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class FollowUpIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    due: str = Field(min_length=8)


class FollowUpPatch(BaseModel):
    done: bool


# ---------- conversations / messages ----------
class Attachment(Base):
    kind: Literal["image", "video", "audio", "file", "sticker"]
    name: str
    url: str = ""
    size: int = 0


class Conversation(Base):
    id: str
    org_id: str
    org_name: str
    org_color: str = "#0284C7"
    customer_id: str
    customer_user_id: str
    customer_name: str
    customer_phone: str
    employee_id: Optional[str] = None
    employee_name: str = ""
    employee_avatar: str = ""
    employee_status: str = "offline"
    employee_title: str = ""
    employee_bio: str = ""
    employee_link: str = ""
    employee_verified: bool = False
    employee_phone: str = ""  # Admin-set display number, only when switched on
    org_verified: bool = False
    landing_page_id: Optional[str] = None
    landing_title: str = ""
    last_message: str = ""
    last_message_at: str
    unread: int = 0
    archived: bool = False
    muted: bool = False
    vip: bool = False
    follow_up: bool = False
    blocked: bool = False
    calls_enabled: bool = True
    customer_calls_allowed: bool = True
    typing: bool = False
    created_at: str


class Message(Base):
    id: str
    conversation_id: str
    sender_role: str
    sender_id: Optional[str] = None
    sender_name: str = ""
    text: str = ""
    attachment: Optional[Attachment] = None
    reply_to: Optional[str] = None
    reply_preview: str = ""
    status: str = "sent"
    kind: str = "text"  # "phone_request" = backup-number card; "menu" = choose-option buttons
    options: list["MenuOption"] = []
    answered: str = ""
    deleted_by_customer: bool = False  # staff view: customer hid this for themselves only
    created_at: str


class MessageIn(BaseModel):
    text: str = Field("", max_length=4000)
    attachment: Optional[Attachment] = None
    reply_to: Optional[str] = None
    idempotency_key: str = Field(min_length=8, max_length=64)


class ConversationPatch(BaseModel):
    archived: Optional[bool] = None
    muted: Optional[bool] = None
    follow_up: Optional[bool] = None


class CallIn(BaseModel):
    status: Literal["completed", "missed", "rejected", "busy", "failed"]
    duration: int = Field(0, ge=0, le=36000)


class Call(Base):
    id: str
    conversation_id: str
    initiated_by: str
    status: str
    duration: int
    at: str


class ReportIn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)
    block: bool = True


class TransferIn(BaseModel):
    to_employee_id: str
    reason: str = Field(min_length=3, max_length=500)


class Transfer(Base):
    id: str
    org_id: str
    conversation_id: str
    customer_name: str
    from_employee_id: str
    from_employee_name: str
    to_employee_id: str
    to_employee_name: str
    reason: str
    status: str
    created_at: str
    decided_by_name: str = ""


class DecideIn(BaseModel):
    approve: bool


class AssignIn(BaseModel):
    employee_id: str
    reason: str = Field("Admin reassignment", max_length=300)


# ---------- deposits ----------
DepositStatus = Literal["Recorded", "Reviewed", "Disputed", "Reversed"]


class Deposit(Base):
    id: str
    org_id: str
    customer_id: str
    customer_name: str
    employee_id: str
    employee_name: str
    amount: float
    currency: str
    product: str
    method: str
    reference: str
    payment_date: str
    notes: str = ""
    proof_name: str = ""
    status: str
    created_at: str


class DepositIn(BaseModel):
    customer_id: str
    amount: float = Field(gt=0, le=100_000_000)
    currency: Literal["INR", "USD", "EUR", "AED", "GBP"] = "INR"
    product: str = Field("Payment", min_length=2, max_length=120)
    method: Literal["UPI", "Bank Transfer", "Card", "Cash", "Wallet", "Other"]
    reference: str = Field("", max_length=80)
    payment_date: str = Field(min_length=10, max_length=10)
    notes: str = Field("", max_length=1000)
    proof_name: str = ""


class DepositStatusIn(BaseModel):
    status: DepositStatus
    reason: str = Field("", max_length=500)


class DepositCorrectionIn(BaseModel):
    amount: float = Field(gt=0)
    reason: str = Field(min_length=5, max_length=500)


class DepositEvent(Base):
    id: str
    deposit_id: str
    action: str
    from_status: str = ""
    to_status: str = ""
    old_amount: Optional[float] = None
    new_amount: Optional[float] = None
    reason: str = ""
    actor_name: str
    at: str


# ---------- landing pages ----------
class RechargeService(Base):
    id: str = ""
    name: str = Field(min_length=1, max_length=60)
    image: str = ""
    brief: str = Field("", max_length=300)
    min_amount: float = Field(100, gt=0, le=10_000_000)
    max_amount: float = Field(10000, gt=0, le=10_000_000)
    bonus_pct: float = Field(0, ge=0, le=500)
    active: bool = True


class PaymentConfig(Base):
    """UPI details shown on the recharge page. qr_mode 'auto' = QR generated with the exact amount; 'image' = Admin's uploaded QR."""
    upi_id: str = Field("", max_length=80)
    payee_name: str = Field("", max_length=80)
    qr_mode: Literal["auto", "image"] = "auto"
    qr_image: str = ""
    note: str = Field("", max_length=200)


class MenuOption(Base):
    id: str
    label: str
    action: str = "reply"  # "call" = tapping it starts an audio call


class FlowMsg(Base):
    id: str = ""
    text: str = Field("", max_length=1000)
    attachment: Optional[Attachment] = None


class FlowOption(Base):
    id: str = ""
    label: str = Field(min_length=1, max_length=40)
    next: str = ""  # node id ("" = end of the flow)
    action: Literal["reply", "call"] = "reply"


class FlowNode(Base):
    id: str
    title: str = Field("", max_length=60)
    messages: list[FlowMsg] = Field(default_factory=list, max_length=20)
    options: list[FlowOption] = Field(default_factory=list, max_length=10)
    prompt: str = Field("Please choose an option 👇", max_length=200)


class Flow(Base):
    """Automatic first messages + multi-step 'choose an option' menu tree for one landing page."""
    enabled: bool = False
    root: str = ""
    nodes: list[FlowNode] = Field(default_factory=list, max_length=50)


class LPImage(Base):
    id: str
    url: str
    label: str
    description: str = ""
    default_message: str = ""
    employee_id: Optional[str] = None


class LandingPage(Base):
    id: str
    org_id: str
    title: str
    slug: str
    template: Literal["A", "B", "C"]
    description: str = ""
    cta_text: str = "Chat Now"
    primary_color: str = "#0284C7"
    font: str = "Inter"
    logo_url: str = ""
    banner_url: str = ""
    trust_items: list[str] = []
    routing: Literal["fixed", "round_robin", "least_busy", "manual", "team"] = "round_robin"
    assigned_employee_ids: list[str] = []
    images: list[LPImage] = []
    calls_enabled: bool = True
    pixel_id: str = ""
    pixel_ids: list[str] = []
    published: bool = False
    available_24_7: bool = False
    default_message: str = ""
    flow: Flow = Flow()
    services: list[RechargeService] = []
    payment: PaymentConfig = PaymentConfig()
    auto_send_default: bool = False
    employee_can_edit_message: bool = False
    archived: bool = False
    views: int = 0
    leads: int = 0
    created_at: str


class LandingPageIn(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    slug: str = Field(min_length=2, max_length=60, pattern=r"^[a-z0-9-]+$")
    template: Literal["A", "B", "C"] = "B"
    description: str = Field("", max_length=600)
    cta_text: str = Field("Chat Now", min_length=2, max_length=40)
    primary_color: str = Field("#0284C7", pattern=r"^#[0-9A-Fa-f]{6}$")
    font: str = "Inter"
    logo_url: str = ""
    banner_url: str = ""
    trust_items: list[str] = []
    routing: Literal["fixed", "round_robin", "least_busy", "manual", "team"] = "round_robin"
    assigned_employee_ids: list[str] = []
    images: list[LPImage] = []
    calls_enabled: bool = True
    pixel_id: str = Field("", pattern=r"^(\d{6,20})?$")
    pixel_ids: list[str] = Field(default_factory=list, max_length=5)  # multiple Meta Pixels per page
    published: bool = False
    available_24_7: bool = False
    default_message: str = Field("", max_length=500)
    auto_send_default: bool = False
    employee_can_edit_message: bool = False
    flow: Flow = Flow()
    services: list[RechargeService] = Field(default_factory=list, max_length=30)
    payment: PaymentConfig = PaymentConfig()

    @field_validator("pixel_id", mode="before")
    @classmethod
    def _extract_pixel_id(cls, v: object) -> object:
        return pixel_from(v) if isinstance(v, str) else v

    @field_validator("pixel_ids", mode="before")
    @classmethod
    def _extract_pixel_ids(cls, v: object) -> object:
        if not isinstance(v, list):
            return v
        out: list[str] = []
        for x in v:
            pid = pixel_from(x) if isinstance(x, str) else x
            if pid and pid not in out:
                out.append(pid)
        return out


class PublicEmployee(Base):
    id: str
    name: str
    avatar: str = ""
    title: str = ""
    status: str = "offline"
    verified: bool = False


class PublicLanding(Base):
    page: LandingPage
    org: Organization
    employees: list[PublicEmployee]


class StartChatIn(BaseModel):
    """No login needed: name/phone are optional. Without a phone the customer chats as a Guest."""
    name: Optional[str] = Field(None, min_length=2, max_length=60)
    country_code: Optional[str] = Field(None, pattern=r"^\+\d{1,4}$")
    phone: Optional[str] = Field(None, pattern=r"^\d{6,14}$")
    employee_id: Optional[str] = None
    image_id: Optional[str] = None


class StartChatOut(Base):
    status: Literal["ok", "verification_required"]
    conversation_id: Optional[str] = None
    challenge_id: Optional[str] = None
    mock_code: Optional[str] = None
    prefill: str = ""


class VerifyIn(BaseModel):
    challenge_id: str
    code: str = Field(pattern=r"^\d{6}$")


# ---------- broadcasts ----------
class Broadcast(Base):
    id: str
    org_id: str
    title: str
    message: str
    segment: str
    scheduled_at: Optional[str] = None
    status: str
    recipients: int
    delivered: int = 0
    read: int = 0
    opted_out: int = 0
    created_at: str


class BroadcastIn(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    message: str = Field(min_length=3, max_length=1000)
    segment: str = "all"
    scheduled_at: Optional[str] = None


# ---------- employees (admin) ----------
class EmployeeIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    email: EmailStr
    password: str = Field(min_length=8)
    title: str = Field("Sales Associate", max_length=60)
    target: float = Field(0, ge=0)


class EmployeePatch(BaseModel):
    name: Optional[str] = Field(None, min_length=2)
    title: Optional[str] = Field(None, max_length=60)
    bio: Optional[str] = Field(None, max_length=300)
    profile_link: Optional[str] = Field(None, pattern=r"^(https?://[^\s]{3,300})?$")
    status: Optional[Literal["online", "away", "offline"]] = None  # Admin can set an employee online/offline
    active: Optional[bool] = None
    verified: Optional[bool] = None
    calls_enabled: Optional[bool] = None
    target: Optional[float] = Field(None, ge=0)
    avatar: Optional[str] = Field(None, pattern=r"^(https://\S{3,500})?$")
    display_phone: Optional[str] = Field(None, pattern=r"^(\+?[\d ]{6,18})?$")
    show_phone: Optional[bool] = None


class EmployeeStat(User):
    open_conversations: int = 0
    total_conversations: int = 0
    deposits_total: float = 0


# ---------- billing ----------
class Plan(Base):
    id: str
    name: str
    price_monthly: float
    price_yearly: float
    seats: int
    features: list[str] = []
    active: bool = True


class PlanIn(BaseModel):
    name: str = Field(min_length=2)
    price_monthly: float = Field(ge=0)
    price_yearly: float = Field(ge=0)
    seats: int = Field(ge=1, le=10000)
    features: list[str] = []
    active: bool = True


class Invoice(Base):
    id: str
    org_id: str
    org_name: str
    plan_name: str
    cycle: str
    seats: int
    amount: float
    status: str
    date: str
    screenshot_url: str = ""
    reference: str = ""


class ProofIn(BaseModel):
    screenshot_url: str = Field(min_length=10)
    reference: str = Field("", max_length=80)


class PasswordIn(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8)


class ResetPwIn(BaseModel):
    password: str = Field(min_length=8)


class BillingChangeIn(BaseModel):
    plan_id: str
    cycle: Literal["monthly", "yearly"]
    seats: int = Field(ge=1, le=10000)


class Billing(Base):
    org: Organization
    plan: Plan
    plans: list[Plan]
    invoices: list[Invoice]
    seats_used: int
    payment_qr_url: str = ""
    upi_id: str = ""


# ---------- super admin ----------
class OrgCreateIn(BaseModel):
    name: str = Field(min_length=2)
    slug: str = Field(pattern=r"^[a-z0-9-]{2,40}$")
    plan_id: str
    seats: int = Field(3, ge=1)
    admin_name: str = Field(min_length=2)
    admin_email: EmailStr
    admin_password: str = Field(min_length=8)
    trial: bool = True


class OrgPatch(BaseModel):
    status: Optional[Literal["active", "trial", "suspended", "archived", "deleted"]] = None
    seats: Optional[int] = Field(None, ge=1)
    plan_id: Optional[str] = None
    domain: Optional[str] = None
    features: Optional[dict[str, bool]] = None
    verified: Optional[bool] = None
    reason: str = Field("", max_length=300)


class OrgRow(Organization):
    plan_name: str = ""
    employees: int = 0
    customers: int = 0
    conversations: int = 0
    deposits_total: float = 0
    mrr: float = 0


class AdminIn(BaseModel):
    org_id: str
    name: str = Field(min_length=2)
    email: EmailStr
    password: str = Field(min_length=8)


class AccessIn(BaseModel):
    reason: str = Field(min_length=10, max_length=500)
    password: str = Field(min_length=1)


class AuditLog(Base):
    id: str
    org_id: Optional[str] = None
    actor_name: str
    actor_role: str
    action: str
    resource: str
    reason: str = ""
    at: str


class PlatformSettings(Base):
    feature_flags: dict[str, bool]
    theme_presets: list[dict[str, str]]
    default_retention_days: int = 90
    maintenance_mode: bool = False
    payment_qr_url: str = ""
    upi_id: str = ""


class Analytics(Base):
    kpis: dict[str, float]
    series: list[dict[str, Any]]
    by_employee: list[dict[str, Any]]
    by_landing: list[dict[str, Any]]
    recent: list[dict[str, Any]]


class Ok(Base):
    ok: bool = True
    message: str = ""


# ---------- super admin customer explorer ----------
class SAEmployee(Base):
    id: str
    name: str
    email: str
    org_id: str
    org_name: str = ""
    avatar: str = ""
    status: str = "offline"
    active: bool = True
    customers: int = 0
    conversations: int = 0


class SACustomerRow(CustomerProfile):
    org_name: str = ""
    email: str = ""
    employees: list[str] = []
    conversation_count: int = 0
    message_count: int = 0
    last_message: str = ""


class SAConversation(Base):
    id: str
    employee_id: Optional[str] = None
    employee_name: str = ""
    landing_title: str = ""
    status: str = "open"
    last_message: str = ""
    last_message_at: str
    created_at: str
    message_count: int = 0


class SACustomerDetail(Base):
    customer: SACustomerRow
    conversations: list[SAConversation]
    deposits: list[Deposit]


class SACompareRow(Base):
    id: str
    name: str
    email: str
    org_id: str
    org_name: str = ""
    avatar: str = ""
    active: bool = True
    customers: int = 0
    conversations: int = 0
    messages_sent: int = 0
    avg_reply_minutes: Optional[float] = None
    converted: int = 0
    conversion_rate: float = 0
    deposits_total: float = 0
    deposit_count: int = 0
    target: float = 0


class SASearchHit(Base):
    kind: Literal["message", "phone"]
    message_id: Optional[str] = None
    conversation_id: str
    customer_id: str
    customer_name: str
    customer_phone: str
    employee_name: str = ""
    org_id: str
    org_name: str = ""
    sender_name: str = ""
    sender_role: str = ""
    text: str = ""
    created_at: str


# ---------- push + calls ----------
class PushKeys(Base):
    p256dh: str = Field(min_length=10, max_length=200)
    auth: str = Field(min_length=8, max_length=100)


class PushSubscriptionIn(Base):
    endpoint: str = Field(pattern=r"^https://", max_length=1000)
    keys: PushKeys


class PushKeyOut(Base):
    public_key: str


class IceServersOut(Base):
    ice_servers: list[dict]
    turn: bool


# ---------- employee auto messages ----------
class AutoMsg(Base):
    id: str = ""
    text: str = Field("", max_length=1000)
    attachment: Optional[Attachment] = None
    enabled: bool = True


class AutoMessages(Base):
    enabled: bool = True
    welcome: list[AutoMsg] = Field(default_factory=list, max_length=20)
    return_enabled: bool = False
    return_text: str = Field(default="", max_length=1000)


class BackupPhoneIn(BaseModel):
    country_code: str = Field(pattern=r"^\+\d{1,4}$")
    phone: str = Field(pattern=r"^\d{6,14}$")


class AgoraJoinOut(Base):
    app_id: str
    channel: str
    uid: int
    token: Optional[str] = None


# ---------- super admin control center / platform support / admin notifications ----------
class OrgBulkIn(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=500)
    action: Literal["activate", "suspend", "archive", "delete", "restore", "plan", "seats"]
    plan_id: Optional[str] = None
    seats: Optional[int] = Field(None, ge=1, le=10000)
    reason: str = Field("", max_length=300)


class OrgBulkOut(Base):
    updated: int
    skipped: list[str] = []


class ResetLinkOut(Base):
    url: str
    expires_at: str


class PasswordResetIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=8, max_length=128)


class OrgResetPreview(Base):
    org_id: str
    org_name: str
    will_reset: dict[str, int]
    preserved: list[str]


class OrgResetIn(BaseModel):
    password: str = Field(min_length=1)
    confirm_name: str
    reason: str = Field(min_length=5, max_length=300)


class JobOut(Base):
    id: str
    kind: str
    status: str
    org_id: str = ""
    result: dict[str, Any] = {}
    created_at: str
    finished_at: str = ""


class SALandingRow(LandingPage):
    org_name: str = ""
    org_slug: str = ""
    domain: str = ""
    employee_names: list[str] = []
    conversions: int = 0
    deleted: bool = False


class SALandingPatch(BaseModel):
    published: Optional[bool] = None
    archived: Optional[bool] = None
    title: Optional[str] = Field(None, min_length=2, max_length=120)
    cta_text: Optional[str] = Field(None, min_length=2, max_length=40)
    description: Optional[str] = Field(None, max_length=600)


class SupportStartIn(BaseModel):
    customer_user_id: str
    text: str = Field(min_length=1, max_length=4000)
    kind: Literal["support", "announcement"] = "support"


class SupportIdentity(Base):
    display_name: str = "TalksMe Support"
    avatar: str = ""


class SACustomerPick(Base):
    user_id: str
    name: str
    phone: str = ""
    orgs: list[str] = []
    opted_in: bool = False


class NotifyIn(BaseModel):
    customer_id: str
    title: str = Field(min_length=1, max_length=80)
    body: str = Field(min_length=1, max_length=300)
    url: str = Field("", max_length=500)


class NotificationRecord(Base):
    id: str
    org_id: str
    customer_id: str
    customer_name: str
    title: str
    body: str
    url: str = ""
    status: str
    devices: int = 0
    delivered: int = 0
    sent_by: str = ""
    created_at: str


class NotifyHealthRow(Base):
    user_id: str
    profile_id: str = ""
    kind: str
    name: str
    contact: str = ""
    avatar: str = ""
    status: str  # on | off | muted
    devices: int = 0
    last_subscribed_at: str = ""
    last_reminded_at: str = ""


class NotifyRemindIn(BaseModel):
    user_id: str


class NotifyRemindOut(Base):
    live: bool
    in_chat: bool
    last_reminded_at: str
    message: str


class PendingNotifyReminder(Base):
    org_id: str = ""
    org_name: str = ""
    from_name: str = ""
    text: str
    at: str


class DefaultMessageIn(BaseModel):
    default_message: str = Field("", max_length=500)


class PushTestOut(Base):
    devices: int
    delivered: int


class MenuChoiceIn(BaseModel):
    option_id: str


class Sticker(Base):
    id: str
    scope: Literal["builtin", "org", "mine"]
    name: str = ""
    url: str
    owner_id: str = ""


class StickerIn(BaseModel):
    url: str = Field(pattern=r"^https://\S{3,500}$")
    name: str = Field("", max_length=40)
    scope: Literal["org", "mine"] = "mine"


class IntroOut(Base):
    enabled: bool
    url: str



class FlowOptionStat(Base):
    option_id: str
    label: str
    count: int
    pct: float


class FlowNodeStat(Base):
    node_id: str
    title: str
    prompt: str
    shown: int
    answered: int
    options: list[FlowOptionStat]


class FlowStats(Base):
    landing_page_id: str
    title: str
    slug: str
    flow_enabled: bool
    chats: int
    menus_shown: int
    answered: int
    response_rate: float
    top_option: str = ""
    nodes: list[FlowNodeStat]



class RechargeIn(BaseModel):
    org_slug: str
    slug: str
    service_id: str
    amount: float = Field(gt=0, le=10_000_000)
    screenshot_url: str = Field(pattern=r"^https://\S{3,600}$")
    utr: str = Field("", max_length=40)


class RechargeCredentials(Base):
    username: str = ""
    password: str = ""
    note: str = ""


class RechargeRequest(Base):
    id: str
    org_id: str
    org_name: str = ""
    landing_page_id: str
    service_id: str
    service_name: str
    service_image: str = ""
    customer_user_id: str
    customer_name: str
    customer_phone: str = ""
    conversation_id: str = ""
    employee_id: Optional[str] = None
    employee_name: str = ""
    amount: float
    bonus_pct: float
    bonus_amount: float
    total_credit: float
    screenshot_url: str
    utr: str = ""
    status: Literal["pending", "approved", "rejected"]
    reject_reason: str = ""
    handled_by_name: str = ""
    credentials: Optional[RechargeCredentials] = None
    created_at: str
    updated_at: str = ""


class RechargeApproveIn(BaseModel):
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=120)
    note: str = Field("", max_length=300)


class RechargeRejectIn(BaseModel):
    reason: str = Field(min_length=3, max_length=300)


class RechargeSummary(Base):
    pending: int
    approved_today: int
    approved_total_amount: float
    approved_today_amount: float


Message.model_rebuild()
