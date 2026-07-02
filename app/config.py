from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AIBACKGROUND_", env_file=".env", extra="ignore")

    app_name: str = "AI Virtual Travel Check-in API"
    app_host: str = "0.0.0.0"
    app_port: int = 8010
    public_base_url: str | None = None
    public_base_url_file: Path = Field(default=BASE_DIR / "run" / "public_base_url.txt")

    comfy_base_url: str = "http://127.0.0.1:8190"
    prompt_template_path: Path = Field(default=Path("/home/ai/ComfyUI/user/default/workflows/ai_虚拟文旅_智能融合.json"))
    request_timeout_seconds: int = 60
    generation_timeout_seconds: int = 180
    poll_interval_seconds: float = 1.0

    template_dir: Path = Field(default=BASE_DIR / "storage" / "uploads")
    template_thumb_dir: Path = Field(default=BASE_DIR / "storage" / "template_thumbs")
    upload_dir: Path = Field(default=BASE_DIR / "storage" / "uploads")
    result_dir: Path = Field(default=BASE_DIR / "storage" / "results")
    allowed_image_types: tuple[str, ...] = (
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/jpg",
    )


settings = Settings()


def ensure_runtime_dirs() -> None:
    settings.prompt_template_path.parent.mkdir(parents=True, exist_ok=True)
    settings.template_dir.mkdir(parents=True, exist_ok=True)
    settings.template_thumb_dir.mkdir(parents=True, exist_ok=True)
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    settings.result_dir.mkdir(parents=True, exist_ok=True)
    settings.public_base_url_file.parent.mkdir(parents=True, exist_ok=True)