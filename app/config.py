"""Configuration management using pydantic-settings"""

import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, model_validator
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Bot Configuration
    bot_token: str

    # Server Configuration
    port: int = 8916
    host: str = "0.0.0.0"

    # Database Configuration
    database_url: str = "sqlite:///./data/development.db"  # Default for development

    # Redis Configuration
    redis_host: str = "redis"
    redis_port: int = 6379
    redis_password: Optional[str] = None
    redis_db: int = 0
    disable_redis: bool = False

    # Application Configuration
    environment: str = Field(default="production", validation_alias="ENVIRONMENT")
    log_level: str = Field(default="info", description="Log level: debug, info, warning, error")

    @model_validator(mode="before")
    @classmethod
    def map_node_env(cls, data: dict) -> dict:
        """Map NODE_ENV to ENVIRONMENT if ENVIRONMENT is not set"""
        if isinstance(data, dict):
            # If NODE_ENV is set but ENVIRONMENT is not, use NODE_ENV value
            if "NODE_ENV" in data and "ENVIRONMENT" not in data:
                data["ENVIRONMENT"] = data["NODE_ENV"]
        return data

    @model_validator(mode="after")
    def set_environment_defaults(self) -> "Settings":
        """Set environment-specific defaults for log level"""
        if self.environment == "production":
            # Production defaults
            if self.log_level == "debug":
                # Keep debug if explicitly set
                pass
            elif not os.getenv("LOG_LEVEL"):
                # Default to info in production if not explicitly set
                self.log_level = "info"

        return self

    # Access Control
    allowed_user_id: Optional[int] = None

    # Reddit API Configuration
    use_reddit_api: bool = False
    use_reddit_json_fallback: bool = False
    reddit_client_id: Optional[str] = None
    reddit_client_secret: Optional[str] = None
    reddit_username: Optional[str] = None
    reddit_password: Optional[str] = None

    # Feature Flags
    feature_instagram: bool = False

    # Resilience System Configuration
    telegram_resilience_enabled: bool = True
    telegram_max_retries: int = 10
    telegram_base_delay: int = 1000
    telegram_max_delay: int = 60000
    telegram_circuit_breaker_threshold: int = 5
    telegram_circuit_breaker_timeout: int = 300000

    # Message Queue Configuration
    message_queue_enabled: bool = True
    message_queue_max_size: int = 1000
    message_queue_batch_size: int = 20
    message_queue_processing_interval: int = 5000
    message_queue_message_ttl: int = 3600000

    # Health Monitoring Configuration
    health_check_interval: int = 30000
    alert_threshold_error_rate: float = 0.1
    alert_threshold_downtime_minutes: int = 15
    alert_threshold_queue_size: int = 500

    # Job Cleanup Configuration
    job_cleanup_enabled: bool = True
    job_cleanup_interval_minutes: int = 30
    job_cleanup_thorough_interval_hours: int = 2
    job_cleanup_orphaned_threshold: int = 10

    # Advanced Settings
    max_feeds_per_chat: int = 50
    cache_ttl_minutes: int = 20
    circuit_breaker_threshold: int = 3
    min_delay_ms: int = 200000


# Global settings instance
settings = Settings()
