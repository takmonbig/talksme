"""Cookie-based JWT sessions + role guards. Authorization is always enforced here, server-side."""
import os
from datetime import timedelta

import jwt
from fastapi import Depends, HTTPException, Request, Response
from starlette.requests import HTTPConnection
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


CUSTOMER_COOKIE = "omni_customer"  # customers get their own cookie so a guest chat never signs staff out on the same browser


def _cookie_for(role: str) -> str:
    return CUSTOMER_COOKIE if role == "customer" else COOKIE


def set_session(resp: Response, user: dict) -> None:
    token = jwt.encode(
        {"sub": user["id"], "role": user["role"], "exp": now() + timedelta(days=400)}, SECRET, algorithm="HS256"
    )
    resp.set_cookie(_cookie_for(user["role"]), token, httponly=True, secure=True, samesite="lax", max_age=400 * 24 * 3600, path="/")


def _decode(token: str | None) -> dict | None:
    if not token:
        return None
    try:
        return jwt.decode(token, SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


def clear_session(resp: Response, request: HTTPConnection | None = None, role: str | None = None) -> None:
    """Sign out of the current side only (staff or customer). A legacy customer token in the staff cookie is cleared too."""
    if role == "customer":
        resp.delete_cookie(CUSTOMER_COOKIE, path="/", secure=True, samesite="lax")
        legacy = _decode(request.cookies.get(COOKIE)) if request else None
        if not legacy or legacy.get("role") != "customer":
            return
    resp.delete_cookie(COOKIE, path="/", secure=True, samesite="lax")


async def optional_user(request: HTTPConnection) -> dict | None:
    # the customer app sends X-Ctx: customer (WebSocket: ?ctx=customer); staff pages prefer the staff cookie
    ctx = request.headers.get("x-ctx") or request.query_params.get("ctx")
    order = (CUSTOMER_COOKIE, COOKIE) if ctx == "customer" else (COOKIE, CUSTOMER_COOKIE)
    for name in order:
        payload = _decode(request.cookies.get(name))
        if not payload:
            continue
        user = await db.users.find_one({"id": payload["sub"]}, PUBLIC_USER)
        if user and user.get("active", True):
            return user
    return None


async def current_user(request: Request) -> dict:
    user = await optional_user(request)
    if not user:
        raise HTTPException(401, "Not authenticated")
    if user["role"] in ("employee", "admin") and user.get("org_id"):
        org = await db.organizations.find_one({"id": user["org_id"]}, {"_id": 0, "status": 1})
        if org and org.get("status") in ("suspended", "archived", "deleted"):
            raise HTTPException(403, f"Organization {org['status']}")
    return user


def require(*roles: str):
    async def dep(user: dict = Depends(current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(403, "Insufficient permissions")
        return user

    return dep
