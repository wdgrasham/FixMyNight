# BACKEND-SPEC.md
# FixMyNight — FastAPI Backend Specification
# Version: 1.6 | Status: Authoritative Source of Truth

---

## Overview

FastAPI application deployed on Railway. Python 3.11+. All business logic lives here.
Vapi handles voice. This backend handles everything else.

## Project Structure

```
app/
├── main.py                  # FastAPI app init, router registration
├── database.py              # SQLAlchemy engine, session factory
├── models.py                # SQLAlchemy ORM models
├── schemas.py               # Pydantic request/response schemas
├── auth.py                  # JWT creation and validation
├── dependencies.py          # FastAPI dependencies (require_admin, require_portal)
├── routers/
│   ├── admin.py             # Admin-only endpoints
│   ├── portal.py            # Client portal endpoints
│   ├── webhooks.py          # Vapi webhook handler
│   └── sms.py               # Twilio SMS webhook handler
├── services/
│   ├── vapi.py              # Vapi API client
│   ├── twilio_service.py    # Twilio client
│   ├── time_window.py       # Time window evaluation
│   ├── prompt_builder.py    # Builds Vapi prompt per client
│   ├── industry_defaults.py # Shipped industry config defaults
│   ├── onboarding.py        # Client provisioning orchestration
│   └── email_service.py     # SendGrid summary email
├── cron/
│   ├── morning_summary.py   # Morning summary cron
│   └── oncall_reminder.py   # T-15min on-call reminder cron
└── utils/
    ├── audit.py             # audit_logs writer helper
    └── phone.py             # E.164 validation helpers
```

---

## Dependencies

```txt
fastapi
uvicorn[standard]
sqlalchemy
asyncpg
alembic
pydantic[email]
python-jose[cryptography]
passlib[bcrypt]
httpx
twilio
sendgrid
pytz
slowapi
apscheduler
```

---

## Database Setup

```python
# database.py
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
import os

DATABASE_URL = os.environ["DATABASE_URL"].replace(
    "postgres://", "postgresql+asyncpg://"
)

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
```

---

## ORM Models

```python
# models.py
from sqlalchemy import Column, String, Boolean, DECIMAL, ARRAY, Integer, Text, ForeignKey, Date
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
    caller_phone = Column(String)  # NULL for hangups/wrong numbers
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
```

---

## Authentication

```python
# auth.py
from datetime import datetime, timedelta
from jose import JWTError, ExpiredSignatureError, jwt
from passlib.context import CryptContext
import os

SECRET_KEY = os.environ["JWT_SECRET_KEY"]
ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
ADMIN_TOKEN_EXPIRE_HOURS = 8
PORTAL_TOKEN_EXPIRE_HOURS = 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def create_admin_token() -> str:
    payload = {
        "sub": "admin",
        "role": "admin",
        "exp": datetime.utcnow() + timedelta(hours=ADMIN_TOKEN_EXPIRE_HOURS)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def create_portal_token(client_id: str) -> str:
    payload = {
        "sub": client_id,
        "role": "portal",
        "client_id": client_id,
        "exp": datetime.utcnow() + timedelta(hours=PORTAL_TOKEN_EXPIRE_HOURS)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    from fastapi import HTTPException, status
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="SESSION_EXPIRED")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="TOKEN_INVALID")

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)
```

```python
# dependencies.py
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from .auth import decode_token
from .database import get_db
from .models import Client

bearer_scheme = HTTPBearer()

async def require_admin(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)
):
    payload = decode_token(credentials.credentials)
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="ADMIN_REQUIRED")
    return payload

async def require_portal(
    client_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db)
):
    payload = decode_token(credentials.credentials)
    if payload.get("role") != "portal":
        raise HTTPException(status_code=403, detail="PORTAL_ROLE_REQUIRED")
    if payload.get("client_id") != client_id:
        raise HTTPException(status_code=403, detail="CLIENT_SCOPE_MISMATCH")
    result = await db.execute(
        select(Client).where(Client.id == client_id, Client.status == "active")
    )
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=403, detail="CLIENT_NOT_FOUND_OR_INACTIVE")
    return client
```

---

## Rate Limiting Setup

```python
# main.py
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — allow frontend origin
frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## Auth Endpoints

### POST /api/v1/auth/admin-login

```python
@router.post("/api/v1/auth/admin-login")
@limiter.limit("5/15minutes")
async def admin_login(request: Request, payload: AdminLoginRequest, db: AsyncSession = Depends(get_db)):
    stored_hash = os.environ["ADMIN_PASSWORD_HASH"]
    if not verify_password(payload.password, stored_hash):
        await write_audit_log(db, "auth.admin_login", "admin",
                              metadata={"ip_address": request.client.host, "success": False})
        raise HTTPException(status_code=401, detail="INVALID_CREDENTIALS")
    token = create_admin_token()
    await write_audit_log(db, "auth.admin_login", "admin",
                          metadata={"ip_address": request.client.host, "success": True})
    return {"access_token": token, "token_type": "bearer"}
```

### POST /api/v1/auth/portal-login

```python
@router.post("/api/v1/auth/portal-login")
@limiter.limit("5/15minutes")
async def portal_login(request: Request, payload: PortalLoginRequest, db: AsyncSession = Depends(get_db)):
    # payload includes: email, password, client_id (from frontend URL path)
    query = select(Client).where(Client.contact_email == payload.email, Client.status == "active")
    if payload.client_id:
        query = query.where(Client.id == payload.client_id)
    result = await db.execute(query)
    client = result.scalar_one_or_none()
    if not client or not client.portal_password_hash:
        raise HTTPException(status_code=401, detail="INVALID_CREDENTIALS")
    if not verify_password(payload.password, client.portal_password_hash):
        raise HTTPException(status_code=401, detail="INVALID_CREDENTIALS")
    token = create_portal_token(str(client.id))
    await db.execute(update(Client).where(Client.id == client.id).values(portal_last_login=datetime.utcnow()))
    await db.commit()
    await write_audit_log(db, "auth.portal_login", "portal", client_id=client.id,
                          metadata={"client_id": str(client.id), "ip_address": request.client.host})
    return {"access_token": token, "token_type": "bearer"}
```

### POST /api/v1/auth/portal-set-password
Sets password on first portal login via magic link token.

```python
@router.post("/api/v1/auth/portal-set-password")
async def set_portal_password(payload: SetPasswordRequest, db: AsyncSession = Depends(get_db)):
    client_id = validate_magic_link_token(payload.token)  # Short-lived signed token
    hashed = hash_password(payload.password)
    await db.execute(update(Client).where(Client.id == client_id).values(portal_password_hash=hashed))
    await db.commit()
    portal_token = create_portal_token(str(client_id))
    await write_audit_log(db, "auth.portal_password_set", "portal", client_id=client_id,
                          metadata={"client_id": str(client_id)})
    return {"access_token": portal_token, "token_type": "bearer"}
```

### POST /api/v1/auth/portal-magic-link
Admin triggers magic link email to client.

```python
MAGIC_LINK_EXPIRE_HOURS = 24

def create_magic_link_token(client_id: str) -> str:
    payload = {
        "sub": client_id,
        "purpose": "magic_link",
        "exp": datetime.utcnow() + timedelta(hours=MAGIC_LINK_EXPIRE_HOURS)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def validate_magic_link_token(token: str) -> str:
    """Returns client_id or raises HTTPException."""
    from fastapi import HTTPException, status
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("purpose") != "magic_link":
            raise HTTPException(status_code=401, detail="TOKEN_INVALID")
        return payload["sub"]
    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="MAGIC_LINK_EXPIRED")
    except JWTError:
        raise HTTPException(status_code=401, detail="TOKEN_INVALID")

@router.post("/api/v1/auth/portal-magic-link")
async def send_magic_link(payload: MagicLinkRequest, admin=Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Client).where(Client.id == payload.client_id))
    client = result.scalar_one_or_none()
    if not client or not client.contact_email:
        raise HTTPException(status_code=404, detail="CLIENT_NOT_FOUND_OR_NO_EMAIL")
    token = create_magic_link_token(str(client.id))
    link = f"https://fixmyday.ai/portal/setup?token={token}"
    await send_summary_email(
        to_email=client.contact_email,
        subject=f"{client.business_name} — Set Up Your FixMyNight Portal",
        body=f"Hi {client.owner_name},\n\nClick below to set up your FixMyNight portal:\n{link}\n\nThis link expires in 24 hours.\n\n— FixMyNight"
    )
    return {"status": "sent"}
```

---

## Admin Endpoints

All require `require_admin` dependency.

### GET /api/v1/admin/clients
Returns all clients with summary data.

### POST /api/v1/admin/clients
Creates client and triggers full provisioning. See Onboarding Service.

Request body:
```json
{
  "business_name": "string",
  "owner_name": "string",
  "owner_phone": "+15551234567",
  "contact_email": "owner@business.com",
  "timezone": "America/Chicago",
  "emergency_enabled": true,
  "emergency_fee": 150.00,
  "admin_sms_numbers": ["+15551234567"],
  "business_hours_start": "08:00",
  "business_hours_end": "18:00",
  "business_days": [1,2,3,4,5],
  "business_hours_emergency_dispatch": true,
  "sleep_window_start": "22:00",
  "sleep_window_end": "08:00",
  "summary_send_time": "07:30",
  "callback_expected_time": "09:00",
  "technicians": [{"name": "string", "phone": "+15551234567"}]
}
```

### GET /api/v1/admin/clients/{client_id}
Returns full client detail.

### PATCH /api/v1/admin/clients/{client_id}
Updates client fields. Triggers Vapi rebuild if a rebuild-trigger field is changed.

```python
VAPI_REBUILD_TRIGGERS = {
    "emergency_fee", "emergency_enabled", "callback_expected_time",
    "business_hours_start", "business_hours_end", "business_days",
    "sleep_window_start", "sleep_window_end",
    "business_hours_emergency_dispatch", "business_name",
    "industry_config", "agent_name"
}

async def patch_client(client_id, payload, admin, db):
    updated_fields = payload.dict(exclude_unset=True)
    needs_rebuild = bool(set(updated_fields.keys()) & VAPI_REBUILD_TRIGGERS)

    for field, new_value in updated_fields.items():
        old_value = getattr(client, field)
        if old_value != new_value:
            await write_audit_log(db, "config.field_changed", "admin",
                                  resource_type="client", resource_id=client_id,
                                  client_id=client_id,
                                  metadata={"field": field,
                                            "old_value": str(old_value),
                                            "new_value": str(new_value)})

    await db.execute(update(Client).where(Client.id == client_id).values(**updated_fields))
    await db.commit()

    if needs_rebuild:
        await rebuild_vapi_assistant(client_id, db)
```

### DELETE /api/v1/admin/clients/{client_id}
Soft deactivate. Sets `status = 'inactive'`. Records preserved. Can be reactivated by admin PATCH to `status = 'active'`. Note: `'failed'` is reserved for onboarding failures only.

### GET /api/v1/admin/clients/{client_id}/calls
Call history. Query params: `?limit=50&offset=0&date_from=&date_to=`

### GET /api/v1/admin/clients/{client_id}/technicians
All technicians for a client.

### POST /api/v1/admin/clients/{client_id}/technicians
Adds technician and triggers verification SMS.

### PATCH /api/v1/admin/clients/{client_id}/technicians/{tech_id}
Updates technician. Phone change resets `phone_verified = FALSE` and re-sends verification SMS.

### DELETE /api/v1/admin/clients/{client_id}/technicians/{tech_id}
Soft delete. If currently on-call, sets `on_call = FALSE` first.

---

## Portal Endpoints

All require `require_portal` dependency with matching `client_id`.

### GET /api/v1/portal/{client_id}/dashboard
Summary: recent calls, on-call status, config.

### GET /api/v1/portal/{client_id}/calls
Call history with pagination and date filtering. Includes urgency, time_window, call_type, transfer outcome.

### GET /api/v1/portal/{client_id}/settings
Returns editable client settings (no auth fields returned).

### PATCH /api/v1/portal/{client_id}/settings
Portal-editable fields only:
```python
PORTAL_EDITABLE_FIELDS = {
    "callback_expected_time", "summary_send_time",
    "sleep_window_start", "sleep_window_end",
    "business_hours_start", "business_hours_end",
    "business_days", "business_hours_emergency_dispatch",
    "emergency_fee", "emergency_enabled",
    "contact_email", "admin_sms_numbers"
}
```
Same Vapi rebuild logic as admin PATCH.

### GET /api/v1/portal/{client_id}/technicians
Technicians and current on-call status.

### POST /api/v1/portal/{client_id}/technicians
Add a technician. Triggers verification SMS. Same logic as admin tech POST.

### PATCH /api/v1/portal/{client_id}/technicians/{tech_id}
Update technician name or phone. Phone change resets `phone_verified = FALSE` and re-sends verification SMS. Same logic as admin tech PATCH.

### DELETE /api/v1/portal/{client_id}/technicians/{tech_id}
Soft delete (sets `is_active = FALSE`). If tech is currently on-call, sets `on_call = FALSE` first. Same logic as admin tech DELETE.

---

## Webhook Endpoints

### POST /api/v1/webhooks/vapi-intake

Handles two Vapi event types: `assistant-request` (call start) and `function-call` (tool invocation).

```python
async def get_client_by_vapi_phone(vapi_phone_number_id: str, db) -> Client:
    """Look up client by Vapi's internal phone number ID."""
    result = await db.execute(
        select(Client).where(Client.vapi_phone_number_id == vapi_phone_number_id,
                             Client.status == "active")
    )
    return result.scalar_one_or_none()

async def get_client_by_twilio_number(twilio_number: str, db) -> Client:
    """Look up client by E.164 Twilio number."""
    result = await db.execute(
        select(Client).where(Client.twilio_number == twilio_number,
                             Client.status == "active")
    )
    return result.scalar_one_or_none()

@router.post("/api/v1/webhooks/vapi-intake")
@limiter.limit("60/minute")
async def vapi_intake(request: Request, db: AsyncSession = Depends(get_db)):
    secret = request.headers.get("X-Vapi-Secret")
    if secret != os.environ["VAPI_WEBHOOK_SECRET"]:
        raise HTTPException(status_code=401, detail="INVALID_WEBHOOK_SECRET")

    body = await request.json()
    message_type = body.get("message", {}).get("type")

    # --- assistant-request: fires at call start, return dynamic assistant config ---
    if message_type == "assistant-request":
        phone_number_id = body.get("message", {}).get("call", {}).get("phoneNumberId")
        client = await get_client_by_vapi_phone(phone_number_id, db)
        if not client:
            return {"error": "Client not found"}
        time_window = get_time_window(client)
        prompt = build_sarah_prompt(client, time_window)
        return {
            "assistantId": client.vapi_assistant_id,
            "assistantOverrides": {
                "model": {
                    "provider": "openai",
                    "model": "gpt-4o",
                    "systemPrompt": prompt,
                    "temperature": 0.3
                }
            }
        }

    # --- function-call: fires when the agent invokes transferCall or logCall ---
    function_name = body.get("message", {}).get("functionCall", {}).get("name")
    parameters = body.get("message", {}).get("functionCall", {}).get("parameters", {})
    vapi_call_id = body.get("message", {}).get("call", {}).get("id")
    caller_phone = body.get("message", {}).get("call", {}).get("customer", {}).get("number")
    phone_number_id = body.get("message", {}).get("call", {}).get("phoneNumberId")

    client = await get_client_by_vapi_phone(phone_number_id, db)
    if not client:
        return {"result": "Client not found"}

    # Idempotency check
    idempotency_key = f"{vapi_call_id}:{function_name}"
    existing = await db.execute(select(Call).where(Call.idempotency_key == idempotency_key))
    if existing.scalar_one_or_none():
        return {"result": "Already processed"}

    if function_name == "transferCall":
        return await handle_transfer(client, parameters, vapi_call_id, caller_phone, db)
    elif function_name == "logCall":
        return await handle_log_call(client, parameters, vapi_call_id, caller_phone, db)
    else:
        return {"result": "Unknown function"}
```

#### handle_transfer

CRITICAL: Transfer instruction returned to Vapi BEFORE any DB write.

```python
async def handle_transfer(client, params, vapi_call_id, caller_phone, db):
    time_window = get_time_window(client)

    result = await db.execute(
        select(Technician).where(
            Technician.client_id == client.id,
            Technician.on_call == True,
            Technician.phone_verified == True,
            Technician.is_active == True
        )
    )
    tech = result.scalar_one_or_none()

    if not tech:
        await trigger_fallback_sms(client, params, caller_phone)
        await log_call_record(db, client, params, vapi_call_id, caller_phone,
                              time_window=time_window,
                              transfer_attempted=True, transfer_success=False)
        await write_audit_log(db, "call.transfer_failed", "system", client_id=client.id,
                              metadata={"reason": "no_verified_oncall_tech",
                                        "call_id": vapi_call_id, "fallback_triggered": True})
        return {"result": "No on-call technician available. Emergency team has been alerted."}

    # Return transfer destination FIRST — before any DB write
    transfer_response = {
        "destination": {
            "type": "phoneNumber",
            "phoneNumber": tech.phone,
            "callerId": client.twilio_number,
            "message": "Connecting you with our on-call technician now. Please hold."
        }
    }

    # DB write after transfer instruction — failure here must not affect the transfer
    try:
        await log_call_record(db, client, params, vapi_call_id, caller_phone,
                              time_window=time_window,
                              transfer_attempted=True, transfer_success=True,
                              transferred_to_phone=tech.phone,
                              transferred_to_tech_id=tech.id,
                              requires_callback=False)
        await write_audit_log(db, "call.transfer_attempted", "vapi", client_id=client.id,
                              metadata={"tech_id": str(tech.id), "tech_phone": tech.phone,
                                        "call_id": vapi_call_id})
    except Exception as e:
        print(f"[ERROR] DB write failed after transfer: {e}")

    return transfer_response
```

#### handle_log_call

```python
async def handle_log_call(client, params, vapi_call_id, caller_phone, db):
    time_window = get_time_window(client)
    is_emergency = params.get("is_emergency", False)
    call_type = params.get("call_type", "unknown")
    flagged_urgent = (
        (time_window == "sleep" and is_emergency) or
        (time_window == "business_hours" and is_emergency and not client.business_hours_emergency_dispatch)
    )
    # Messages, wrong numbers, and hangups don't need a callback
    requires_callback = call_type in ("emergency", "routine")

    await log_call_record(db, client, params, vapi_call_id, caller_phone,
                          time_window=time_window, flagged_urgent=flagged_urgent,
                          requires_callback=requires_callback)
    await write_audit_log(db, "call.logged", "system", client_id=client.id,
                          metadata={"call_id": vapi_call_id,
                                    "is_emergency": is_emergency, "time_window": time_window})

    # Business hours: immediate SMS to contractor
    if time_window == "business_hours":
        label = "URGENT — " if is_emergency else ""
        await send_sms(client.owner_phone,
                       f"{label}Missed call for {client.business_name}: "
                       f"{params.get('caller_name', 'Unknown')} {caller_phone} — "
                       f"{params.get('issue_summary', 'No details')}",
                       from_number=client.twilio_number)

    # Sleep window emergency: SMS owner
    if time_window == "sleep" and is_emergency:
        await send_sms(client.owner_phone,
                       f"URGENT overnight call for {client.business_name}: "
                       f"{params.get('caller_name', 'Unknown')} {caller_phone} — "
                       f"{params.get('issue_summary', 'No details')} "
                       f"[Sleep window — no transfer attempted]",
                       from_number=client.twilio_number)

    # No SMS notification for wrong_number, hangup, or unknown call types

    return {"result": "Call logged successfully"}
```

#### log_call_record

Helper to create a Call record with all fields properly populated.

```python
async def log_call_record(db, client, params, vapi_call_id, caller_phone,
                          time_window, transfer_attempted=False, transfer_success=None,
                          transferred_to_phone=None, transferred_to_tech_id=None,
                          flagged_urgent=False, requires_callback=True):
    is_emergency = params.get("is_emergency", False)
    call_type = params.get("call_type", "unknown")

    # Determine fee fields from client config + call context
    fee_offered = (
        client.emergency_fee is not None
        and is_emergency
        and time_window == "evening"
    )
    fee_amount = client.emergency_fee if fee_offered else None
    fee_approved = params.get("fee_approved") if fee_offered else None

    call = Call(
        client_id=client.id,
        caller_phone=caller_phone,
        caller_name=params.get("caller_name"),
        issue_summary=params.get("issue_summary"),
        is_emergency=is_emergency,
        time_window=time_window,
        call_type=call_type,
        fee_offered=fee_offered,
        fee_amount=fee_amount,
        fee_approved=fee_approved,
        transfer_attempted=transfer_attempted,
        transfer_success=transfer_success,
        transferred_to_phone=transferred_to_phone,
        transferred_to_tech_id=transferred_to_tech_id,
        vapi_call_id=vapi_call_id,
        idempotency_key=f"{vapi_call_id}:{'transferCall' if transfer_attempted else 'logCall'}",
        flagged_urgent=flagged_urgent,
        requires_callback=requires_callback
    )
    db.add(call)
    await db.commit()
    return call
```

#### trigger_fallback_sms

Sends emergency alert SMS to all numbers in `admin_sms_numbers`.

```python
import json

async def trigger_fallback_sms(client, params, caller_phone):
    numbers = client.admin_sms_numbers
    if isinstance(numbers, str):
        numbers = json.loads(numbers)
    msg = (f"EMERGENCY for {client.business_name}: "
           f"{params.get('caller_name', 'Unknown')} {caller_phone} — "
           f"{params.get('issue_summary', 'No details')}")
    for number in numbers:
        await send_sms(number, msg, from_number=client.twilio_number)
```

---

### POST /api/v1/webhooks/twilio-sms

Handles inbound SMS. Processes on-call commands from technicians.

```python
from twilio.request_validator import RequestValidator

@router.post("/api/v1/webhooks/twilio-sms")
async def twilio_sms(request: Request, db: AsyncSession = Depends(get_db)):
    # Validate Twilio request signature to prevent spoofed webhooks
    validator = RequestValidator(os.environ["TWILIO_AUTH_TOKEN"])
    form_data = await request.form()
    signature = request.headers.get("X-Twilio-Signature", "")
    if not validator.validate(str(request.url), dict(form_data), signature):
        raise HTTPException(status_code=401, detail="INVALID_TWILIO_SIGNATURE")

    from_number = form_data.get("From")
    to_number = form_data.get("To")
    body = form_data.get("Body", "").strip().upper()

    client = await get_client_by_twilio_number(to_number, db)
    if not client:
        return Response(content="", media_type="application/xml")

    result = await db.execute(
        select(Technician).where(
            Technician.phone == from_number,
            Technician.client_id == client.id,
            Technician.is_active == True,
            Technician.phone_verified == True
        )
    )
    tech = result.scalar_one_or_none()

    # Unknown or unverified sender — silent ignore per spec
    if not tech:
        return Response(content="", media_type="application/xml")

    if body == "ON":
        await handle_on_call_on(tech, client, db)
    elif body == "OFF":
        await handle_on_call_off(tech, client, db)
    elif body == "STATUS":
        await handle_status_request(tech, client, db)
    # All other messages: silent ignore

    return Response(content="", media_type="application/xml")

async def handle_on_call_on(tech, client, db):
    result = await db.execute(
        select(Technician).where(
            Technician.client_id == client.id,
            Technician.on_call == True,
            Technician.id != tech.id
        )
    )
    current_oncall = result.scalar_one_or_none()

    if current_oncall:
        # Bump — do NOT set on_call_end on bumped tech (intentional)
        await db.execute(update(Technician).where(Technician.id == current_oncall.id).values(on_call=False))
        await send_sms(current_oncall.phone,
                       f"You are no longer on-call for {client.business_name}. "
                       f"{tech.name} has taken over.",
                       from_number=client.twilio_number)
        await write_audit_log(db, "tech.bumped", "system", client_id=client.id,
                              metadata={"bumped_tech_id": str(current_oncall.id),
                                        "new_tech_id": str(tech.id)})

    await db.execute(
        update(Technician).where(Technician.id == tech.id)
        .values(on_call=True, on_call_start=datetime.utcnow())
    )
    await db.commit()
    await send_sms(client.owner_phone, f"{tech.name} is now on-call for {client.business_name}.",
                   from_number=client.twilio_number)
    await write_audit_log(db, "tech.on_call_start", "technician",
                          actor_id=str(tech.id),
                          resource_type="technician", resource_id=tech.id,
                          client_id=client.id,
                          metadata={"tech_id": str(tech.id), "tech_name": tech.name,
                                    "bumped_tech_id": str(current_oncall.id) if current_oncall else None})

async def handle_on_call_off(tech, client, db):
    await db.execute(
        update(Technician).where(Technician.id == tech.id)
        .values(on_call=False, on_call_end=datetime.utcnow())
    )
    await db.commit()
    await send_sms(client.owner_phone, f"{tech.name} is no longer on-call for {client.business_name}.",
                   from_number=client.twilio_number)
    await write_audit_log(db, "tech.on_call_end", "technician",
                          actor_id=str(tech.id),
                          resource_type="technician", resource_id=tech.id,
                          client_id=client.id,
                          metadata={"tech_id": str(tech.id), "tech_name": tech.name,
                                    "reason": "manual_off"})

async def handle_status_request(tech, client, db):
    result = await db.execute(
        select(Technician).where(
            Technician.client_id == client.id,
            Technician.on_call == True
        )
    )
    oncall_tech = result.scalar_one_or_none()
    if oncall_tech:
        msg = f"{client.business_name} on-call status: {oncall_tech.name} is currently on-call."
    else:
        msg = f"{client.business_name} on-call status: No technician is currently on-call."
    await send_sms(tech.phone, msg, from_number=client.twilio_number)
```

---

## Services

### Time Window Service

```python
# services/time_window.py
from datetime import datetime
import pytz

def get_time_window(client) -> str:
    tz = pytz.timezone(client.timezone)
    now = datetime.now(tz)
    current_time = now.time()
    current_day = now.isoweekday()  # 1=Monday, 7=Sunday

    # 1. Sleep window (highest priority, every day)
    if client.sleep_window_start is not None and client.sleep_window_end is not None:
        start = client.sleep_window_start
        end = client.sleep_window_end
        if start > end:  # Crosses midnight
            if current_time >= start or current_time < end:
                return 'sleep'
        else:
            if start <= current_time < end:
                return 'sleep'

    # 2. Business hours (configured days only)
    if (client.business_hours_start is not None
            and client.business_hours_end is not None
            and current_day in (client.business_days or [])):
        if client.business_hours_start <= current_time < client.business_hours_end:
            return 'business_hours'

    # 3. Evening window (default)
    return 'evening'
```

### Prompt Builder

```python
# services/prompt_builder.py

def build_sarah_prompt(client, time_window: str = "evening") -> str:
    """
    Build the AI agent's system prompt for a specific time window.
    Called by the assistant-request webhook handler with the current time_window.
    Called by rebuild_vapi_assistant with default "evening" for the static fallback prompt.
    Uses industry_config for industry-specific examples and terminology.
    """
    from .industry_defaults import get_industry_config

    # Merge shipped defaults with client overrides
    config = get_industry_config(client.industry, client.industry_config or {})
    agent_name = client.agent_name or config.get("agent_name", "Sarah")
    service_noun = config.get("service_noun", "service")
    tech_title = config.get("tech_title", "technician")

    # Format emergency and routine examples for prompt injection
    emergency_examples = ", ".join(config.get("emergency_examples", []))
    routine_examples = ", ".join(config.get("routine_examples", []))

    fee_language = ""
    if client.emergency_fee:
        fee_language = (
            f"There is a ${client.emergency_fee:.2f} emergency service fee for after-hours dispatch. "
            f"Inform the caller of this fee and ask for their verbal approval before proceeding. "
            f"If they decline, log the call and let them know the team will follow up in the morning. "
            f"Note: this is fee disclosure only — you do not collect payment."
        )

    callback_time = (
        client.callback_expected_time.strftime("%-I:%M %p")
        if client.callback_expected_time else "9 AM"
    )

    # Select routine callback language for this time window
    if time_window == "business_hours":
        routine_language = "We're currently open — someone will call you back shortly."
    elif time_window == "sleep":
        routine_language = "Our team will follow up first thing in the morning."
    else:  # evening
        routine_language = f"Our team will call you back at {callback_time}."

    # Emergency disclaimer — used for ALL emergency calls
    emergency_disclaimer = (
        'Before offering to connect the caller with a ' + tech_title + ', say: '
        '"If you feel the situation may be unsafe, please don\'t hesitate to contact '
        'your local emergency services."'
    )

    # Build emergency section based on time window + client config
    if time_window == "sleep":
        emergency_section = (
            'EMERGENCY CALLS (sleep window — do NOT transfer):\n'
            'If the caller describes an emergency:\n'
            '1. Acknowledge the urgency.\n'
            '2. Collect name, phone, issue description.\n'
            f'3. {emergency_disclaimer}\n'
            '4. Say EXACTLY: "I completely understand this is urgent. This has been flagged as a priority '
            'emergency and our team will call you first thing in the morning. If this is a life-safety '
            'emergency, please call 911."\n'
            '5. Use logCall with is_emergency=true, call_type="emergency".\n'
            'Do NOT call transferCall under any circumstances.'
        )
    elif not client.emergency_enabled:
        emergency_section = (
            f"If the caller describes an emergency, take their information carefully, "
            f"{emergency_disclaimer} "
            f"Flag it as urgent in logCall, and assure them the team will follow up as soon as possible."
        )
    elif time_window == "business_hours" and client.business_hours_emergency_dispatch:
        emergency_section = (
            f'EMERGENCY CALLS:\n'
            f'If the caller describes an emergency:\n'
            f'1. {emergency_disclaimer}\n'
            f'2. Acknowledge: "I understand this is urgent. Let me get you connected with our on-call {tech_title} right away."\n'
            f'3. Collect name and phone if not yet obtained.\n'
            f'4. Get a brief issue description.\n'
            f'5. Use transferCall with the collected information.\n'
            f'6. If transfer fails: say the result message + "I\'ve sent an urgent alert to our team and someone will call you back shortly."\n'
            f'   Use logCall with is_emergency=true.'
        )
    elif time_window == "business_hours" and not client.business_hours_emergency_dispatch:
        emergency_section = (
            f'EMERGENCY CALLS:\n'
            f'If the caller describes an emergency:\n'
            f'1. Collect name, phone, issue.\n'
            f'2. {emergency_disclaimer}\n'
            f'3. Say: "I\'ve flagged this as urgent — someone will call you back shortly."\n'
            f'4. Use logCall with is_emergency=true, call_type="emergency".\n'
            f'Do NOT attempt a transfer.'
        )
    else:  # evening, emergency enabled
        transfer_instructions = fee_language if fee_language else f'Say: "Let me connect you with our on-call {tech_title} right away."'
        emergency_section = (
            f'EMERGENCY CALLS:\n'
            f'If the caller describes an emergency:\n'
            f'1. Acknowledge the urgency.\n'
            f'2. {emergency_disclaimer}\n'
            f'3. Collect name and phone.\n'
            f'4. {transfer_instructions}\n'
            f'5. Use transferCall with the collected information.\n'
            f'6. If transfer fails: say the result message + "I\'ve sent an urgent alert to our team. Someone will call you back within the hour."\n'
            f'   Use logCall with is_emergency=true.'
        )

    return f"""You are {agent_name}, the after-hours AI assistant for {client.business_name}.

Say this at the very start of every call before anything else: "This call may be recorded for quality purposes."

Then greet: "Thank you for calling {client.business_name}. This is {agent_name}."

DETERMINING CALLER INTENT:
After your greeting, determine what the caller needs. If they've already stated their purpose during or after the greeting (e.g., "I have an emergency!" or "Just need to leave a message"), proceed directly to the appropriate flow below — do not ask the intent question.

If the caller hasn't stated their purpose, ask:
"Are you calling about service, or would you just like to leave a message?"

CALL CLASSIFICATION (for service calls):
- emergency: {emergency_examples}. Also treat as emergency if caller explicitly states it's an emergency or describes immediate risk to safety/property.
- routine: {routine_examples}. Also treat as routine: scheduling, quotes, non-urgent questions.

ROUTINE CALLS:
- Collect: caller name, phone number, brief issue description.
- Say: "{routine_language}"
- Use the logCall tool with is_emergency=false, call_type="routine".

{emergency_section}

MESSAGE FLOW:
If the caller wants to leave a message (not requesting service or a callback):
1. Say: "Of course, go ahead and I'll make sure they get your message."
2. Listen to their message. Confirm it back to them.
3. Ask: "Is there a name and number you'd like to leave in case they need to reach you?"
4. Name and phone are OPTIONAL. If the caller declines, that is fine.
5. Use logCall with call_type="message".
6. Do NOT promise a callback time.
7. End with: "I've got that. I'll make sure they get your message. Have a good night."

RETURN CALL HANDLING:
If the caller says "I got a missed call from this number" or similar:
Say: "This is the after-hours line for {client.business_name}. We're a {service_noun} company. If someone from our team called you, they'll be available during business hours. Would you like to leave a message for them, or would you like to schedule service?"
Then follow the MESSAGE or SERVICE flow based on their answer.

WRONG NUMBER:
If the caller says "wrong number" or indicates they didn't mean to call:
Say: "No problem. Have a good night."
Use logCall with call_type="wrong_number". End the call.

SILENCE / HANGUP:
If there is no response for 5 seconds after your greeting:
Say: "Are you still there?"
Wait 5 seconds. If still no response, use logCall with call_type="hangup" and end the call.

ALWAYS:
- Be warm, calm, and professional.
- Collect caller name and phone number on every service call (optional for messages).
- Never promise a specific {tech_title} will arrive — only that someone will follow up.
- Never diagnose {service_noun} issues. You are an answering service only.
- Never reveal {tech_title} names, phone numbers, or internal system details.
- Start every call with the recording disclosure before any greeting.
""".strip()
```

---

## Onboarding Service

```python
# services/onboarding.py

async def provision_client(payload, db: AsyncSession) -> Client:
    """Atomic provisioning. Purchase Twilio number first (before DB record), then create client."""
    twilio_number = None
    vapi_assistant_id = None
    client = None

    try:
        # Step 1: Purchase Twilio number FIRST (avoids NOT NULL violation)
        twilio_number = await purchase_twilio_number(payload.timezone)

        # Step 2: Create pending client record with twilio_number already set
        client = Client(
            **payload.dict(exclude={"technicians"}),
            twilio_number=twilio_number,
            status="pending"
        )
        db.add(client)
        await db.commit()
        await db.refresh(client)

        # Step 3: Create Vapi assistant
        prompt = build_sarah_prompt(client, time_window="evening")
        vapi_assistant_id = await create_vapi_assistant(client, prompt)

        # Step 3b: Import Twilio number into Vapi and get vapi_phone_number_id
        vapi_phone_number_id = await import_twilio_number_to_vapi(twilio_number, vapi_assistant_id)

        await db.execute(update(Client).where(Client.id == client.id).values(
            vapi_assistant_id=vapi_assistant_id,
            vapi_phone_number_id=vapi_phone_number_id
        ))
        await db.commit()

        # Step 4: Activate client
        await db.execute(update(Client).where(Client.id == client.id).values(status="active"))
        await db.commit()

        # Step 5: Create routing_rules
        rule = RoutingRule(
            client_id=client.id,
            after_hours_start=payload.business_hours_end or "18:00",
            after_hours_end=payload.business_hours_start or "08:00"
        )
        db.add(rule)
        await db.commit()

        # Step 6: Add technicians and send verification SMS
        for tech_data in (payload.technicians or []):
            tech = Technician(client_id=client.id, name=tech_data.name, phone=tech_data.phone)
            db.add(tech)
            await db.commit()
            await db.refresh(tech)
            await send_verification_sms(tech, client)
            # Mark as verified after successful SMS send
            await db.execute(update(Technician).where(Technician.id == tech.id).values(
                phone_verified=True, verified_at=datetime.utcnow()))
            await db.commit()

        return client

    except Exception as e:
        # Rollback all external resources
        if twilio_number:
            await release_twilio_number(twilio_number)
        if vapi_assistant_id:
            await delete_vapi_assistant(vapi_assistant_id)
        if client:
            await db.execute(update(Client).where(Client.id == client.id).values(status="failed"))
            await db.commit()
        admin_phone = os.environ.get("ADMIN_PHONE")
        if admin_phone:
            await send_sms(admin_phone, f"[FixMyNight] Onboarding FAILED for {payload.business_name}: {str(e)}")
        raise
```

### Vapi Service

```python
# services/vapi.py
import httpx, os

VAPI_BASE_URL = "https://api.vapi.ai"

async def create_vapi_assistant(client, prompt: str) -> str:
    async with httpx.AsyncClient() as http:
        r = await http.post(
            f"{VAPI_BASE_URL}/assistant",
            headers={"Authorization": f"Bearer {os.environ['VAPI_API_KEY']}"},
            json={
                "name": f"{client.agent_name} — {client.business_name}",
                "model": {"provider": "openai", "model": "gpt-4o", "systemPrompt": prompt},
                "voice": {"provider": "11labs", "voiceId": "sarah"},
                "tools": [
                    {
                        "type": "function",
                        "function": {
                            "name": "transferCall",
                            "description": "Transfer caller to on-call technician for emergency dispatch.",
                            "parameters": {
                                "type": "object",
                                "properties": {
                                    "caller_name": {"type": "string"},
                                    "caller_phone": {"type": "string"},
                                    "issue_summary": {"type": "string"}
                                },
                                "required": ["caller_phone", "issue_summary"]
                            }
                        }
                    },
                    {
                        "type": "function",
                        "function": {
                            "name": "logCall",
                            "description": "Log call details for morning follow-up.",
                            "parameters": {
                                "type": "object",
                                "properties": {
                                    "caller_name": {"type": "string"},
                                    "caller_phone": {"type": "string"},
                                    "issue_summary": {"type": "string"},
                                    "is_emergency": {"type": "boolean"},
                                    "call_type": {"type": "string",
                                                  "enum": ["emergency","routine","message","wrong_number","hangup","unknown"]},
                                    "fee_approved": {"type": "boolean"}
                                },
                                "required": ["issue_summary", "is_emergency", "call_type"]
                            }
                        }
                    }
                ]
            }
        )
        r.raise_for_status()
        return r.json()["id"]

async def rebuild_vapi_assistant(client_id: str, db):
    """Rebuild the Vapi assistant prompt. Uses 'evening' as default since the
    assistant-request webhook dynamically selects the correct variant per call."""
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one()
    prompt = build_sarah_prompt(client, time_window="evening")
    async with httpx.AsyncClient() as http:
        r = await http.patch(
            f"{VAPI_BASE_URL}/assistant/{client.vapi_assistant_id}",
            headers={"Authorization": f"Bearer {os.environ['VAPI_API_KEY']}"},
            json={"model": {"provider": "openai", "model": "gpt-4o",
                            "systemPrompt": prompt, "temperature": 0.3}}
        )
        r.raise_for_status()

async def import_twilio_number_to_vapi(twilio_number: str, assistant_id: str) -> str:
    """Import a Twilio number into Vapi and link to assistant. Returns vapi phone number ID."""
    async with httpx.AsyncClient() as http:
        r = await http.post(
            f"{VAPI_BASE_URL}/phone-number",
            headers={"Authorization": f"Bearer {os.environ['VAPI_API_KEY']}"},
            json={
                "provider": "twilio",
                "number": twilio_number,
                "twilioAccountSid": os.environ["TWILIO_ACCOUNT_SID"],
                "twilioAuthToken": os.environ["TWILIO_AUTH_TOKEN"],
                "assistantId": assistant_id
            }
        )
        r.raise_for_status()
        return r.json()["id"]

async def delete_vapi_assistant(assistant_id: str):
    async with httpx.AsyncClient() as http:
        await http.delete(
            f"{VAPI_BASE_URL}/assistant/{assistant_id}",
            headers={"Authorization": f"Bearer {os.environ['VAPI_API_KEY']}"}
        )
```

---

## Cron Jobs

### Morning Summary

```python
# cron/morning_summary.py
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from datetime import datetime, date
import pytz

scheduler = AsyncIOScheduler()

@scheduler.scheduled_job("interval", minutes=1)
async def morning_summary_job():
    import time as _time
    start_ms = int(_time.time() * 1000)
    matched = succeeded = failed = 0
    async with AsyncSessionLocal() as db:
        # Batch query: only fetch clients whose summary is due now
        result = await db.execute(
            select(Client).where(
                Client.status == "active",
                Client.last_summary_sent_date != date.today(),  # not yet sent today
            )
        )
        for client in result.scalars():
            tz = pytz.timezone(client.timezone)
            now_local = datetime.now(tz)
            if now_local.time() < client.summary_send_time:
                continue
            matched += 1
            try:
                await maybe_send_morning_summary(client, db)
                succeeded += 1
            except Exception:
                failed += 1
        # Write CronLog record
        elapsed = int(_time.time() * 1000) - start_ms
        if matched > 0:
            cron_entry = CronLog(
                created_at=datetime.utcnow(),
                job_name="morning_summary",
                clients_matched=matched,
                clients_succeeded=succeeded,
                clients_failed=failed,
                execution_ms=elapsed,
            )
            db.add(cron_entry)
            await db.commit()

async def maybe_send_morning_summary(client, db):
    tz = pytz.timezone(client.timezone)
    now = datetime.now(tz)
    today = now.date()

    # Fetch unsent calls, ordered urgent first
    calls_result = await db.execute(
        select(Call).where(Call.client_id == client.id,
                           Call.morning_summary_sent_at == None,
                           )
        .order_by(Call.flagged_urgent.desc(), Call.created_at.asc())
    )
    calls = calls_result.scalars().all()

    # Pre-fetch tech names for transferred calls
    tech_ids = [c.transferred_to_tech_id for c in calls if c.transferred_to_tech_id]
    tech_names = {}
    if tech_ids:
        tech_result = await db.execute(
            select(Technician).where(Technician.id.in_(tech_ids))
        )
        tech_names = {t.id: t.name for t in tech_result.scalars()}

    summary = build_summary(client, calls, tz, tech_names)

    try:
        if client.contact_email:
            tz = pytz.timezone(client.timezone)
            date_str = datetime.now(tz).strftime("%B %d, %Y")
            await send_summary_email(
                to_email=client.contact_email,
                subject=f"{client.business_name} — Overnight Summary {date_str}",
                body=summary
            )
            delivery = "email"
        else:
            await send_sms(client.owner_phone, summary[:1600])
            delivery = "sms"

        call_ids = [c.id for c in calls]
        if call_ids:
            await db.execute(
                update(Call).where(Call.id.in_(call_ids))
                .values(morning_summary_sent_at=datetime.utcnow())
            )
        # Mark summary as sent today (prevents re-sends including empty summaries)
        await db.execute(
            update(Client).where(Client.id == client.id)
            .values(last_summary_sent_date=today)
        )
        await db.commit()

        await write_audit_log(db, "cron.morning_summary_sent", "cron", client_id=client.id,
                              metadata={"client_id": str(client.id), "call_count": len(calls),
                                        "urgent_count": sum(1 for c in calls if c.flagged_urgent),
                                        "delivery": delivery})
    except Exception as e:
        await write_audit_log(db, "cron.morning_summary_failed", "cron", client_id=client.id,
                              metadata={"client_id": str(client.id), "error": str(e)})

def build_summary(client, calls, tz, tech_names=None) -> str:
    tech_names = tech_names or {}
    if not calls:
        return f"{client.business_name} — No calls received overnight. Have a great day.\n— FixMyNight"

    emergencies = [c for c in calls if c.call_type == "emergency"]
    routines = [c for c in calls if c.call_type == "routine"]
    messages = [c for c in calls if c.call_type == "message"]
    wrong_numbers = [c for c in calls if c.call_type == "wrong_number"]
    hangups = [c for c in calls if c.call_type in ("hangup", "unknown")]
    lines = [f"{client.business_name} — Overnight Summary\n"]

    if emergencies:
        lines.append(f"EMERGENCIES ({len(emergencies)}):")
        for c in emergencies:
            t = c.created_at.astimezone(tz).strftime("%-I:%M %p")
            lines.append(f"🔴 {c.caller_name or 'Unknown'} ({c.caller_phone}) — {c.issue_summary or 'No details'}")
            if c.transfer_attempted and c.transfer_success:
                tech_display = tech_names.get(c.transferred_to_tech_id, c.transferred_to_phone)
                lines.append(f"   Transferred to {tech_display} at {t} ✓")
            elif c.transfer_attempted:
                lines.append(f"   Transfer attempted at {t} — failed")
        lines.append("")

    if routines:
        lines.append(f"CALLBACKS NEEDED ({len(routines)}):")
        for c in routines:
            lines.append(f"• {c.caller_name or 'Unknown'} ({c.caller_phone}) — {c.issue_summary or 'No details'}")
        lines.append("")

    if messages:
        lines.append(f"MESSAGES ({len(messages)}):")
        for c in messages:
            lines.append(f"• {c.caller_name or 'Unknown'} — \"{c.issue_summary or 'No details'}\"")
            if c.caller_phone:
                lines.append(f"  Contact: {c.caller_phone}")
            else:
                lines.append(f"  No callback requested.")
        lines.append("")

    # "Also received" line — only if there were wrong numbers or hangups
    also_parts = []
    if wrong_numbers:
        also_parts.append(f"{len(wrong_numbers)} wrong number(s)")
    if hangups:
        also_parts.append(f"{len(hangups)} hangup(s)")
    if also_parts:
        lines.append(f"Also received: {', '.join(also_parts)}.")
        lines.append("")

    lines.append("— FixMyNight | fixmyday.ai")
    return "\n".join(lines)
```

### T-15 On-Call Reminder

```python
# cron/oncall_reminder.py
@scheduler.scheduled_job("interval", minutes=1)
async def oncall_reminder_job():
    import time as _time
    start_ms = int(_time.time() * 1000)
    matched = succeeded = failed = 0
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Client, RoutingRule)
            .join(RoutingRule, RoutingRule.client_id == Client.id)
            .where(Client.status == "active", RoutingRule.is_active == True)
        )
        for client, rule in result:
            tz = pytz.timezone(client.timezone)
            now = datetime.now(tz)
            after_hours_today = tz.localize(datetime.combine(now.date(), rule.after_hours_start))
            minutes_until = (after_hours_today - now).total_seconds() / 60

            today = now.date()
            if 14 <= minutes_until <= 16 and rule.last_oncall_reminder_date != today:
                matched += 1
                try:
                    techs = await db.execute(
                        select(Technician).where(Technician.client_id == client.id,
                                                 Technician.is_active == True,
                                                 Technician.phone_verified == True)
                    )
                    for tech in techs.scalars():
                        await send_sms(tech.phone,
                                       f"After-hours coverage begins in 15 minutes for "
                                       f"{client.business_name}. Text ON to go on-call.",
                                       from_number=client.twilio_number)
                    # Prevent double-fire by marking today's reminder as sent
                    await db.execute(
                        update(RoutingRule).where(RoutingRule.id == rule.id)
                        .values(last_oncall_reminder_date=today)
                    )
                    await db.commit()
                    await write_audit_log(db, "cron.oncall_reminder_sent", "cron",
                                          client_id=client.id,
                                          metadata={"client_id": str(client.id),
                                                    "minutes_until_after_hours": 15})
                    succeeded += 1
                except Exception:
                    failed += 1
        # Write CronLog record
        elapsed = int(_time.time() * 1000) - start_ms
        if matched > 0:
            cron_entry = CronLog(
                created_at=datetime.utcnow(),
                job_name="oncall_reminder",
                clients_matched=matched,
                clients_succeeded=succeeded,
                clients_failed=failed,
                execution_ms=elapsed,
            )
            db.add(cron_entry)
            await db.commit()
```

---

## Audit Log Helper

```python
# utils/audit.py
from datetime import datetime
from ..models import AuditLog

async def write_audit_log(db, event_type, actor_type, actor_id=None,
                           resource_type=None, resource_id=None,
                           client_id=None, metadata=None):
    log = AuditLog(
        created_at=datetime.utcnow(),
        event_type=event_type,
        actor_type=actor_type,
        actor_id=actor_id,
        resource_type=resource_type,
        resource_id=resource_id,
        client_id=client_id,
        metadata=metadata or {}
    )
    db.add(log)
    await db.commit()
```

---

## Email Service

```python
# services/email_service.py
import os
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

async def send_summary_email(to_email: str, subject: str, body: str):
    """Send a plain text email via SendGrid."""
    message = Mail(
        from_email=os.environ["SENDGRID_FROM_EMAIL"],
        to_emails=to_email,
        subject=subject,
        plain_text_content=body
    )
    sg = SendGridAPIClient(os.environ["SENDGRID_API_KEY"])
    sg.send(message)
```

---

## Twilio SMS Helper

```python
# services/twilio_service.py
import asyncio
from twilio.rest import Client as TwilioClient
import os

def get_twilio_client():
    return TwilioClient(os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"])

async def send_sms(to: str, body: str, from_number: str = None):
    """Send SMS via Twilio. Uses asyncio.to_thread to avoid blocking the event loop."""
    client = get_twilio_client()
    await asyncio.to_thread(
        client.messages.create,
        to=to,
        from_=from_number or os.environ["TWILIO_DEFAULT_NUMBER"],
        body=body
    )

async def send_verification_sms(tech, client):
    """Send welcome SMS and set phone_verified=TRUE on successful send."""
    await send_sms(
        tech.phone,
        f"Hi {tech.name}, you've been added as a technician for {client.business_name} "
        f"via FixMyNight. Text ON to go on-call when your shift starts.",
        from_number=client.twilio_number
    )
    # Mark as verified after successful send (no Twilio API error).
    # Delivery-receipt-based verification deferred to V2.
    # Note: caller must pass db session and update tech.phone_verified = True after calling this.
```

---

## Error Response Reference

| Code | Meaning | HTTP Status |
|------|---------|------------|
| `SESSION_EXPIRED` | JWT token expired | 401 |
| `TOKEN_INVALID` | JWT malformed or tampered | 401 |
| `ADMIN_REQUIRED` | Endpoint requires admin role | 403 |
| `PORTAL_ROLE_REQUIRED` | Endpoint requires portal role | 403 |
| `CLIENT_SCOPE_MISMATCH` | Token client_id ≠ path client_id | 403 |
| `CLIENT_NOT_FOUND_OR_INACTIVE` | Client does not exist or deactivated | 403 |
| `INVALID_CREDENTIALS` | Wrong password | 401 |
| `INVALID_WEBHOOK_SECRET` | Vapi webhook secret mismatch | 401 |
| `INVALID_TWILIO_SIGNATURE` | Twilio SMS webhook signature invalid | 401 |
| `MAGIC_LINK_EXPIRED` | Magic link token has expired | 401 |
| `CLIENT_NOT_FOUND_OR_NO_EMAIL` | Client not found or has no contact email | 404 |
| `RATE_LIMIT_EXCEEDED` | Too many requests | 429 |
