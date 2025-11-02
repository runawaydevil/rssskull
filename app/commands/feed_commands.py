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
