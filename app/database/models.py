import uuid
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON as SA_JSON    

class TaskMode(str, Enum):
    PASSWORD = "PASSWORD"
    COOKIE = "COOKIE"

class TaskStatus(str, Enum):
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"

class TaskResult(str, Enum):
    SUCCESS = "SUCCESS"
    FAILURE = "FAILURE"

class Task(SQLModel, table=True):
    id: Optional[str] = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    name: str
    mode: TaskMode
    schedule: str  # Cron expression
    # Using SA_JSON for JSON storage compatibility
    config: Dict[str, Any] = Field(default={}, sa_column=Column(SA_JSON))
    status: TaskStatus = Field(default=TaskStatus.ACTIVE)
    last_run: Optional[datetime] = Field(default=None)
    last_result: Optional[TaskResult] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

class Log(SQLModel, table=True):
    id: Optional[str] = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    task_id: str = Field(foreign_key="task.id")
    timestamp: datetime = Field(default_factory=datetime.now)
    status: bool  # True for success, False for failure
    output: str

class User(SQLModel, table=True):
    id: Optional[str] = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    username: str = Field(index=True, unique=True)
    hashed_password: str
    is_active: bool = Field(default=True)
