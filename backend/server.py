import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
from lib.db import client, db, ensure_indexes
from lib.seed_data import reset_demo
from lib.realtime import hub
from routers import admin, auth, automsg, platform, chat, crm, notify, public, realtime, sa_explorer, superadmin


async def _boot() -> None:
    await ensure_indexes()
    if not await db.users.find_one({"role": "superadmin"}):
        await reset_demo()
    await platform.ensure_platform_org()
    # One-time: guests used to be created with push off by default, which silently blocked their notifications.
    if not await db.migrations.find_one({"_id": "push-default-on"}):
        await db.users.update_many({"role": "customer", "notify_push": False}, {"$set": {"notify_push": True}})
        await db.migrations.insert_one({"_id": "push-default-on"})


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.boot_task = asyncio.create_task(_boot())
    app.state.relay_task = asyncio.create_task(hub.relay_loop())  # cross-replica realtime fan-out
    yield
    app.state.relay_task.cancel()
    client.close()


app = FastAPI(lifespan=lifespan, title="OmniChat CRM by talksme.in")
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "OmniChat CRM API", "mode": "preview"}


for r in (auth, public, chat, crm, admin, superadmin, sa_explorer, realtime, notify, automsg, platform):
    api_router.include_router(r.router)

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
