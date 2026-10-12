from fastapi import APIRouter, Depends, HTTPException, Request, Response

from lib.auth import PUBLIC_USER, clear_session, current_user, set_session, verify_pw
from lib.db import db
from lib.util import audit
from lib.auth import hash_pw
from models.schemas import LoginIn, MeUpdate, Ok, PasswordIn, User

router = APIRouter()
_attempts: dict[str, list[float]] = {}


@router.post("/auth/login", response_model=User)
async def login(body: LoginIn, response: Response, request: Request):
    import time
    key = f"{request.client.host if request.client else ''}:{body.email.lower()}"
    recent = [t for t in _attempts.get(key, []) if time.time() - t < 300]
    if len(recent) >= 10:
        raise HTTPException(429, "Too many login attempts. Try again in a few minutes.")
    user = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if not user or not verify_pw(body.password, user.get("password_hash")):
        _attempts[key] = recent + [time.time()]
        raise HTTPException(401, "Invalid email or password")
    if not user.get("active", True):
        raise HTTPException(403, "Account deactivated. Contact your administrator.")
    if user["role"] in ("employee", "admin") and user.get("org_id"):
        org = await db.organizations.find_one({"id": user["org_id"]}, {"_id": 0, "status": 1})
        if org and org.get("status") == "suspended":
            raise HTTPException(403, "Organization suspended")
    _attempts.pop(key, None)
    set_session(response, user)
    await audit(user, "auth.login", f"user:{user['id']}", user.get("org_id"))
    return User(**user)


@router.post("/auth/logout", response_model=Ok)
async def logout(response: Response):
    clear_session(response)
    return Ok()


@router.get("/auth/me", response_model=User)
async def me(response: Response, user: dict = Depends(current_user)):
    set_session(response, user)  # sliding session: stay signed in on this device (no repeated logins)
    return User(**user)


@router.patch("/auth/me", response_model=User)
async def update_me(body: MeUpdate, user: dict = Depends(current_user)):
    upd = body.model_dump(exclude_none=True)
    if upd:
        await db.users.update_one({"id": user["id"]}, {"$set": upd})
        if "name" in upd and user["role"] == "customer":
            await db.customer_profiles.update_many({"user_id": user["id"]}, {"$set": {"name": upd["name"]}})
    return User(**(await db.users.find_one({"id": user["id"]}, PUBLIC_USER)))


@router.patch("/auth/password", response_model=Ok)
async def change_password(body: PasswordIn, user: dict = Depends(current_user)):
    full = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    if not verify_pw(body.current_password, full.get("password_hash")):
        raise HTTPException(400, "Current password is incorrect")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_pw(body.new_password)}})
    await audit(user, "auth.password_changed", f"user:{user['id']}", user.get("org_id"))
    return Ok(message="Password updated")


# NOTE: the old global "/demo/reset" endpoint was removed: it let any signed-in user wipe the whole platform.
# Resets are now per-organization, Super Admin only, re-authenticated and audited (routers/platform.py).
