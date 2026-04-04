from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "mvp_local.db"


@dataclass(frozen=True)
class AppConfig:
    app_name: str = "Learning State Local Daemon"
    database_path: Path = DB_PATH
    default_user_local_id: str = "local-demo-user"
    default_settings: dict[str, int] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.default_settings is None:
            object.__setattr__(
                self,
                "default_settings",
                {
                    "raw_event_retention_days": 30,
                    "max_session_seconds": 7200,
                    "idle_split_seconds": 1200,
                    "snapshot_window_seconds": 30,
                    "state_pull_interval_seconds": 3,
                },
            )


config = AppConfig()
