"""Feed checker job using APScheduler"""

from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from sqlmodel import select

from app.database import database
from app.models.feed import Feed
from app.services.rss_service import rss_service
from app.services.feed_service import feed_service
from app.bot import bot_service
from app.utils.logger import get_logger

logger = get_logger(__name__)


class FeedChecker:
    """Feed checker that processes feeds and sends notifications"""

    async def check_feed(self, feed: Feed) -> Dict[str, Any]:
        """Check a single feed for new items"""
        try:
            logger.info(f"🔍 Checking feed: {feed.name} ({feed.url})")

            # Get last item ID and date
            last_item_id = feed.last_item_id
            # Use last_notified_at if available, otherwise use last_seen_at
            last_item_date = feed.last_notified_at
            if not last_item_date:
                last_item_date = feed.last_seen_at

            # Log feed state before checking
            logger.info(
                f"📊 Feed state for {feed.name}: "
                f"lastItemId={last_item_id or 'None'}, "
                f"lastNotifiedAt={last_item_date.isoformat() if last_item_date else 'None'}, "
                f"lastCheck={feed.last_check.isoformat() if feed.last_check else 'Never'}"
            )

            # Log first time processing
            if not last_item_id:
                logger.info(f"📌 First time checking feed {feed.name} - will not notify old items, setting baseline")

            # Get new items from RSS service
            logger.info(f"📡 Fetching new items from RSS service for {feed.name}...")
            result = await rss_service.get_new_items(
                feed.rss_url or feed.url,
                last_item_id=last_item_id,
                last_item_date=last_item_date,
            )

            new_items = result.get("items", [])
            total_items_count = result.get("totalItemsCount", 0)
            first_item_id = result.get("firstItemId")
            
            logger.info(
                f"📥 RSS service result for {feed.name}: "
                f"{len(new_items)} new items found, "
                f"{total_items_count} total items in feed, "
                f"firstItemId={first_item_id or 'None'}"
            )

            # Determine new last item ID
            new_last_item_id: Optional[str] = None
            last_notified = None

            if result.get("lastItemIdToSave"):
                # First time processing
                new_last_item_id = result["lastItemIdToSave"]
                
                # Use the date of the most recent post in the feed as baseline, not current time
                # This ensures we don't notify posts that existed before adding the feed,
                # but we WILL notify posts created between adding the feed and first check
                feed_data = await rss_service.fetch_feed(feed.rss_url or feed.url)
                if feed_data.get("success") and feed_data.get("feed") and feed_data["feed"].items:
                    # Get the most recent item's date as baseline
                    most_recent_item = feed_data["feed"].items[0]  # Items are already sorted by date descending
                    if most_recent_item.pub_date:
                        last_notified = most_recent_item.pub_date
                        logger.info(
                            f"🔍 First time processing {feed.name} - setting baseline to most recent post date: "
                            f"{last_notified.isoformat()} (from post {most_recent_item.id}). "
                            f"This ensures we only notify posts created AFTER this point."
                        )
                    else:
                        # Fallback to current time if no date
                        last_notified = datetime.utcnow()
                        logger.info(f"🔍 First time processing {feed.name} - post has no date, using current time as baseline: {last_notified.isoformat()}")
                else:
                    # Fallback to current time if feed fetch fails
                    last_notified = datetime.utcnow()
                    logger.info(f"🔍 First time processing {feed.name} - could not fetch feed, using current time as baseline: {last_notified.isoformat()}")
            elif new_items:
                # Has new items - use the most recent new item (already sorted by date descending)
                most_recent_item = new_items[0]
                new_last_item_id = most_recent_item.id
                logger.info(f"✅ New items found for {feed.name} - updating lastItemId from {last_item_id} to {new_last_item_id}")
                
                # Update last_notified_at with the most recent item's date
                # This ensures we only notify posts created after this point
                if most_recent_item.pub_date:
                    last_notified = most_recent_item.pub_date
                    logger.info(
                        f"📅 Updating lastNotifiedAt to {last_notified.isoformat()} for {feed.name} "
                        f"(from most recent new post: {most_recent_item.title[:50]})"
                    )
                else:
                    # Fallback: use current time if item has no date (shouldn't happen)
                    logger.warning(f"⚠️ New item {new_last_item_id} has no pub_date - using current time as lastNotifiedAt")
                    last_notified = datetime.utcnow()
            elif first_item_id:
                # No new items but feed has items - update to current first item
                new_last_item_id = first_item_id
                logger.info(f"ℹ️ No new items for {feed.name} - updating lastItemId to current first item: {first_item_id}")
            else:
                # Feed is empty or firstItemId is undefined - keep existing lastItemId
                new_last_item_id = last_item_id
                logger.info(f"ℹ️ No new items for {feed.name} - keeping existing lastItemId: {last_item_id}")

            await feed_service.update_feed_last_check(
                feed.id,
                last_item_id=new_last_item_id,
                last_notified_at=last_notified,
            )

            # Send notifications for new items
            notifications_sent = 0
            if new_items:
                logger.info(f"📤 Processing {len(new_items)} new item(s) for notifications to {feed.name}...")
                for item in new_items:
                    # Check max age
                    if feed.max_age_minutes:
                        if item.pub_date:
                            age_minutes = (datetime.utcnow() - item.pub_date).total_seconds() / 60
                            if age_minutes > feed.max_age_minutes:
                                logger.debug(f"Skipping item {item.id} - too old ({age_minutes:.1f} minutes)")
                                continue

                    # Send notification
                    message_sent = False
                    try:
                        # Try with HTML first
                        message = self._format_message(item, feed.name, use_html=True)
                        result = await bot_service.send_message(
                            chat_id=int(feed.chat_id),
                            text=message,
                            parse_mode="HTML",
                        )
                        
                        # Check if message was actually sent (result is not None)
                        if result is not None:
                            notifications_sent += 1
                            message_sent = True
                            logger.info(f"✅ Notification sent for {feed.name}: {item.title}")
                        else:
                            # send_message returned None, meaning it failed
                            logger.warning(f"⚠️ Message to {feed.name} returned None (failed silently), trying fallback...")
                            raise Exception("Message returned None")
                            
                    except Exception as e:
                        # If HTML fails, try plain text fallback
                        logger.warning(f"⚠️ Failed to send HTML message for {feed.name}: {e}. Trying plain text fallback...")
                        try:
                            message = self._format_message(item, feed.name, use_html=False)
                            result = await bot_service.send_message(
                                chat_id=int(feed.chat_id),
                                text=message,
                                parse_mode=None,  # Plain text
                            )
                            
                            if result is not None:
                                notifications_sent += 1
                                message_sent = True
                                logger.info(f"✅ Notification sent (plain text) for {feed.name}: {item.title}")
                            else:
                                logger.error(f"❌ Failed to send plain text message for {feed.name}: message returned None")
                        except Exception as e2:
                            logger.error(f"❌ Failed to send notification (both HTML and plain text) for {feed.name}: {e2}")
                    
                    if not message_sent:
                        logger.error(f"❌ Notification NOT sent for {feed.name}: {item.title} (failed after all retries)")

            logger.info(
                f"Feed check completed: {feed.name} - {len(new_items)} new items, "
                f"{notifications_sent} notifications sent"
            )

            return {
                "success": True,
                "new_items_count": len(new_items),
                "notifications_sent": notifications_sent,
                "total_items_count": total_items_count,
            }

        except Exception as e:
            logger.error(f"Failed to check feed {feed.name}: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e),
            }

    def _format_message(self, item, feed_name: str, use_html: bool = True) -> str:
        """Format RSS item as Telegram message"""
        from app.utils.html_sanitizer import sanitize_html_for_telegram, strip_html_tags
        
        title = item.title or "No title"
        link = item.link or ""
        description = item.description or ""
        pub_date = ""

        if item.pub_date:
            pub_date = item.pub_date.strftime("%Y-%m-%d %H:%M:%S UTC")

        if use_html:
            # Sanitize HTML for Telegram
            title = sanitize_html_for_telegram(title)
            description = sanitize_html_for_telegram(description) if description else ""
            
            message = f"📰 <b>{sanitize_html_for_telegram(feed_name)}</b>\n\n"
            message += f"<b>{title}</b>\n\n"

            if description:
                # Limit description length
                max_desc_length = 500
                if len(description) > max_desc_length:
                    description = description[:max_desc_length] + "..."
                message += f"{description}\n\n"

            if pub_date:
                message += f"🕐 {pub_date}\n\n"

            if link:
                # Sanitize link URL
                sanitized_link = sanitize_html_for_telegram(link)
                message += f"🔗 <a href='{sanitized_link}'>Read more</a>"
        else:
            # Plain text fallback
            title = strip_html_tags(title)
            description = strip_html_tags(description) if description else ""
            feed_name = strip_html_tags(feed_name)
            
            message = f"📰 {feed_name}\n\n"
            message += f"{title}\n\n"
            
            if description:
                max_desc_length = 500
                if len(description) > max_desc_length:
                    description = description[:max_desc_length] + "..."
                message += f"{description}\n\n"
            
            if pub_date:
                message += f"🕐 {pub_date}\n\n"
            
            if link:
                message += f"🔗 {link}"

        return message

    async def check_all_feeds(self):
        """Check all enabled feeds"""
        try:
            logger.info("🔍 Fetching enabled feeds from database...")
            feeds = await feed_service.get_all_enabled_feeds()
            logger.info(f"📊 Found {len(feeds)} enabled feed(s) in database")

            if not feeds:
                logger.info("ℹ️ No enabled feeds to check - job completed")
                return

            logger.info(f"🔄 Checking {len(feeds)} enabled feeds...")

            # Track counts
            checked_count = 0
            skipped_count = 0

            # Process feeds sequentially to avoid rate limiting
            for feed in feeds:
                try:
                    # Check if feed should be checked based on interval
                    if feed.last_check:
                        time_since_last_check = (datetime.utcnow() - feed.last_check).total_seconds() / 60
                        if time_since_last_check < feed.check_interval_minutes:
                            logger.info(
                                f"⏭️ Skipping feed {feed.name} - checked {time_since_last_check:.1f} minutes ago "
                                f"(interval: {feed.check_interval_minutes} minutes)"
                            )
                            skipped_count += 1
                            continue
                        else:
                            logger.info(
                                f"✅ Feed {feed.name} interval passed ({time_since_last_check:.1f} >= {feed.check_interval_minutes} minutes) - will check now"
                            )
                    else:
                        logger.info(f"✅ Feed {feed.name} has never been checked - will check now")

                    checked_count += 1
                    await self.check_feed(feed)

                    # Small delay between feeds to avoid overwhelming the system
                    import asyncio
                    await asyncio.sleep(1)

                except Exception as e:
                    logger.error(f"Error checking feed {feed.name}: {e}")
                    continue

            logger.info(f"✅ Completed checking feeds - {checked_count} checked, {skipped_count} skipped (total: {len(feeds)})")

        except Exception as e:
            logger.error(f"❌ Failed to check all feeds: {e}", exc_info=True)


# Global feed checker instance
feed_checker = FeedChecker()


async def check_feeds_job():
    """APScheduler job function to check all feeds"""
    logger.info("🔄 Feed checker job started")
    await feed_checker.check_all_feeds()
    logger.info("✅ Feed checker job completed")

