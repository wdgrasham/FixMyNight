import re
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List
from datetime import time, date, datetime
from decimal import Decimal
from uuid import UUID


def validate_e164_phone(v: str) -> str:
    """Normalize and validate a US phone number to E.164 format (+1XXXXXXXXXX)."""
    digits = re.sub(r'\D', '', v)
    if len(digits) == 10:
        return f"+1{digits}"
    if len(digits) == 11 and digits.startswith('1'):
        return f"+{digits}"
    raise ValueError('Invalid phone number format. Must be a valid 10-digit US number.')


# --- Auth ---


class AdminLoginRequest(BaseModel):
    password: str


class PortalLoginRequest(BaseModel):
    email: EmailStr
    password: str
    client_id: Optional[str] = None


class SetPasswordRequest(BaseModel):
    token: str
    password: str


class MagicLinkRequest(BaseModel):
    client_id: UUID


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# --- Technician ---


class TechnicianCreate(BaseModel):
    name: str
    phone: str

    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return validate_e164_phone(v)


class TechnicianUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None

    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v: str) -> str:
        if v is None:
            return v
        return validate_e164_phone(v)


class TechnicianResponse(BaseModel):
    id: UUID
    name: str
    phone: str
    on_call: bool
    on_call_start: Optional[datetime] = None
    phone_verified: bool
    is_active: bool
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# --- Client ---


class ClientCreate(BaseModel):
    business_name: str
    owner_name: str
    owner_phone: str
    contact_email: Optional[EmailStr] = None
    timezone: str = "America/Chicago"
    industry: str = "general"
    industry_config: Optional[dict] = None
    emergency_enabled: bool = False
    emergency_fee: Optional[Decimal] = None
    admin_sms_numbers: List[str] = []
    business_hours_start: Optional[str] = None
    business_hours_end: Optional[str] = None
    business_days: List[int] = [1, 2, 3, 4, 5]
    business_hours_emergency_dispatch: bool = True
    sleep_window_start: Optional[str] = None
    sleep_window_end: Optional[str] = None
    summary_send_time: str = "07:30"
    callback_expected_time: str = "09:00"
    agent_name: str = "Sarah"
    technicians: Optional[List[TechnicianCreate]] = None

    @field_validator('owner_phone')
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return validate_e164_phone(v)

    @field_validator('admin_sms_numbers')
    @classmethod
    def validate_sms_numbers(cls, v: List[str]) -> List[str]:
        return [validate_e164_phone(n) for n in v if n.strip()]


class ClientUpdate(BaseModel):
    business_name: Optional[str] = None
    owner_name: Optional[str] = None
    owner_phone: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    timezone: Optional[str] = None
    industry: Optional[str] = None
    industry_config: Optional[dict] = None
    emergency_enabled: Optional[bool] = None
    emergency_fee: Optional[Decimal] = None
    admin_sms_numbers: Optional[List[str]] = None
    business_hours_start: Optional[str] = None
    business_hours_end: Optional[str] = None
    business_days: Optional[List[int]] = None
    business_hours_emergency_dispatch: Optional[bool] = None
    sleep_window_start: Optional[str] = None
    sleep_window_end: Optional[str] = None
    summary_send_time: Optional[str] = None
    callback_expected_time: Optional[str] = None
    agent_name: Optional[str] = None
    status: Optional[str] = None
    subscription_tier: Optional[str] = None

    @field_validator('owner_phone')
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return validate_e164_phone(v)

    @field_validator('admin_sms_numbers')
    @classmethod
    def validate_sms_numbers(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return v
        return [validate_e164_phone(n) for n in v if n.strip()]


class PortalSettingsUpdate(BaseModel):
    callback_expected_time: Optional[str] = None
    summary_send_time: Optional[str] = None
    sleep_window_start: Optional[str] = None
    sleep_window_end: Optional[str] = None
    business_hours_start: Optional[str] = None
    business_hours_end: Optional[str] = None
    business_days: Optional[List[int]] = None
    business_hours_emergency_dispatch: Optional[bool] = None
    emergency_fee: Optional[Decimal] = None
    emergency_enabled: Optional[bool] = None
    contact_email: Optional[EmailStr] = None
    admin_sms_numbers: Optional[List[str]] = None

    @field_validator('admin_sms_numbers')
    @classmethod
    def validate_sms_numbers(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return v
        return [validate_e164_phone(n) for n in v if n.strip()]


class ClientResponse(BaseModel):
    id: UUID
    business_name: str
    owner_name: str
    owner_phone: str
    contact_email: Optional[str] = None
    industry: str
    timezone: str
    emergency_enabled: bool
    emergency_fee: Optional[Decimal] = None
    admin_sms_numbers: list = []
    business_hours_start: Optional[time] = None
    business_hours_end: Optional[time] = None
    business_days: Optional[List[int]] = None
    business_hours_emergency_dispatch: bool
    sleep_window_start: Optional[time] = None
    sleep_window_end: Optional[time] = None
    summary_send_time: Optional[time] = None
    callback_expected_time: Optional[time] = None
    agent_name: str
    twilio_number: str
    vapi_assistant_id: Optional[str] = None
    status: str
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# --- Calls ---


class CallResponse(BaseModel):
    id: UUID
    created_at: Optional[datetime] = None
    client_id: UUID
    caller_phone: Optional[str] = None
    caller_name: Optional[str] = None
    issue_summary: Optional[str] = None
    is_emergency: bool
    time_window: str
    call_type: Optional[str] = None
    fee_offered: bool
    fee_amount: Optional[Decimal] = None
    fee_approved: Optional[bool] = None
    transfer_attempted: bool
    transfer_success: Optional[bool] = None
    transferred_to_phone: Optional[str] = None
    vapi_call_id: Optional[str] = None
    duration_seconds: Optional[int] = None
    recording_url: Optional[str] = None
    flagged_urgent: bool
    requires_callback: bool
    vapi_cost: Optional[Decimal] = None
    morning_summary_sent_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class CallsListResponse(BaseModel):
    calls: List[CallResponse]
    total: int


# --- Portal Dashboard ---


class OnCallTechSummary(BaseModel):
    name: str
    since: Optional[str] = None


class SettingsSummary(BaseModel):
    summary_send_time: Optional[str] = None
    callback_expected_time: Optional[str] = None
    emergency_enabled: bool = False
    emergency_fee: Optional[Decimal] = None
    sleep_window_start: Optional[str] = None
    sleep_window_end: Optional[str] = None


class Stats7d(BaseModel):
    total_calls: int = 0
    emergencies: int = 0
    transfers_completed: int = 0
    transfer_success_rate: float = 0.0


class UsageStatus(BaseModel):
    calls_used: int = 0
    calls_included: int = 0
    overage_calls: int = 0
    usage_percent: float = 0.0
    subscription_tier: Optional[str] = None
    overage_rate: str = "1.50"


class DashboardResponse(BaseModel):
    on_call_tech: Optional[OnCallTechSummary] = None
    twilio_number: Optional[str] = None
    recent_calls: List[CallResponse]
    settings_summary: SettingsSummary
    stats_7d: Stats7d
    usage_status: Optional[UsageStatus] = None
