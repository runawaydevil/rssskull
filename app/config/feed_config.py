"""Feed configuration for different domains"""

from typing import Dict
from dataclasses import dataclass


@dataclass
class RateLimitConfig:
    """Rate limit configuration"""
    max_requests: int
    window_ms: int
    min_delay_ms: int
    adaptive_enabled: bool = False
    success_threshold: float = 0.9
    failure_penalty: float = 1.2
    success_reward: float = 0.95


@dataclass
class FeedDomainConfig:
    """Configuration for a specific domain"""
    rate_limit: RateLimitConfig
    check_interval_minutes: int
    description: str
    requires_user_agent: bool = False
    is_high_volume: bool = False


# Feed domain configurations
FEED_DOMAIN_CONFIGS: Dict[str, FeedDomainConfig] = {
    # Reddit - Optimized rate limiting
    "reddit.com": FeedDomainConfig(
        rate_limit=RateLimitConfig(
            max_requests=15,
            window_ms=600000,  # 10 minutes
            min_delay_ms=240000,  # 4 minutes
            adaptive_enabled=True,
        ),
        check_interval_minutes=5,
        description="Reddit feeds (optimized rate limiting)",
        requires_user_agent=True,
        is_high_volume=True,
    ),
    # YouTube
    "youtube.com": FeedDomainConfig(
        rate_limit=RateLimitConfig(
            max_requests=20,
            window_ms=60000,
            min_delay_ms=2000,
        ),
        check_interval_minutes=10,
        description="YouTube feeds",
        requires_user_agent=True,
    ),
    # GitHub
    "github.com": FeedDomainConfig(
        rate_limit=RateLimitConfig(
            max_requests=40,
            window_ms=60000,
            min_delay_ms=1000,
        ),
        check_interval_minutes=30,
        description="GitHub feeds",
    ),
    # Default configuration
    "default": FeedDomainConfig(
        rate_limit=RateLimitConfig(
            max_requests=30,
            window_ms=60000,
            min_delay_ms=1500,
        ),
        check_interval_minutes=10,
        description="Default feed configuration",
    ),
}


def get_feed_config(url: str) -> FeedDomainConfig:
    """Get feed configuration for a URL"""
    from urllib.parse import urlparse

    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower()

        # Try exact match
        if domain in FEED_DOMAIN_CONFIGS:
            return FEED_DOMAIN_CONFIGS[domain]

        # Try partial match (e.g., "www.reddit.com" -> "reddit.com")
        for config_domain, config in FEED_DOMAIN_CONFIGS.items():
            if config_domain in domain or domain in config_domain:
                return config

        # Return default
        return FEED_DOMAIN_CONFIGS["default"]

    except Exception:
        return FEED_DOMAIN_CONFIGS["default"]

