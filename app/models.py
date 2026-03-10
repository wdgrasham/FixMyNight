from sqlalchemy import (
    Column, String, Boolean, DECIMAL, ARRAY, Integer, Text, ForeignKey, Date,
    DateTime, Index, Time,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import declarative_base
import uuid

Base = declarative_base()


class Client(Base):
    __tablename__ = "clients"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True))
    business_name = Column(String, nullable=False)
    owner_name = Column(String, nullable=False)
    owner_phone = Column(String, nullable=False)
    contact_email = Column(String)
    industry = Column(String, nullable=False, default="hvac")
    industry_config = Column(JSONB, nullable=False, default=dict)
    twilio_number = Column(String, unique=True, nullable=False)
    vapi_assistant_id = Column(String)
    emergency_enabled = Column(Boolean, nullable=False, default=False)
    emergency_fee = Column(DECIMAL(10, 2))
    admin_sms_numbers = Column(JSONB, nullable=False, default=list)
    timezone = Column(String, nullable=False, default="America/Chicago")
    business_hours_start = Column(Time)
    business_hours_end = Column(Time)
    business_days = Column(ARRAY(Integer), default=[1, 2, 3, 4, 5])
    business_hours_schedule = Column(JSONB)
    business_hours_emergency_dispatch = Column(Boolean, nullable=False, default=True)
    sleep_window_start = Column(Time)
    sleep_window_end = Column(Time)
    summary_send_time = Column(Time, nullable=False, default="07:30:00")
    callback_expected_time = Column(Time, nullable=False, default="09:00:00")
    agent_name = Column(String, nullable=False, default="Sarah")
    vapi_phone_number_id = Column(String)
    status = Column(String, nullable=False, default="pending")
    last_summary_sent_date = Column(Date)
    portal_password_hash = Column(String)
    portal_last_login = Column(DateTime(timezone=True))
    stripe_customer_id = Column(String, unique=True)
    stripe_subscription_id = Column(String, unique=True)
    subscription_tier = Column(String)
    subscription_status = Column(String)
    avg_job_value = Column(DECIMAL(10, 2), default=250.00)
    last_monthly_summary_sent_date = Column(Date)
    plan_call_limit = Column(Integer)
    last_overage_reported_date = Column(Date)


class Technician(Base):
    __tablename__ = "technicians"
    __table_args__ = (
        Index(
            "idx_one_on_call_per_client",
            "client_id",
            unique=True,
            postgresql_where=Column("on_call") == True,
        ),
    )
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True))
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    on_call = Column(Boolean, nullable=False, default=False)
    on_call_start = Column(DateTime(timezone=True))
    on_call_end = Column(DateTime(timezone=True))
    phone_verified = Column(Boolean, nullable=False, default=False)
    verified_at = Column(DateTime(timezone=True))
    is_active = Column(Boolean, nullable=False, default=True)


class Call(Base):
    __tablename__ = "calls"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at = Column(DateTime(timezone=True))
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
    vapi_call_id = Column(String, index=True)
    idempotency_key = Column(String, unique=True)
    call_started_at = Column(DateTime(timezone=True))
    call_ended_at = Column(DateTime(timezone=True))
    duration_seconds = Column(Integer)
    recording_url = Column(String)
    vapi_cost = Column(DECIMAL(10, 4))
    morning_summary_sent_at = Column(DateTime(timezone=True))
    flagged_urgent = Column(Boolean, nullable=False, default=False)
    requires_callback = Column(Boolean, nullable=False, default=True)


class RoutingRule(Base):
    __tablename__ = "routing_rules"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True))
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), unique=True, nullable=False)
    after_hours_start = Column(Time, nullable=False)
    after_hours_end = Column(Time, nullable=False)
    last_oncall_reminder_date = Column(Date)
    is_active = Column(Boolean, nullable=False, default=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at = Column(DateTime(timezone=True))
    event_type = Column(String, nullable=False)
    actor_type = Column(String, nullable=False)
    actor_id = Column(String)
    resource_type = Column(String)
    resource_id = Column(UUID(as_uuid=True))
    meta = Column("metadata", JSONB, default=dict)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id"))


class SystemSetting(Base):
    __tablename__ = "system_settings"
    key = Column(String, primary_key=True)
    value = Column(String, nullable=False)
    updated_at = Column(DateTime(timezone=True))


class CronLog(Base):
    __tablename__ = "cron_log"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at = Column(DateTime(timezone=True))
    job_name = Column(String, nullable=False)
    clients_matched = Column(Integer, nullable=False, default=0)
    clients_succeeded = Column(Integer, nullable=False, default=0)
    clients_failed = Column(Integer, nullable=False, default=0)
    execution_ms = Column(Integer)
    error_detail = Column(Text)
