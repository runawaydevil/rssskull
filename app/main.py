"""FastAPI application with health check endpoints"""

import time
from typing import Dict, Any, Optional
from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.config import settings
from app.utils.logger import get_logger
from app.database import database
from app.utils.cache import cache_service
from app.bot import bot_service
from app.scheduler import scheduler

logger = get_logger(__name__)

# Global application instance
app = FastAPI(
    title="RSS Skull Bot",
    description="Modern RSS to Telegram Bot with Reddit support",
    version="0.5.0",
)

# Track application start time for uptime calculation
_app_start_time: Optional[float] = None


@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    global _app_start_time
    _app_start_time = time.time()
    logger.info("Starting RSS Skull Bot application")

    # Initialize database
    database.initialize()

    # Initialize Redis cache
    await cache_service.initialize()

    # Initialize scheduler
    scheduler.initialize()
    scheduler.start()

    # Add feed checker job (runs every 5 minutes)
    from app.jobs.feed_checker import check_feeds_job

    scheduler.add_interval_job(
        check_feeds_job,
        minutes=5,
        job_id="check_feeds",
    )
    logger.info("✅ Feed checker job scheduled")

    # Add blocking monitor job (runs every hour to check success rates)
    from app.jobs.blocking_monitor import check_blocking_stats_job, cleanup_blocking_stats_job

    scheduler.add_interval_job(
        check_blocking_stats_job,
        minutes=60,
        job_id="check_blocking_stats",
    )
    logger.info("✅ Blocking monitor job scheduled")

    # Add blocking stats cleanup job (runs daily at 3 AM UTC)
    scheduler.add_cron_job(
        cleanup_blocking_stats_job,
        hour=3,
        minute=0,
        job_id="cleanup_blocking_stats",
    )
    logger.info("✅ Blocking stats cleanup job scheduled")

    # Initialize bot
    await bot_service.initialize()
    # Start polling in background task
    import asyncio

    try:
        asyncio.create_task(bot_service.start_polling())
    except Exception as e:
        logger.error(f"Failed to start bot polling: {e}")

    # Start keep-alive service
    from app.resilience.keep_alive import keep_alive_service

    keep_alive_service.start()
    logger.info("✅ Keep-alive service started")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down RSS Skull Bot application")

    # Stop keep-alive service
    from app.resilience.keep_alive import keep_alive_service

    keep_alive_service.stop()

    # Stop bot
    await bot_service.close()

    # Stop scheduler
    scheduler.stop()

    # Close cache
    await cache_service.close()

    # Close database
    database.close()


@app.get("/health")
async def health_check() -> Dict[str, Any]:
    """Health check endpoint with minimal logging"""
    try:
        import psutil

        process = psutil.Process()
        memory_info = process.memory_info()
        memory_percent = process.memory_percent()
    except ImportError:
        try:
            import sys

            if sys.platform != "win32":
                import resource

                memory_info = resource.getrusage(resource.RUSAGE_SELF)
            else:
                # Windows doesn't have resource module
                memory_info = type("obj", (object,), {"rss": 0, "vms": 0})()
            memory_percent = 0.0
        except Exception:
            memory_info = type("obj", (object,), {"rss": 0, "vms": 0})()
            memory_percent = 0.0

    current_time = time.time()
    uptime = (current_time - _app_start_time) if _app_start_time else 0

    checks: Dict[str, Any] = {
        "status": "ok",
        "timestamp": current_time,
        "uptime": uptime,
        "memory": {
            "rss": getattr(memory_info, "rss", 0),
            "vms": getattr(memory_info, "vms", 0),
            "usage_percent": memory_percent,
            "usage_mb": round(getattr(memory_info, "rss", 0) / 1024 / 1024, 2),
        },
        "mode": "full-bot",
    }

    # Check database
    if database:
        try:
            checks["database"] = await database.health_check()
        except Exception as e:
            logger.error(f"Database health check failed: {e}")
            checks["database"] = False
    else:
        checks["database"] = False

    # Check Redis
    if not settings.disable_redis:
        try:
            checks["redis"] = await cache_service.ping()
        except Exception as e:
            logger.error(f"Redis health check failed: {e}")
            checks["redis"] = False
    else:
        checks["redis"] = settings.disable_redis

    # Check bot
    if bot_service:
        try:
            checks["bot"] = await bot_service.is_polling_active()
        except Exception as e:
            logger.error(f"Bot health check failed: {e}")
            checks["bot"] = False
    else:
        checks["bot"] = False

    # Check scheduler
    if scheduler:
        try:
            checks["scheduler"] = scheduler.running
        except Exception as e:
            logger.error(f"Scheduler health check failed: {e}")
            checks["scheduler"] = False
    else:
        checks["scheduler"] = False

    # Overall health
    critical_services = ["database", "bot"]
    is_healthy = all(checks.get(service, False) for service in critical_services)

    if not is_healthy:
        checks["status"] = "error"
        logger.warning("Health check failed", extra={"checks": checks})
        return JSONResponse(status_code=503, content=checks)

    # Success - log at DEBUG level only
    logger.debug("Health check passed")
    return checks


@app.get("/metrics")
async def metrics() -> Dict[str, Any]:
    """Metrics endpoint for Prometheus"""
    try:
        import psutil

        process = psutil.Process()
        memory_info = process.memory_info()
        cpu_percent = process.cpu_percent(interval=0.1)
    except ImportError:
        memory_info = type("obj", (object,), {"rss": 0, "vms": 0})()
        cpu_percent = 0.0

    current_time = time.time()
    uptime_seconds = (current_time - _app_start_time) if _app_start_time else 0

    metrics_data = {
        "memory_rss_bytes": memory_info.rss,
        "memory_vms_bytes": getattr(memory_info, "vms", 0),
        "cpu_percent": cpu_percent,
        "uptime_seconds": uptime_seconds,
    }

    # Add service-specific metrics
    if database:
        try:
            metrics_data.update(await database.get_metrics())
        except Exception as e:
            logger.error(f"Failed to get database metrics: {e}")

    if bot_service:
        try:
            metrics_data.update(await bot_service.get_metrics())
        except Exception as e:
            logger.error(f"Failed to get bot metrics: {e}")

    return metrics_data


@app.get("/stats")
async def stats() -> Dict[str, Any]:
    """Statistics endpoint"""
    stats_data = {
        "timestamp": time.time(),
        "version": "0.5.0",
        "environment": settings.environment,
    }

    # Add service-specific stats
    if database:
        try:
            stats_data.update(await database.get_stats())
        except Exception as e:
            logger.error(f"Failed to get database stats: {e}")

    if bot_service:
        try:
            stats_data.update(await bot_service.get_stats())
        except Exception as e:
            logger.error(f"Failed to get bot stats: {e}")

    return stats_data


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "RSS Skull Bot",
        "version": "0.5.0",
        "status": "running",
        "endpoints": {
            "health": "/health",
            "metrics": "/metrics",
            "stats": "/stats",
        },
    }
