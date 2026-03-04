from sqlalchemy import (
    Column, String, Boolean, DECIMAL, ARRAY, Integer, Text, ForeignKey, Date,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, TIMESTAMPTZ, TIME
from sqlalchemy.orm import declarative_base
import uuid

Base = declarative_base()


class Client(Base):
    __tablename__ = "clients"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at = Column(TIMESTAMPTZ)
    updated_at = Column(TIMESTAMPTZ)
    business_name = Column(String, nullable=False)
    owner_name = Column(String, nullable=False)
    owner_phone = Column(String, nullable=False)
    contact_email = Column(String)
    industry = Column(String, nullable=False, default="general")
    industry_config = Column(JSONB, nullable=False, default=dict)
    twilio_number = Column(String, unique=True, nullable=False)
    vapi_assistant_id = Column(String)
    emergency_enabled = Column(Boolean, nullable=False, default=False)
    emergency_fee = Column(DECIMAL(10, 2))
    admin_sms_numbers = Column(JSONB, nullable=False, default=list)
    timezone = Column(String, nullable=False, default="America/Chicago")
    business_hours_start = Column(TIME)
    business_hours_end = Column(TIME)
    business_days = Column(ARRAY(Integer), default=[1, 2, 3, 4, 5])
    business_hours_emergency_dispatch = Column(Boolean, nullable=False, default=True)
    sleep_window_start = Column(TIME)
    sleep_window_end = Column(TIME)
    summary_send_time = Column(TIME, nullable=False, default="07:30:00")
    callback_expected_time = Column(TIME, nullable=False, default="09:00:00")
    agent_name = Column(String, nullable=False, default="Sarah")
    vapi_phone_number_id = Column(String)
    status = Column(String, nullable=False, default="pending")
    last_summary_sent_date = Column(Date)
    portal_password_hash = Column(String)
    portal_last_login = Column(TIMESTAMPTZ)


class Technician(Base):
    __tablename__ = "technicians"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at = Column(TIMESTAMPTZ)
    updated_at = Column(TIMESTAMPTZ)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    on_call = Column(Boolean, nullable=False, default=False)
    on_call_start = Column(TIMESTAMPTZ)
    on_call_end = Column(TIMESTAMPTZ)
    phone_verified = Column(Boolean, nullable=False, default=False)
    verified_at = Column(TIMESTAMPTZ)
    is_active = Column(Boolean, nullable=False, default=True)


class Call(Base):
    __tablename__ = "calls"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at = Column(TIMESTAMPTZ)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False)
    caller_phone = Column(String)
    caller_name = Column(String)
    issue_summary = Column(Text)
    is_emergency = Column(Boolean, nullable=False, default=False)
    time_window = Column(String, nullable=False)
    call_type = Column(String)
    fee_offered = Column(Boolean, nullable=False, default=False)
    fee_amount = Column(DECIMAL(10, 2))
    fee_approved = Column(Boolean)
    transfer_attempted = Column(Boolean, nullable=False, default=False)
    transfer_success = Column(Boolean)
    transferred_to_phone = Column(String)
    transferred_to_tech_id = Column(UUID(as_uuid=True), ForeignKey("technicians.id"))
    vapi_call_id = Column(String, unique=True)
    idempotency_key = Column(String, unique=True)
    morning_summary_sent_at = Column(TIMESTAMPTZ)
    flagged_urgent = Column(Boolean, nullable=False, default=False)
    requires_callback = Column(Boolean, nullable=False, default=True)


class RoutingRule(Base):
    __tablename__ = "routing_rules"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at = Column(TIMESTAMPTZ)
    updated_at = Column(TIMESTAMPTZ)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id"), unique=True, nullable=False)
    after_hours_start = Column(TIME, nullable=False)
    after_hours_end = Column(TIME, nullable=False)
    last_oncall_reminder_date = Column(Date)
    is_active = Column(Boolean, nullable=False, default=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at = Column(TIMESTAMPTZ)
    event_type = Column(String, nullable=False)
    actor_type = Column(String, nullable=False)
    actor_id = Column(String)
    resource_type = Column(String)
    resource_id = Column(UUID(as_uuid=True))
    metadata = Column(JSONB, default=dict)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id"))


class CronLog(Base):
    __tablename__ = "cron_log"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at = Column(TIMESTAMPTZ)
    job_name = Column(String, nullable=False)
    clients_matched = Column(Integer, nullable=False, default=0)
    clients_succeeded = Column(Integer, nullable=False, default=0)
    clients_failed = Column(Integer, nullable=False, default=0)
    execution_ms = Column(Integer)
    error_detail = Column(Text)
