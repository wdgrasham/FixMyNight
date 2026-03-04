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
    return {"access_token": portal_token, "token_type": "bearer"}


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
    link = f"{frontend_url}/portal/setup?token={token}"
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
