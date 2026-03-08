import os
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from ..database import get_db
from ..models import Client
from ..schemas import (
    AdminLoginRequest,
    PortalLoginRequest,
    SetPasswordRequest,
    MagicLinkRequest,
    ForgotPasswordRequest,
    TokenResponse,
)
from ..auth import (
    create_admin_token,
    create_portal_token,
    create_magic_link_token,
    validate_magic_link_token,
    verify_password,
    hash_password,
)
from ..dependencies import require_admin
from ..utils.audit import write_audit_log
from ..services.email_service import send_summary_email
from ..limiter import limiter

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/admin-login", response_model=TokenResponse)
@limiter.limit("5/15minutes")
async def admin_login(
    request: Request,
    payload: AdminLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    stored_hash = os.environ["ADMIN_PASSWORD_HASH"]
    if not verify_password(payload.password, stored_hash):
        await write_audit_log(
            db,
            "auth.admin_login",
            "admin",
            metadata={"ip_address": request.client.host, "success": False},
        )
        raise HTTPException(status_code=401, detail="INVALID_CREDENTIALS")
    token = create_admin_token()
    await write_audit_log(
        db,
        "auth.admin_login",
        "admin",
        metadata={"ip_address": request.client.host, "success": True},
    )
    return {"access_token": token, "token_type": "bearer"}


@router.post("/portal-login", response_model=TokenResponse)
@limiter.limit("5/15minutes")
async def portal_login(
    request: Request,
    payload: PortalLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    query = select(Client).where(
        Client.contact_email == payload.email, Client.status == "active"
    )
    if payload.client_id:
        query = query.where(Client.id == payload.client_id)
    result = await db.execute(query)
    client = result.scalar_one_or_none()
    if not client or not client.portal_password_hash:
        raise HTTPException(status_code=401, detail="INVALID_CREDENTIALS")
    if not verify_password(payload.password, client.portal_password_hash):
        raise HTTPException(status_code=401, detail="INVALID_CREDENTIALS")
    token = create_portal_token(str(client.id))
    await db.execute(
        update(Client)
        .where(Client.id == client.id)
        .values(portal_last_login=datetime.utcnow())
    )
    await db.commit()
    await write_audit_log(
        db,
        "auth.portal_login",
        "portal",
        client_id=client.id,
        metadata={
            "client_id": str(client.id),
            "ip_address": request.client.host,
        },
    )
    return {"access_token": token, "token_type": "bearer"}


@router.post("/portal-set-password", response_model=TokenResponse)
async def set_portal_password(
    payload: SetPasswordRequest, db: AsyncSession = Depends(get_db)
):
    client_id = validate_magic_link_token(payload.token)
    hashed = hash_password(payload.password)
    await db.execute(
        update(Client)
        .where(Client.id == client_id)
        .values(portal_password_hash=hashed)
    )
    await db.commit()
    portal_token = create_portal_token(str(client_id))
    await write_audit_log(
        db,
        "auth.portal_password_set",
        "portal",
        client_id=client_id,
        metadata={"client_id": str(client_id)},
    )
    return {"access_token": portal_token, "token_type": "bearer", "client_id": str(client_id)}


@router.post("/verify-setup-token")
async def verify_setup_token(payload: dict, db: AsyncSession = Depends(get_db)):
    """Verify a magic link token and return client_id + business_name without consuming it."""
    token = payload.get("token", "")
    try:
        client_id = validate_magic_link_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="TOKEN_INVALID")
    result = await db.execute(
        select(Client.business_name).where(Client.id == client_id)
    )
    name = result.scalar_one_or_none()
    return {"client_id": str(client_id), "business_name": name or "your business"}


@router.get("/client-info/{client_id}")
async def get_client_info(client_id: str, db: AsyncSession = Depends(get_db)):
    """Public endpoint returning only business_name for a client. Used by login/setup pages."""
    try:
        import uuid
        uuid.UUID(client_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="CLIENT_NOT_FOUND")
    result = await db.execute(
        select(Client.business_name).where(Client.id == client_id, Client.status == "active")
    )
    name = result.scalar_one_or_none()
    if not name:
        raise HTTPException(status_code=404, detail="CLIENT_NOT_FOUND")
    return {"business_name": name}


@router.post("/portal-magic-link")
async def send_magic_link(
    payload: MagicLinkRequest,
    admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Client).where(Client.id == payload.client_id)
    )
    client = result.scalar_one_or_none()
    if not client or not client.contact_email:
        raise HTTPException(
            status_code=404, detail="CLIENT_NOT_FOUND_OR_NO_EMAIL"
        )
    token = create_magic_link_token(str(client.id))
    frontend_url = os.environ.get("FRONTEND_URL", "https://fixmyday.ai")
    link = f"{frontend_url}/fixmynight/portal/setup?token={token}"
    await send_summary_email(
        to_email=client.contact_email,
        subject=f"{client.business_name} — Set Up Your FixMyNight Portal",
        body=(
            f"Hi {client.owner_name},\n\n"
            f"Click below to set up your FixMyNight portal:\n{link}\n\n"
            f"This link expires in 24 hours.\n\n"
            f"— FixMyNight"
        ),
    )
    return {"status": "sent"}


@router.post("/portal-forgot-password")
@limiter.limit("3/15minutes")
async def forgot_password(
    request: Request,
    payload: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    # Always return success to avoid email enumeration
    result = await db.execute(
        select(Client).where(
            Client.contact_email == payload.email,
            Client.status == "active",
        )
    )
    client = result.scalar_one_or_none()
    if not client:
        return {"status": "sent"}

    token = create_magic_link_token(str(client.id))
    frontend_url = os.environ.get("FRONTEND_URL", "https://fixmyday.ai")
    link = f"{frontend_url}/fixmynight/portal/setup?token={token}&reset=true"
    await send_summary_email(
        to_email=client.contact_email,
        subject=f"{client.business_name} — Reset Your FixMyNight Password",
        body=(
            f"Hi {client.owner_name or 'there'},\n\n"
            f"We received a request to reset your FixMyNight portal password.\n\n"
            f"Click below to set a new password:\n{link}\n\n"
            f"This link expires in 24 hours. If you didn't request this, "
            f"you can safely ignore this email.\n\n"
            f"— FixMyNight"
        ),
    )
    await write_audit_log(
        db,
        "auth.forgot_password",
        "portal",
        client_id=client.id,
        metadata={"email": payload.email},
    )
    return {"status": "sent"}
