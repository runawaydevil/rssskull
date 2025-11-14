"""Feed management commands"""

from typing import Optional
from aiogram import Dispatcher, Bot
from aiogram.types import Message
from aiogram.filters import Command

from app.services.feed_service import feed_service
from app.utils.logger import get_logger

logger = get_logger(__name__)


async def setup_feed_commands(dp: Optional[Dispatcher], bot: Optional[Bot]):
    """Setup feed management commands"""
    if not dp:
        return

    # List feeds command
    @dp.message(Command("list"))
    async def list_feeds_command(message: Message):
        """List all feeds for the chat"""
        chat_id = str(message.chat.id)

        try:
            feeds = await feed_service.list_feeds(chat_id)

            if not feeds:
                await message.answer("📋 <b>No feeds configured.</b>\n\nUse /add to add a feed.")
                return

            feed_list = []
            for i, feed in enumerate(feeds, 1):
                status = "✅" if feed.enabled else "❌"
                feed_list.append(f"{i}. {status} <b>{feed.name}</b>\n🔗 {feed.url}")

            response = f"📋 <b>Your RSS Feeds ({len(feeds)}):</b>\n\n" + "\n\n".join(feed_list)
            await message.answer(response)
        except Exception as e:
            logger.error(f"Failed to list feeds for {chat_id}: {e}")
            await message.answer("❌ Failed to list feeds. Please try again.")

    # Add feed command
    @dp.message(Command("add"))
    async def add_feed_command(message: Message):
        """Add a new feed"""
        chat_id = str(message.chat.id)
        args = message.text.split()[1:] if message.text else []

        if len(args) < 2:
            await message.answer(
                "❌ <b>Invalid syntax.</b>\n\n"
                "Usage: /add &lt;name&gt; &lt;url&gt;\n\n"
                "Examples:\n"
                "• RSS: /add MyFeed https://example.com/rss\n"
                "• Reddit: /add Subreddit https://reddit.com/r/subreddit\n"
                "• YouTube: /add Channel youtube.com/@username\n"
                "• YouTube: /add Channel youtube.com/channel/UCxxxxx"
            )
            return

        name = args[0]
        url = " ".join(args[1:])  # URL might contain spaces

        try:
            result = await feed_service.add_feed(chat_id, name, url)

            if result.get("success"):
                await message.answer(
                    f"✅ <b>Feed added successfully!</b>\n\n" f"Name: <b>{name}</b>\n" f"URL: {url}"
                )
            else:
                error = result.get("error", "Unknown error")
                await message.answer(f"❌ <b>Failed to add feed:</b> {error}")
        except Exception as e:
            logger.error(f"Failed to add feed for {chat_id}: {e}")
            await message.answer("❌ Failed to add feed. Please try again.")

    # Remove feed command
    @dp.message(Command("remove"))
    async def remove_feed_command(message: Message):
        """Remove a feed"""
        chat_id = str(message.chat.id)
        args = message.text.split()[1:] if message.text else []

        if len(args) < 1:
            await message.answer(
                "❌ <b>Invalid syntax.</b>\n\n"
                "Usage: /remove &lt;name&gt;\n\n"
                "Example: /remove MyFeed"
            )
            return

        name = args[0]

        try:
            result = await feed_service.remove_feed(chat_id, name)

            if result.get("success"):
                await message.answer(f"✅ <b>Feed removed:</b> {name}")
            else:
                error = result.get("error", "Feed not found")
                await message.answer(f"❌ <b>Failed to remove feed:</b> {error}")
        except Exception as e:
            logger.error(f"Failed to remove feed for {chat_id}: {e}")
            await message.answer("❌ Failed to remove feed. Please try again.")

    # Enable feed command
    @dp.message(Command("enable"))
    async def enable_feed_command(message: Message):
        """Enable a feed"""
        chat_id = str(message.chat.id)
        args = message.text.split()[1:] if message.text else []

        if len(args) < 1:
            await message.answer(
                "❌ <b>Invalid syntax.</b>\n\n"
                "Usage: /enable &lt;name&gt;\n\n"
                "Example: /enable MyFeed"
            )
            return

        name = args[0]

        try:
            result = await feed_service.enable_feed(chat_id, name)

            if result.get("success"):
                await message.answer(f"✅ <b>Feed enabled:</b> {name}")
            else:
                error = result.get("error", "Feed not found")
                await message.answer(f"❌ <b>Failed to enable feed:</b> {error}")
        except Exception as e:
            logger.error(f"Failed to enable feed for {chat_id}: {e}")
            await message.answer("❌ Failed to enable feed. Please try again.")

    # Disable feed command
    @dp.message(Command("disable"))
    async def disable_feed_command(message: Message):
        """Disable a feed"""
        chat_id = str(message.chat.id)
        args = message.text.split()[1:] if message.text else []

        if len(args) < 1:
            await message.answer(
                "❌ <b>Invalid syntax.</b>\n\n"
                "Usage: /disable &lt;name&gt;\n\n"
                "Example: /disable MyFeed"
            )
            return

        name = args[0]

        try:
            result = await feed_service.disable_feed(chat_id, name)

            if result.get("success"):
                await message.answer(f"❌ <b>Feed disabled:</b> {name}")
            else:
                error = result.get("error", "Feed not found")
                await message.answer(f"❌ <b>Failed to disable feed:</b> {error}")
        except Exception as e:
            logger.error(f"Failed to disable feed for {chat_id}: {e}")
            await message.answer("❌ Failed to disable feed. Please try again.")


    # Block stats command
    @dp.message(Command("blockstats"))
    async def blockstats_command(message: Message):
        """Show blocking statistics"""
        try:
            from app.database import database
            from app.services.blocking_stats_service import BlockingStatsService

            response = "📊 <b>Anti-Blocking Statistics</b>\n\n"

            # Get database statistics
            with database.get_session() as session:
                stats_service = BlockingStatsService(session)
                summary = stats_service.get_summary()
                all_stats = stats_service.get_all_stats()

                # Overall summary
                if summary["total_requests"] > 0:
                    response += "<b>📈 Overall Performance:</b>\n"
                    response += f"• Total Requests: {summary['total_requests']}\n"
                    response += f"• Success Rate: {summary['overall_success_rate']:.1f}%\n"
                    response += f"• Blocked (403): {summary['blocked_requests']}\n"
                    response += f"• Rate Limited (429): {summary['rate_limited_requests']}\n"
                    response += f"• Domains Tracked: {summary['total_domains']}\n\n"

                # Per-domain statistics (top 10 by request count)
                if all_stats:
                    sorted_stats = sorted(all_stats, key=lambda x: x.total_requests, reverse=True)
                    response += "<b>🌐 Top Domains:</b>\n"
                    for stat in sorted_stats[:10]:
                        success_rate = (
                            (stat.successful_requests / stat.total_requests * 100)
                            if stat.total_requests > 0
                            else 0.0
                        )
                        status_icon = "✅" if success_rate >= 80 else "⚠️" if success_rate >= 50 else "❌"
                        response += f"{status_icon} <b>{stat.domain}</b>\n"
                        response += f"  Success: {success_rate:.1f}% ({stat.successful_requests}/{stat.total_requests})\n"
                        if stat.blocked_requests > 0:
                            response += f"  Blocked: {stat.blocked_requests}\n"
                        if stat.rate_limited_requests > 0:
                            response += f"  Rate Limited: {stat.rate_limited_requests}\n"
                        response += f"  Delay: {stat.current_delay:.1f}s\n"
                        if stat.circuit_breaker_state != "closed":
                            cb_icon = "🔴" if stat.circuit_breaker_state == "open" else "🟡"
                            response += f"  {cb_icon} Circuit: {stat.circuit_breaker_state}\n"
                    response += "\n"

                # Circuit breaker summary
                if summary["circuit_breaker_open"] > 0 or summary["circuit_breaker_half_open"] > 0:
                    response += "<b>⚡ Circuit Breakers:</b>\n"
                    if summary["circuit_breaker_open"] > 0:
                        response += f"🔴 Open: {summary['circuit_breaker_open']}\n"
                    if summary["circuit_breaker_half_open"] > 0:
                        response += f"🟡 Testing: {summary['circuit_breaker_half_open']}\n"
                    response += "\n"

                # Low success rate domains
                low_success_domains = stats_service.get_domains_with_low_success_rate(threshold=50.0)
                if low_success_domains:
                    response += "<b>⚠️ Low Success Rate Domains:</b>\n"
                    for stat in low_success_domains[:5]:
                        success_rate = (
                            (stat.successful_requests / stat.total_requests * 100)
                            if stat.total_requests > 0
                            else 0.0
                        )
                        response += f"• {stat.domain}: {success_rate:.1f}%\n"
                    response += "\n"

                if summary["total_requests"] == 0:
                    response += "ℹ️ No blocking data yet.\n"

            await message.answer(response)
        except Exception as e:
            logger.error(f"Failed to get block stats: {e}")
            await message.answer("❌ Failed to get statistics. Please try again.")
