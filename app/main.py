from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from app.api import routes
from app.core.scheduler import start_scheduler, sync_jobs
from app.database.db import create_db_and_tables, engine
from sqlmodel import Session, select
from app.database.models import User
from app.core.security import get_password_hash

app = FastAPI(title="AutoSigner", version="1.0.0")

# Mount Static Files
app.mount("/static", StaticFiles(directory="app/web/static"), name="static")

# Include Routers
app.include_router(routes.router)

@app.on_event("startup")
async def on_startup():
    create_db_and_tables()
    
    # Initialize Default User
    with Session(engine) as session:
        user = session.exec(select(User)).first()
        if not user:
            print("Creating default admin user...")
            hashed_pwd = get_password_hash("admin")
            admin_user = User(username="admin", hashed_password=hashed_pwd)
            session.add(admin_user)
            session.commit()
            print("Default user 'admin' created with password 'admin'")
            
    start_scheduler()
    await sync_jobs()

@app.get("/health")
async def health():
    return {"status": "ok"}

