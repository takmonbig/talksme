"""Cookie-based JWT sessions + role guards. Authorization is always enforced here, server-side."""
import os
from datetime import timedelta

import jwt
from fastapi import Depends, HTTPException, Request, Response
from passlib.context import CryptContext

from lib.db import db
from lib.util import now

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
COOKIE = "omni_session"
SECRET = os.environ["JWT_SECRET"]
PUBLIC_USER = {"_id": 0, "password_hash": 0}


def hash_pw(p: str) -> str:
    return pwd.hash(p)


def verify_pw(p: str, h: str | None) -> bool:
    return bool(h) and pwd.verify(p, h)


def set_session(resp: Response, user: dict) -> None:
    token = jwt.encode(
        {"sub": user["id"], "role": user["role"], "exp": now() + timedelta(hours=12)}, SECRET, algorithm="HS256"
    )
    resp.set_cookie(COOKIE, token, httponly=True, secure=True, samesite="lax", max_age=12 * 3600, path="/")


def clear_session(resp: Response) -> None:
    resp.delete_cookie(COOKIE, path="/", secure=True, samesite="lax")


async def optional_user(request: Request) -> dict | None:
    token = request.cookies.get(COOKIE)
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    user = await db.users.find_one({"id": payload["sub"]}, PUBLIC_USER)
    if not user or not user.get("active", True):
        return None
    return user


async def current_user(request: Request) -> dict:
    user = await optional_user(request)
    if not user:
        raise HTTPException(401, "Not authenticated")
    if user["role"] in ("employee", "admin") and user.get("org_id"):
        org = await db.organizations.find_one({"id": user["org_id"]}, {"_id": 0, "status": 1})
        if org and org.get("status") == "suspended":
            raise HTTPException(403, "Organization suspended")
    return user


def require(*roles: str):
    async def dep(user: dict = Depends(current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(403, "Insufficient permissions")
        return user

    return dep
