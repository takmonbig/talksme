"""Employee auto messages: pre-made welcome messages sent automatically when a customer starts (or returns to) a chat."""
from fastapi import APIRouter, Depends

from lib.auth import require
from lib.db import db
from lib.util import new_id
from models.schemas import AutoMessages

router = APIRouter()
emp = require("employee")


@router.get("/employee/auto-messages", response_model=AutoMessages)
async def get_auto(user: dict = Depends(emp)):
    return AutoMessages(**(user.get("auto_messages") or {}))


@router.put("/employee/auto-messages", response_model=AutoMessages)
async def put_auto(body: AutoMessages, user: dict = Depends(emp)):
    for m in body.welcome:
        m.id = m.id or new_id()
    data = body.model_dump()
    await db.users.update_one({"id": user["id"]}, {"$set": {"auto_messages": data}})
    return AutoMessages(**data)
