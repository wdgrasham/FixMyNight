from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from .auth import decode_token
from .database import get_db
from .models import Client

bearer_scheme = HTTPBearer()


async def require_admin(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
):
    payload = decode_token(credentials.credentials)
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="ADMIN_REQUIRED")
    return payload


async def require_portal(
    client_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
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
