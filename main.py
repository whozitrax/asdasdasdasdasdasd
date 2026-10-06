from __future__ import annotations

import asyncio
import logging

from telegram import Update
from telegram.ext import (
    Application,
    ApplicationBuilder,
    BusinessConnectionHandler,
    BusinessMessagesDeletedHandler,
    CallbackQueryHandler,
    ChosenInlineResultHandler,
    CommandHandler,
    InlineQueryHandler,
    MessageHandler,
    filters,
)

from config import get_settings
from database import Database, Offer, utcnow
from handlers.admin import admin_callback
from handlers.business import (
    business_connection,
    business_message,
    deleted_business_messages,
    edited_business_message,
)
from handlers.callbacks import offer_callback
from handlers.commands import buy_command, help_command, start
from handlers.inline import chosen_inline_result, inline_query
from services.offers import build_terminal_text
from utils.logging_config import configure_logging
from utils.telegram_io import edit_html
from webapp import start_web_server

logger = logging.getLogger(__name__)


async def _edit_expired(application: Application, offer: Offer) -> None:
    try:
        if offer.inline_message_id:
            await edit_html(
                application.bot,
                inline_message_id=offer.inline_message_id,
                text=build_terminal_text(offer, "EXPIRED"),
                reply_markup=None,
            )
        elif offer.chat_id is not None and offer.offer_message_id is not None:
            await edit_html(
                application.bot,
                chat_id=offer.chat_id,
                message_id=offer.offer_message_id,
                business_connection_id=offer.business_connection_id,
                text=build_terminal_text(offer, "EXPIRED"),
                reply_markup=None,
            )
    except Exception as exc:
        logger.warning("Could not render expired offer offer_id=%s: %s", offer.id, exc)


async def expiration_loop(application: Application) -> None:
    db: Database = application.bot_data["db"]
    settings = application.bot_data["settings"]
    try:
        while True:
            expired = await db.expire_due_offers(utcnow())
            for offer in expired:
                logger.info("OFFER EXPIRED offer_id=%s", offer.id)
                await _edit_expired(application, offer)
            await asyncio.sleep(settings.expiry_poll_seconds)
    except asyncio.CancelledError:
        raise


async def post_init(application: Application) -> None:
    db: Database = application.bot_data["db"]
    await db.initialize()
    logger.info("DATABASE INITIALIZED")
    me = await application.bot.get_me()
    logger.info(
        "BOT STARTED @%s | inline=%s | business=%s",
        me.username,
        me.supports_inline_queries,
        me.can_connect_to_business,
    )
    application.bot_data["expiry_task"] = application.create_task(
        expiration_loop(application),
        name="giftrelayer-expiration-loop",
    )
    application.bot_data["web_runner"] = await start_web_server(
        bot=application.bot,
        db=db,
        settings=application.bot_data["settings"],
    )


async def post_shutdown(application: Application) -> None:
    runner = application.bot_data.get("web_runner")
    if runner:
        await runner.cleanup()
    task = application.bot_data.get("expiry_task")
    if task and not task.done():
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


async def error_handler(update: object, context) -> None:
    logger.exception("TELEGRAM API ERROR while processing update=%r", update, exc_info=context.error)


def build_application() -> Application:
    settings = get_settings()
    db = Database(settings.database_path)

    application = (
        ApplicationBuilder()
        .token(settings.bot_token)
        .post_init(post_init)
        .post_shutdown(post_shutdown)
        .build()
    )
    application.bot_data["settings"] = settings
    application.bot_data["db"] = db

    # =========================
    # NORMAL BOT COMMANDS
    # =========================
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("buy", buy_command))

    # =========================
    # TELEGRAM BUSINESS
    # =========================
    application.add_handler(BusinessConnectionHandler(business_connection))
    application.add_handler(
        MessageHandler(filters.UpdateType.BUSINESS_MESSAGE & filters.TEXT, business_message)
    )
    application.add_handler(
        MessageHandler(filters.UpdateType.EDITED_BUSINESS_MESSAGE & filters.TEXT, edited_business_message)
    )
    application.add_handler(BusinessMessagesDeletedHandler(deleted_business_messages))

    # =========================
    # INLINE MODE
    # =========================
    application.add_handler(InlineQueryHandler(inline_query))
    application.add_handler(ChosenInlineResultHandler(chosen_inline_result))

    # =========================
    # CALLBACKS
    # =========================
    application.add_handler(CallbackQueryHandler(admin_callback, pattern=r"^(ac|ar):"), group=0)
    application.add_handler(CallbackQueryHandler(offer_callback, pattern=r"^od:"), group=0)

    application.add_error_handler(error_handler)
    return application


def main() -> None:
    configure_logging()
    application = build_application()
    application.run_polling(allowed_updates=Update.ALL_TYPES, drop_pending_updates=False)


if __name__ == "__main__":
    main()
