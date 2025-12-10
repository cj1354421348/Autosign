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
    # Sync Admin User from Environment Variables
    import os
    admin_user_name = os.getenv("ADMIN_USERNAME", "admin")
    admin_password = os.getenv("ADMIN_PASSWORD", "admin")
    
    with Session(engine) as session:
        # Check if the configured admin user exists
        user = session.exec(select(User).where(User.username == admin_user_name)).first()
        
        hashed_pwd = get_password_hash(admin_password)
        
        if user:
            # Update existing user's password
            user.hashed_password = hashed_pwd
            session.add(user)
            session.commit()
            print(f"Admin user '{admin_user_name}' password updated from environment variable.")
        else:
            # Create new admin user
            print(f"Creating admin user '{admin_user_name}' from environment variable...")
            new_user = User(username=admin_user_name, hashed_password=hashed_pwd)
            session.add(new_user)
            session.commit()
            print(f"Admin user '{admin_user_name}' created.")
            
    start_scheduler()
    await sync_jobs()

@app.get("/health")
async def health():
    return {"status": "ok"}

