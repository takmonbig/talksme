"""Shared Mongo handle — import `client`/`db` from here (server.py, routers, seed.py)."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

load_dotenv(Path(__file__).parent.parent / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

logger = logging.getLogger(__name__)

# One entry per collection: every field a route filters, sorts, or dedupes on. Applied by ensure_indexes() at startup.
INDEXES: dict[str, list[IndexModel]] = {
    "users": [IndexModel([("id", ASCENDING)], name="id", unique=True),
              IndexModel([("email", ASCENDING)], name="email", unique=True, partialFilterExpression={"email": {"$type": "string"}}),
              IndexModel([("phone", ASCENDING), ("role", ASCENDING)], name="phone_role"),
              IndexModel([("org_id", ASCENDING), ("role", ASCENDING)], name="org_role")],
    "organizations": [IndexModel([("id", ASCENDING)], name="id", unique=True), IndexModel([("slug", ASCENDING)], name="slug", unique=True)],
    "customer_profiles": [IndexModel([("id", ASCENDING)], name="id", unique=True),
                          IndexModel([("org_id", ASCENDING), ("user_id", ASCENDING)], name="org_user", unique=True),
                          IndexModel([("org_id", ASCENDING), ("assigned_employee_id", ASCENDING)], name="org_emp")],
    "conversations": [IndexModel([("id", ASCENDING)], name="id", unique=True),
                      IndexModel([("customer_id", ASCENDING), ("landing_page_id", ASCENDING)], name="cust_lp", unique=True),
                      IndexModel([("org_id", ASCENDING), ("employee_id", ASCENDING), ("last_message_at", DESCENDING)], name="org_emp_last"),
                      IndexModel([("customer_user_id", ASCENDING)], name="cust_user")],
    "messages": [IndexModel([("conversation_id", ASCENDING), ("created_at", DESCENDING)], name="conv_created"),
                 IndexModel([("conversation_id", ASCENDING), ("idempotency_key", ASCENDING)], name="idem", unique=True)],
    "deposits": [IndexModel([("id", ASCENDING)], name="id", unique=True),
                 IndexModel([("org_id", ASCENDING), ("employee_id", ASCENDING), ("created_at", DESCENDING)], name="org_emp_created"),
                 IndexModel([("org_id", ASCENDING), ("reference", ASCENDING)], name="org_ref")],
    "deposit_events": [IndexModel([("deposit_id", ASCENDING), ("at", ASCENDING)], name="dep_at")],
    "landing_pages": [IndexModel([("id", ASCENDING)], name="id", unique=True),
                      IndexModel([("org_id", ASCENDING), ("slug", ASCENDING)], name="org_slug", unique=True)],
    "transfers": [IndexModel([("org_id", ASCENDING), ("created_at", DESCENDING)], name="org_created")],
    "audit_logs": [IndexModel([("org_id", ASCENDING), ("at", DESCENDING)], name="org_at")],
    "otp_challenges": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:  # one at a time so a bad spec skips only itself
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:  # never block boot on an index; the log line names what to fix
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)
