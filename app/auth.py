from datetime import datetime, timedelta
from jose import JWTError, ExpiredSignatureError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, status
import os

SECRET_KEY = os.environ["JWT_SECRET"]
ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
ADMIN_TOKEN_EXPIRE_HOURS = 8
PORTAL_TOKEN_EXPIRE_HOURS = 24
MAGIC_LINK_EXPIRE_HOURS = 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def create_admin_token() -> str:
    payload = {
        "sub": "admin",
        "role": "admin",
        "exp": datetime.utcnow() + timedelta(hours=ADMIN_TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_portal_token(client_id: str) -> str:
    payload = {
        "sub": client_id,
        "role": "portal",
        "client_id": client_id,
        "exp": datetime.utcnow() + timedelta(hours=PORTAL_TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_magic_link_token(client_id: str) -> str:
    payload = {
        "sub": client_id,
        "purpose": "magic_link",
        "exp": datetime.utcnow() + timedelta(hours=MAGIC_LINK_EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="SESSION_EXPIRED"
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="TOKEN_INVALID"
        )


def validate_magic_link_token(token: str) -> str:
    """Returns client_id or raises HTTPException."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("purpose") != "magic_link":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="TOKEN_INVALID"
            )
        return payload["sub"]
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="MAGIC_LINK_EXPIRED"
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="TOKEN_INVALID"
        )


def create_admin_reset_token() -> str:
    payload = {
        "sub": "admin",
        "purpose": "admin_reset",
        "exp": datetime.utcnow() + timedelta(hours=1),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def validate_admin_reset_token(token: str) -> str:
    """Returns 'admin' or raises HTTPException."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("purpose") != "admin_reset":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="TOKEN_INVALID"
            )
        return payload["sub"]
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="RESET_LINK_EXPIRED"
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="TOKEN_INVALID"
        )


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)
