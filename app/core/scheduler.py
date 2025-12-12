from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from app.database.db import get_session
from app.database.models import Task, TaskStatus
from app.core.engine import engine as signer_engine
from sqlmodel import select

scheduler = AsyncIOScheduler()

def start_scheduler():
    scheduler.start()
    # Initial load of tasks could be here or via an event
    # But better to load dynamic or on request?
    # For now, let's load all active tasks on startup
    # We can also have a periodic job to refresh tasks if DB changes externally, 
    # but since we only change via API, we can manage jobs there.
    # Actually, simpler: sync_jobs() function called on startup and on task updates.
    pass

async def sync_jobs():
    """Syncs in-memory jobs with DB tasks"""
    session_gen = get_session()
    session = next(session_gen)
    try:
        tasks = session.exec(select(Task)).all()
        # Remove all existing jobs and re-add? Or diff?
        # Re-adding is safer for now.
        scheduler.remove_all_jobs()
        
        for task in tasks:
            if task.status == TaskStatus.ACTIVE:
                # Schedule parsing: assumes cron format "m h d m w" 
                # or simplified. APScheduler CronTrigger defaults.
                # If user provides 5 parts: "* * * * *"
                try:
                    # simplistic cron parse or passed directly if valid
                    # Assuming task.schedule is a standard cron string
                    cron_parts = task.schedule.split(" ")
                    if len(cron_parts) == 5:
                         trigger = CronTrigger(
                            minute=cron_parts[0],
                            hour=cron_parts[1],
                            day=cron_parts[2],
                            month=cron_parts[3],
                            day_of_week=cron_parts[4],
                            jitter=int(task.config.get("jitter", 0))
                        )
                         scheduler.add_job(
                            signer_engine.execute_task,
                            trigger=trigger,
                            args=[str(task.id)],
                            id=str(task.id),
                            replace_existing=True
                        )
                except Exception as e:
                    print(f"Failed to schedule task {task.name}: {e}")
    except Exception as e:
        print(f"Error syncing jobs: {e}")
    finally:
        session.close()

# Helper to restart/update a specific task job
async def update_job(task_id: str):
    await sync_jobs() # Lazy method: just resync all. optimization for later.

def get_next_run_time(task_id: str):
    """Returns the next run time for a given task ID."""
    job = scheduler.get_job(task_id)
    if job:
        return job.next_run_time
    return None
