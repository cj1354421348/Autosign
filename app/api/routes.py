from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import HTMLResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select
from app.database.db import get_session
from app.database.models import Task, Log, TaskStatus, User
from app.core.engine import engine as signer_engine
from app.core.scheduler import update_job, get_next_run_time
from fastapi.templating import Jinja2Templates
from app.core.security import verify_password, create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES
from app.api.deps import get_current_user
import uuid
from datetime import timedelta, datetime
from typing import Optional, List

router = APIRouter()
templates = Jinja2Templates(directory="app/web/templates")

try:
    with open("VERSION", "r", encoding="utf-8") as f:
        version = f.read().strip()
except Exception:
    version = "unknown"

templates.env.globals["version"] = version

# API Endpoints
@router.post("/token")
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.username == form_data.username)).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/api/tasks")
async def get_tasks(session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    tasks = session.exec(select(Task)).all()
    result = []
    for t in tasks:
        t_dict = t.dict()
        nxt = get_next_run_time(str(t.id))
        t_dict['next_run_time'] = nxt
        result.append(t_dict)
    return result

@router.get("/api/tasks/{task_id}")
async def get_task(task_id: str, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    t_dict = task.dict()
    t_dict['next_run_time'] = get_next_run_time(str(task.id))
    return t_dict

@router.post("/api/tasks")
async def create_task(task: Task, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    try:
        session.add(task)
        session.commit()
        session.refresh(task)
        await update_job(str(task.id))
        return task
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to create task: {str(e)}")


@router.put("/api/tasks/{task_id}")
async def update_task(task_id: str, task_data: Task, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task_data_dict = task_data.dict(exclude_unset=True)
    for key, value in task_data_dict.items():
        setattr(task, key, value)
        
    session.add(task)
    session.commit()
    session.refresh(task)
    await update_job(str(task.id))
    return task

@router.delete("/api/tasks/{task_id}")
async def delete_task(task_id: str, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    session.delete(task)
    session.commit()
    await update_job(str(task_id))
    return {"ok": True}

@router.post("/api/tasks/{task_id}/run")
async def run_task(task_id: str, current_user: User = Depends(get_current_user)):
    await signer_engine.execute_task(task_id)
    return {"status": "executed"}

@router.get("/api/logs")
async def get_logs(session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    logs = session.exec(select(Log).order_by(Log.timestamp.desc()).limit(100)).all()
    return logs

@router.get("/api/logs/{task_id}")
async def get_task_logs(task_id: str, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    logs = session.exec(select(Log).where(Log.task_id == task_id).order_by(Log.timestamp.desc()).limit(50)).all()
    return logs

# Web Routes
@router.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})

@router.get("/", response_class=HTMLResponse)
async def read_dashboard(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@router.get("/task/new", response_class=HTMLResponse)
async def new_task_page(request: Request):
    return templates.TemplateResponse("edit_task.html", {"request": request, "task_id": None})

@router.get("/task/{task_id}", response_class=HTMLResponse)
async def edit_task_page(task_id: str, request: Request):
    return templates.TemplateResponse("edit_task.html", {"request": request, "task_id": task_id})
