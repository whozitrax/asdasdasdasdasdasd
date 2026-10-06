from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent


@dataclass(frozen=True)
class Settings:
    bot_token: str
    admin_id: int
    database_path: Path
    offer_lifetime_hours: int = 6
    expiry_poll_seconds: int = 30
    public_base_url: str = ""
    mini_app_short_name: str = "giftrelayer"
    web_host: str = "0.0.0.0"
    web_port: int = 3000
    init_data_max_age_seconds: int = 3600


def get_settings() -> Settings:
    token = (os.getenv("BOT_TOKEN") or "").strip()
    if not token:
        raise RuntimeError("BOT_TOKEN is empty. Copy .env.example to .env and set BOT_TOKEN.")

    admin_raw = (os.getenv("ADMIN_ID") or "8082942213").strip()
    try:
        admin_id = int(admin_raw)
    except ValueError as exc:
        raise RuntimeError("ADMIN_ID must be an integer") from exc

    db_raw = (os.getenv("DATABASE_PATH") or str(BASE_DIR / "data" / "giftrelayer.sqlite3")).strip()
    db_path = Path(db_raw)
    if not db_path.is_absolute():
        db_path = BASE_DIR / db_path
    db_path.parent.mkdir(parents=True, exist_ok=True)

    public_base_url = (os.getenv("PUBLIC_BASE_URL") or "").strip().rstrip("/")
    mini_app_short_name = (os.getenv("MINI_APP_SHORT_NAME") or "giftrelayer").strip().strip("/")

    return Settings(
        bot_token=token,
        admin_id=admin_id,
        database_path=db_path,
        offer_lifetime_hours=int(os.getenv("OFFER_LIFETIME_HOURS", "6")),
        expiry_poll_seconds=int(os.getenv("EXPIRY_POLL_SECONDS", "30")),
        public_base_url=public_base_url,
        mini_app_short_name=mini_app_short_name,
        web_host=(os.getenv("WEB_HOST") or "0.0.0.0").strip(),
        web_port=int(os.getenv("WEB_PORT", "3000")),
        init_data_max_age_seconds=int(os.getenv("INIT_DATA_MAX_AGE_SECONDS", "3600")),
    )
