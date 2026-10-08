"""Pydantic v2 models. Every model here has a hand-written TS twin in frontend/src/lib/types.ts."""
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


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
    phone: str = ""
    status: str = "offline"
    verified: bool = False
    active: bool = True
    calls_enabled: bool = True
    guest: bool = False
    target: float = 0
    notify_sound: bool = True
    notify_push: bool = False


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


class OrgBrandingUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2)
    primary_color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    accent_color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    font: Optional[str] = None
    logo_url: Optional[str] = None
    banner_url: Optional[str] = None
    retention_days: Optional[int] = Field(None, ge=7, le=3650)


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
    phone: str
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
    kind: Literal["image", "video", "audio", "file"]
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
    product: str = Field(min_length=2, max_length=120)
    method: Literal["UPI", "Bank Transfer", "Card", "Cash", "Wallet", "Other"]
    reference: str = Field(min_length=3, max_length=80)
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
class LPImage(Base):
    id: str
    url: str
    label: str
    employee_id: Optional[str] = None


class LandingPage(Base):
    id: str
    org_id: str
    title: str
    slug: str
    template: Literal["A", "B"]
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
    published: bool = False
    available_24_7: bool = False
    views: int = 0
    leads: int = 0
    created_at: str


class LandingPageIn(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    slug: str = Field(min_length=2, max_length=60, pattern=r"^[a-z0-9-]+$")
    template: Literal["A", "B"] = "B"
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
    published: bool = False
    available_24_7: bool = False


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
    name: str = Field(min_length=2, max_length=60)
    country_code: str = Field(pattern=r"^\+\d{1,4}$")
    phone: str = Field(pattern=r"^\d{6,14}$")
    employee_id: Optional[str] = None
    image_id: Optional[str] = None


class StartChatOut(Base):
    status: Literal["ok", "verification_required"]
    conversation_id: Optional[str] = None
    challenge_id: Optional[str] = None
    mock_code: Optional[str] = None


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
    title: Optional[str] = None
    active: Optional[bool] = None
    verified: Optional[bool] = None
    calls_enabled: Optional[bool] = None
    target: Optional[float] = Field(None, ge=0)


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
    status: Optional[Literal["active", "trial", "suspended"]] = None
    seats: Optional[int] = Field(None, ge=1)
    plan_id: Optional[str] = None
    domain: Optional[str] = None
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


class Analytics(Base):
    kpis: dict[str, float]
    series: list[dict[str, Any]]
    by_employee: list[dict[str, Any]]
    by_landing: list[dict[str, Any]]
    recent: list[dict[str, Any]]


class Ok(Base):
    ok: bool = True
    message: str = ""
