"""Reddit fallback chain for accessing blocked feeds"""

import time
from typing import Dict
from app.utils.logger import get_logger

logger = get_logger(__name__)


class RedditFallbackChain:
    """Implements fallback chain for Reddit access"""

    def __init__(self):
        self.successful_methods: Dict[str, tuple] = {}  # subreddit -> (method, timestamp)
        self.method_cache_ttl = 86400  # 24 hours

    async def fetch_reddit_feed(self, subreddit: str, rss_service) -> dict:
        """Fetch Reddit feed using fallback chain"""

        # Try cached successful method first
        if subreddit in self.successful_methods:
            method, timestamp = self.successful_methods[subreddit]
            if time.time() - timestamp < self.method_cache_ttl:
                logger.debug(f"Using cached method '{method}' for r/{subreddit}")
                result = await self._try_method(method, subreddit, rss_service)
                if result["success"]:
                    return result
                else:
                    # Cached method failed, remove from cache
                    del self.successful_methods[subreddit]

        # Try all methods in order
        methods = [
            ("rss", self._fetch_rss),
            ("json", self._fetch_json),
            ("old_rss", self._fetch_old_rss),
        ]

        for method_name, method_func in methods:
            logger.debug(f"Trying method '{method_name}' for r/{subreddit}")
            result = await method_func(subreddit, rss_service)
            if result["success"]:
                self.successful_methods[subreddit] = (method_name, time.time())
                logger.info(f"✅ Reddit access successful via {method_name}: r/{subreddit}")
                return result
            else:
                logger.debug(
                    f"Method '{method_name}' failed for r/{subreddit}: {result.get('error')}"
                )

        # All methods failed
        logger.error(f"❌ All Reddit access methods failed for r/{subreddit}")
        return {"success": False, "error": "All methods failed"}

    async def _try_method(self, method: str, subreddit: str, rss_service) -> dict:
        """Try specific method"""
        if method == "rss":
            return await self._fetch_rss(subreddit, rss_service)
        elif method == "json":
            return await self._fetch_json(subreddit, rss_service)
        elif method == "old_rss":
            return await self._fetch_old_rss(subreddit, rss_service)
        return {"success": False, "error": "Unknown method"}

    async def _fetch_rss(self, subreddit: str, rss_service) -> dict:
        """Try standard RSS endpoint"""
        url = f"https://www.reddit.com/r/{subreddit}/.rss"
        return await rss_service._fetch_feed_from_url(url)

    async def _fetch_json(self, subreddit: str, rss_service) -> dict:
        """Try JSON API endpoint"""
        url = f"https://www.reddit.com/r/{subreddit}.json"
        # For now, just try the URL - full JSON conversion would be implemented here
        # This is a placeholder that attempts the JSON endpoint
        return await rss_service._fetch_feed_from_url(url)

    async def _fetch_old_rss(self, subreddit: str, rss_service) -> dict:
        """Try old.reddit.com RSS endpoint"""
        url = f"https://old.reddit.com/r/{subreddit}/.rss"
        return await rss_service._fetch_feed_from_url(url)


# Global instance
reddit_fallback = RedditFallbackChain()
