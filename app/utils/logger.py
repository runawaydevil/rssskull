"""Structured logging setup using structlog"""

import logging
import sys
from typing import Any

import structlog

from app.config import settings


def configure_third_party_loggers(log_level: int):
    """Configure third-party library loggers to reduce verbosity"""
    
    # Uvicorn access logs - suppress in production unless error
    if settings.environment == "production" and log_level > logging.DEBUG:
        logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    else:
        logging.getLogger("uvicorn.access").setLevel(log_level)
    
    # Uvicorn error logs
    logging.getLogger("uvicorn.error").setLevel(logging.WARNING)
    
    # APScheduler - reduce verbosity
    if log_level > logging.DEBUG:
        logging.getLogger("apscheduler").setLevel(logging.WARNING)
    else:
        logging.getLogger("apscheduler").setLevel(log_level)
    
    # Aiohttp - reduce verbosity
    logging.getLogger("aiohttp").setLevel(logging.WARNING)


def configure_logging():
    """Configure structured logging with environment-aware settings"""
    
    # Determine log level
    log_level = getattr(logging, settings.log_level.upper(), logging.INFO)
    
    # Configure root logger
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=log_level,
    )
    
    # Configure third-party loggers
    configure_third_party_loggers(log_level)

    # Configure structlog
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer(),
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> Any:
    """Get a logger instance"""
    return structlog.get_logger(name)


# Configure logging on import
configure_logging()
