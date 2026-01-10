"""Commands module initialization"""

from typing import Optional
from aiogram import Dispatcher, Bot

from app.commands.feed_commands import setup_feed_commands
from app.utils.logger import get_logger

logger = get_logger(__name__)


async def setup_commands(dp: Optional[Dispatcher], bot: Optional[Bot]):
    """Setup all bot commands"""
    if not dp:
        return

    try:
        # Setup feed commands
        await setup_feed_commands(dp, bot)
        logger.info("✅ Commands setup completed")
    except Exception as e:
        logger.error(f"Failed to setup commands: {e}")
        raise
