"""Bot service using aiogram"""

from typing import Optional, Dict, Any
import asyncio
from aiogram import Bot, Dispatcher
from aiogram.filters import Command, CommandStart
from aiogram.types import Message, BotCommand
from aiogram.enums import ParseMode
from aiogram.client.default import DefaultBotProperties
from aiogram.client.session.aiohttp import AiohttpSession

from app.config import settings
from app.utils.logger import get_logger
from app.database import database
from app.commands import setup_commands

logger = get_logger(__name__)


class BotService:
    """Bot service for Telegram bot using aiogram"""

    def __init__(self):
        self.bot: Optional[Bot] = None
        self.dp: Optional[Dispatcher] = None
        self.bot_username: Optional[str] = None
        self.bot_id: Optional[int] = None
        self.is_polling = False
        self._polling_task = None

    async def initialize(self):
        """Initialize bot"""
        try:
            logger.info("🔧 Initializing bot service...")

            # Create bot instance
            session = AiohttpSession()
            self.bot = Bot(
                token=settings.bot_token,
                session=session,
                default=DefaultBotProperties(parse_mode=ParseMode.HTML),
            )

            # Create dispatcher
            self.dp = Dispatcher()

            # Get bot info
            me = await self.bot.get_me()
            self.bot_username = me.username
            self.bot_id = me.id

            logger.info(f"✅ Bot initialized: @{self.bot_username} ({me.first_name})")

            # Setup middleware
            self._setup_middleware()

            # Setup commands
            await self._setup_commands()

            # Setup command handlers
            self._setup_handlers()

            # Register bot commands
            await self._set_bot_commands()

            logger.info("✅ Bot service initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize bot: {e}")
            raise

    def _setup_middleware(self):
        """Setup bot middleware"""
        if not self.dp:
            return

        # Logging middleware
        @self.dp.message.middleware()
        async def logging_middleware(handler, event: Message, data: Dict[str, Any]):
            user = event.from_user.first_name if event.from_user else "Unknown"
            chat_type = event.chat.type if event.chat else "unknown"
            text = event.text or ""
            logger.info(
                f"📨 Message received: '{text}' from {user} in {chat_type} chat",
                extra={
                    "chatId": event.chat.id if event.chat else None,
                    "userId": event.from_user.id if event.from_user else None,
                },
            )
            return await handler(event, data)

    def _setup_handlers(self):
        """Setup message handlers"""
        if not self.dp:
            return

        # Start command
        @self.dp.message(CommandStart())
        async def start_command(message: Message):
            chat_id = message.chat.id
            user_id = message.from_user.id if message.from_user else None

            # Check if user is allowed
            if settings.allowed_user_id and user_id != settings.allowed_user_id:
                await message.answer("❌ You are not authorized to use this bot.")
                return

            welcome_text = """
🤖 <b>RSS Skull Bot</b>

Welcome! I'm here to help you monitor RSS feeds and send notifications to Telegram.

<b>Available Commands:</b>
/start - Start the bot
/help - Show help message
/list - List your feeds
/add - Add a new feed (RSS, Reddit, YouTube)
/remove - Remove a feed

Type /help for more information.
"""
            await message.answer(welcome_text)

        # Help command
        @self.dp.message(Command("help"))
        async def help_command(message: Message):
            help_text = """
📖 <b>RSS Skull Bot - Help</b>

<b>Feed Management:</b>
/add &lt;name&gt; &lt;url&gt; - Add a new feed
  - RSS: https://example.com/rss
  - Reddit: https://reddit.com/r/subreddit
  - YouTube: youtube.com/@username or youtube.com/channel/UCxxxxx
/remove &lt;name&gt; - Remove a feed
/list - List all your feeds
/enable &lt;name&gt; - Enable a feed
/disable &lt;name&gt; - Disable a feed

<b>Information:</b>
/stats - Show statistics
/ping - Check if bot is alive

<b>Examples:</b>
/add MyFeed https://example.com/rss
/remove MyFeed

For more information, visit the repository.
"""
            await message.answer(help_text)

        # Ping command
        @self.dp.message(Command("ping"))
        async def ping_command(message: Message):
            await message.answer("🏓 Pong! Bot is alive and running.")

    async def _setup_commands(self):
        """Setup command handlers from commands module"""
        try:
            await setup_commands(self.dp, self.bot)
        except Exception as e:
            logger.error(f"Failed to setup commands: {e}")

    async def _set_bot_commands(self):
        """Register bot commands with Telegram"""
        if not self.bot:
            return

        commands = [
            BotCommand(command="start", description="Start the bot"),
            BotCommand(command="help", description="Show help message"),
            BotCommand(command="list", description="List your feeds"),
            BotCommand(command="add", description="Add a new feed"),
            BotCommand(command="remove", description="Remove a feed"),
            BotCommand(command="enable", description="Enable a feed"),
            BotCommand(command="disable", description="Disable a feed"),
            BotCommand(command="stats", description="Show statistics"),
            BotCommand(command="ping", description="Check if bot is alive"),
        ]

        try:
            await self.bot.set_my_commands(commands)
            logger.info("✅ Bot commands registered")
        except Exception as e:
            logger.error(f"Failed to register bot commands: {e}")

    async def start_polling(self):
        """Start bot polling"""
        if not self.bot or not self.dp:
            raise RuntimeError("Bot not initialized. Call initialize() first.")

        if self.is_polling:
            logger.warn("Bot is already polling")
            return

        try:
            logger.info("🔧 Starting bot polling...")

            # Clear webhook first
            try:
                await self.bot.delete_webhook(drop_pending_updates=True)
                logger.info("✅ Webhook cleared")
            except Exception as e:
                logger.warning(f"Failed to clear webhook (may not be set): {e}")

            # Start polling (this is a blocking call, but we run it in a task)
            self.is_polling = True
            # Store the task so we can cancel it later
            import asyncio
            self._polling_task = asyncio.create_task(self.dp.start_polling(self.bot))
            logger.info("✅ Bot polling started")
        except Exception as e:
            self.is_polling = False
            logger.error(f"Failed to start polling: {e}")
            raise

    async def stop_polling(self):
        """Stop bot polling"""
        if not self.is_polling:
            return

        try:
            logger.info("🛑 Stopping bot polling...")
            if self._polling_task:
                self._polling_task.cancel()
                try:
                    await self._polling_task
                except asyncio.CancelledError:
                    pass
            if self.dp:
                await self.dp.stop_polling()
            self.is_polling = False
            self._polling_task = None
            logger.info("✅ Bot polling stopped")
        except Exception as e:
            logger.error(f"Failed to stop polling: {e}")
            self.is_polling = False

    async def is_polling_active(self) -> bool:
        """Check if bot polling is active"""
        if not self.bot:
            return False

        try:
            # Try to get bot info to verify connection
            await self.bot.get_me()
            return self.is_polling
        except Exception:
            return False

    async def restart_polling_if_needed(self) -> bool:
        """Restart polling if it's not active"""
        try:
            if not await self.is_polling_active():
                logger.warn("Bot polling is not active - restarting...")
                await self.stop_polling()
                await self.start_polling()
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to restart polling: {e}")
            return False

    async def send_message(self, chat_id: int, text: str, **kwargs) -> Optional[Message]:
        """Send a message"""
        if not self.bot:
            raise RuntimeError("Bot not initialized")

        try:
            return await self.bot.send_message(chat_id=chat_id, text=text, **kwargs)
        except Exception as e:
            logger.error(f"Failed to send message to {chat_id}: {e}")
            return None

    async def get_metrics(self) -> Dict[str, Any]:
        """Get bot metrics"""
        return {
            "bot_username": self.bot_username,
            "bot_id": self.bot_id,
            "is_polling": self.is_polling,
        }

    async def get_stats(self) -> Dict[str, Any]:
        """Get bot statistics"""
        # Get feed stats from database
        stats = {
            "bot": {
                "username": self.bot_username,
                "id": self.bot_id,
                "polling": self.is_polling,
            }
        }

        if database:
            db_stats = await database.get_stats()
            stats.update(db_stats)

        return stats

    async def close(self):
        """Close bot connections"""
        try:
            await self.stop_polling()
            if self.bot:
                session = self.bot.session
                if session:
                    await session.close()
            logger.info("✅ Bot service closed")
        except Exception as e:
            logger.error(f"Error closing bot service: {e}")


# Global bot instance
bot_service = BotService()

