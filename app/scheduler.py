"""APScheduler setup for recurring jobs"""

from typing import Optional
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.memory import MemoryJobStore
from apscheduler.executors.asyncio import AsyncIOExecutor
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger

from app.utils.logger import get_logger

logger = get_logger(__name__)


class SchedulerService:
    """Scheduler service using APScheduler"""

    def __init__(self):
        self.scheduler: Optional[AsyncIOScheduler] = None
        self.running = False

    def initialize(self):
        """Initialize scheduler"""
        try:
            jobstores = {
                'default': MemoryJobStore()
            }
            executors = {
                'default': AsyncIOExecutor()
            }
            job_defaults = {
                'coalesce': False,
                'max_instances': 1,
                'misfire_grace_time': 30
            }

            self.scheduler = AsyncIOScheduler(
                jobstores=jobstores,
                executors=executors,
                job_defaults=job_defaults,
                timezone='UTC'
            )

            logger.info("Scheduler initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize scheduler: {e}")
            raise

    def start(self):
        """Start scheduler"""
        if not self.scheduler:
            raise RuntimeError("Scheduler not initialized. Call initialize() first.")

        try:
            self.scheduler.start()
            self.running = True
            logger.info("Scheduler started")
        except Exception as e:
            logger.error(f"Failed to start scheduler: {e}")
            raise

    def stop(self):
        """Stop scheduler"""
        if self.scheduler:
            try:
                self.scheduler.shutdown(wait=True)
                self.running = False
                logger.info("Scheduler stopped")
            except Exception as e:
                logger.error(f"Failed to stop scheduler: {e}")

    def add_job(self, func, trigger, job_id: Optional[str] = None, **kwargs):
        """Add a job to the scheduler"""
        if not self.scheduler:
            raise RuntimeError("Scheduler not initialized. Call initialize() first.")

        try:
            self.scheduler.add_job(
                func,
                trigger=trigger,
                id=job_id,
                replace_existing=True,
                **kwargs
            )
            logger.info(f"Job added: {job_id or func.__name__}")
        except Exception as e:
            logger.error(f"Failed to add job: {e}")
            raise

    def add_interval_job(self, func, minutes: int, job_id: Optional[str] = None, **kwargs):
        """Add an interval job"""
        trigger = IntervalTrigger(minutes=minutes)
        self.add_job(func, trigger, job_id=job_id, **kwargs)

    def add_cron_job(self, func, hour: int = 0, minute: int = 0, job_id: Optional[str] = None, **kwargs):
        """Add a cron job"""
        trigger = CronTrigger(hour=hour, minute=minute)
        self.add_job(func, trigger, job_id=job_id, **kwargs)

    def remove_job(self, job_id: str):
        """Remove a job from the scheduler"""
        if not self.scheduler:
            raise RuntimeError("Scheduler not initialized. Call initialize() first.")

        try:
            self.scheduler.remove_job(job_id)
            logger.info(f"Job removed: {job_id}")
        except Exception as e:
            logger.error(f"Failed to remove job: {job_id}: {e}")

    def get_jobs(self):
        """Get all scheduled jobs"""
        if not self.scheduler:
            return []
        return self.scheduler.get_jobs()


# Global scheduler instance
scheduler = SchedulerService()

