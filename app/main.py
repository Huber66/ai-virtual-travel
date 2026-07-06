import html
import ipaddress
import json
import logging
import socket
import subprocess
import time
import uuid
from contextlib import asynccontextmanager
from io import BytesIO
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit

import qrcode
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps

from app.comfy_client import ComfyClient
from app.config import ensure_runtime_dirs, settings


ensure_runtime_dirs()
comfy_client = ComfyClient()
logger = logging.getLogger("uvicorn.error")
WEB_DIR = Path(__file__).resolve().parent.parent / "web"
TEMPLATE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
TEMPLATE_THUMB_SIZE = (320, 390)
MEDIA_TYPE_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
PRIVATE_IPV4_NETWORKS = (
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
)
PUBLIC_TUNNEL_SCRIPT = Path(__file__).resolve().parent.parent / "start_public_tunnel.sh"
PERSON_UPLOAD_SESSION_TTL_SECONDS = 10 * 60
PERSON_UPLOAD_MAX_BYTES = 15 * 1024 * 1024
PERSON_UPLOAD_DIR = settings.upload_dir / "person_sessions"
person_upload_sessions: dict[str, dict[str, object]] = {}


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_runtime_dirs()
    warm_template_thumbnails()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.mount("/static", StaticFiles(directory=WEB_DIR / "static"), name="static")
app.mount("/template-files", StaticFiles(directory=settings.template_dir), name="template-files")
app.mount("/template-thumbs", StaticFiles(directory=settings.template_thumb_dir), name="template-thumbs")
app.mount("/result-files", StaticFiles(directory=settings.result_dir), name="result-files")


def validate_image_file(upload: UploadFile, field_name: str) -> None:
    content_type = (upload.content_type or "").lower()
    if content_type not in settings.allowed_image_types:
        raise HTTPException(status_code=400, detail=f"{field_name} 必须是 jpg、png 或 webp 图片")


def resolve_template_file(template_name: str) -> Path:
    cleaned_name = Path(template_name).name.strip()
    if not cleaned_name:
        raise HTTPException(status_code=400, detail="background_template_name 不能为空")

    template_root = settings.template_dir.resolve()
    template_path = (template_root / cleaned_name).resolve()
    if template_path.parent != template_root:
        raise HTTPException(status_code=400, detail="background_template_name 非法")

    if not template_path.is_file() or template_path.suffix.lower() not in TEMPLATE_EXTENSIONS:
        raise HTTPException(status_code=404, detail="所选背景模板不存在")

    return template_path


def ensure_template_thumbnail(template_path: Path) -> Path:
    thumb_path = settings.template_thumb_dir / f"{template_path.stem}.webp"

    try:
        if thumb_path.exists() and thumb_path.stat().st_mtime_ns >= template_path.stat().st_mtime_ns:
            return thumb_path
    except OSError:
        pass

    with Image.open(template_path) as image:
        thumb_image = ImageOps.fit(image.convert("RGB"), TEMPLATE_THUMB_SIZE, Image.Resampling.LANCZOS)
        thumb_image.save(thumb_path, format="WEBP", quality=82, method=6)

    return thumb_path


def warm_template_thumbnails() -> None:
    for path in sorted(settings.template_dir.iterdir()):
        if not path.is_file() or path.suffix.lower() not in TEMPLATE_EXTENSIONS:
            continue

        try:
            ensure_template_thumbnail(path)
        except Exception as error:
            logger.warning("template thumbnail build failed for %s: %s", path.name, error)


def normalize_media_type(media_type: str) -> str:
        return media_type.split(";", 1)[0].strip().lower()


def resolve_result_extension(media_type: str) -> str:
        return MEDIA_TYPE_EXTENSIONS.get(normalize_media_type(media_type), ".png")


def resolve_result_media_type(result_path: Path) -> str:
        return {
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".png": "image/png",
                ".webp": "image/webp",
        }.get(result_path.suffix.lower(), "application/octet-stream")


def store_result_file(image_bytes: bytes, media_type: str) -> tuple[str, Path]:
        result_id = uuid.uuid4().hex
        result_path = settings.result_dir / f"{result_id}{resolve_result_extension(media_type)}"
        result_path.write_bytes(image_bytes)
        return result_id, result_path


def store_editor_mask_file(result_id: str, mask_bytes: bytes) -> Path:
    mask_path = settings.result_dir / f"{result_id}_editor-mask.png"
    mask_path.write_bytes(mask_bytes)
    return mask_path


def get_result_path(result_id: str) -> Path:
        matches = sorted(settings.result_dir.glob(f"{result_id}.*"))
        if not matches:
                raise HTTPException(status_code=404, detail="结果文件不存在或已失效")
        return matches[0]


def is_preferred_lan_ip(candidate: str) -> bool:
    try:
        ip_value = ipaddress.ip_address(candidate)
    except ValueError:
        return False

    if ip_value.version != 4:
        return False

    return any(ip_value in network for network in PRIVATE_IPV4_NETWORKS)


def detect_default_route_ip() -> str | None:
    try:
        result = subprocess.run(
            ["ip", "-4", "route", "show", "default"],
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError:
        return None

    if result.returncode != 0:
        return None

    for line in result.stdout.splitlines():
        parts = line.split()
        if "src" not in parts:
            continue

        src_index = parts.index("src") + 1
        if src_index >= len(parts):
            continue

        candidate = parts[src_index]
        if is_preferred_lan_ip(candidate):
            return candidate

    return None


def detect_lan_ip() -> str | None:
    default_route_ip = detect_default_route_ip()
    if default_route_ip:
        return default_route_ip

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe_socket:
            probe_socket.connect(("8.8.8.8", 80))
            detected_ip = probe_socket.getsockname()[0]
            if detected_ip and is_preferred_lan_ip(detected_ip):
                return detected_ip
    except OSError:
        pass

    try:
        detected_ip = socket.gethostbyname(socket.gethostname())
        if detected_ip and is_preferred_lan_ip(detected_ip):
            return detected_ip
    except OSError:
        return None

    return None


def read_dynamic_public_base_url() -> str | None:
    try:
        file_path = settings.public_base_url_file
        tunnel_pid_file = file_path.parent / "cloudflared.pid"

        if not tunnel_pid_file.exists():
            return None

        raw_pid = tunnel_pid_file.read_text(encoding="utf-8").strip()
        if not raw_pid.isdigit():
            return None

        try:
            process_alive = Path(f"/proc/{raw_pid}").exists()
        except OSError:
            process_alive = False

        if not process_alive:
            return None

        if not file_path.exists():
            return None

        raw_value = file_path.read_text(encoding="utf-8").strip()
        if not raw_value:
            return None

        parsed_value = urlsplit(raw_value)
        if parsed_value.scheme not in {"http", "https"} or not parsed_value.netloc:
            return None

        return raw_value.rstrip("/")
    except OSError:
        return None


def try_ensure_dynamic_public_base_url() -> str | None:
    dynamic_public_base_url = read_dynamic_public_base_url()
    if dynamic_public_base_url:
        return dynamic_public_base_url

    if not PUBLIC_TUNNEL_SCRIPT.is_file():
        return None

    try:
        result = subprocess.run(
            [str(PUBLIC_TUNNEL_SCRIPT), "start"],
            cwd=str(PUBLIC_TUNNEL_SCRIPT.parent),
            capture_output=True,
            text=True,
            check=False,
            timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        logger.warning("public tunnel autostart failed: %s", error)
        return read_dynamic_public_base_url()

    if result.returncode != 0:
        output = "\n".join(part.strip() for part in (result.stdout, result.stderr) if part.strip())
        logger.warning("public tunnel autostart exited with code %s: %s", result.returncode, output or "<empty output>")

    return read_dynamic_public_base_url()


def build_public_base_url(request: Request) -> str:
    configured_base_url = (settings.public_base_url or "").strip()
    configured_host = urlsplit(configured_base_url).hostname or ""
    should_try_dynamic_public_url = not configured_base_url or configured_host in {"127.0.0.1", "localhost", "::1"} or is_preferred_lan_ip(configured_host)
    dynamic_public_base_url = try_ensure_dynamic_public_base_url() if should_try_dynamic_public_url else read_dynamic_public_base_url()

    if dynamic_public_base_url:
        if not configured_base_url:
            return dynamic_public_base_url

        if configured_host in {"127.0.0.1", "localhost", "::1"} or is_preferred_lan_ip(configured_host):
            return dynamic_public_base_url

    if configured_base_url:
        return configured_base_url.rstrip("/")

    forwarded_proto = request.headers.get("x-forwarded-proto")
    forwarded_host = request.headers.get("x-forwarded-host")
    if forwarded_proto and forwarded_host:
        return f"{forwarded_proto}://{forwarded_host}".rstrip("/")

    request_base_url = str(request.base_url).rstrip("/")
    parsed_base_url = urlsplit(request_base_url)

    if parsed_base_url.hostname in {"127.0.0.1", "localhost", "::1"}:
        lan_ip = detect_lan_ip()
        if lan_ip:
            port = f":{parsed_base_url.port}" if parsed_base_url.port else ""
            return f"{parsed_base_url.scheme}://{lan_ip}{port}"

    return request_base_url


def build_result_urls(request: Request, result_id: str, result_filename: str) -> dict[str, str]:
    base_url = build_public_base_url(request)
    encoded_filename = quote(result_filename)
    return {
        "image_url": f"{base_url}/result-files/{encoded_filename}",
        "download_url": f"{base_url}/api/results/{result_id}/download",
        "share_url": f"{base_url}/share/{result_id}",
        "qr_url": f"/api/results/{result_id}/qr",
    }


def cleanup_person_upload_sessions(now: float | None = None) -> None:
    current_time = now or time.time()
    expired_ids = [
        session_id
        for session_id, session in person_upload_sessions.items()
        if float(session.get("expires_at", 0)) <= current_time
    ]

    for session_id in expired_ids:
        session = person_upload_sessions.pop(session_id, None)
        image_path = session.get("image_path") if session else None
        if isinstance(image_path, Path):
            try:
                image_path.unlink(missing_ok=True)
            except OSError:
                logger.warning("person upload cleanup failed for %s", image_path)


def get_person_upload_session(session_id: str) -> dict[str, object] | None:
    if not session_id or any(char not in "0123456789abcdef" for char in session_id.lower()):
        return None
    return person_upload_sessions.get(session_id)


def build_person_upload_url(request: Request, session_id: str) -> str:
    dynamic_public_base_url = read_dynamic_public_base_url() or try_ensure_dynamic_public_base_url()
    if dynamic_public_base_url:
        return f"{dynamic_public_base_url.rstrip('/')}/mobile/person-upload/{session_id}"

    return str(request.url_for("mobile_person_upload_page", session_id=session_id))


def build_person_upload_payload(request: Request, session_id: str, session: dict[str, object]) -> dict[str, object]:
    uploaded_at = session.get("uploaded_at")
    version = int(session.get("version", 0) or 0)
    payload: dict[str, object] = {
        "session_id": session_id,
        "status": "uploaded" if version > 0 else "pending",
        "expires_at": session["expires_at"],
        "version": version,
    }

    if version > 0:
        payload.update(
            {
                "image_url": f"/api/person-upload-sessions/{session_id}/image?v={version}",
                "filename": session.get("filename") or "person_image",
                "uploaded_at": uploaded_at,
            }
        )

    return payload


def build_mobile_person_upload_page(session_id: str, expired: bool = False) -> str:
    escaped_session_id = html.escape(session_id)
    disabled = "disabled" if expired else ""
    status_text = "二维码已过期，请回到大屏重新打开扫码上传。" if expired else "请选择相册照片，或直接拍照上传。"
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>上传人物图</title>
    <style>
      :root {{ color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
      * {{ box-sizing: border-box; }}
      body {{
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 22px;
        color: #f7f9ff;
        background:
          radial-gradient(circle at 50% 0%, rgba(111, 84, 255, 0.42), transparent 38%),
          linear-gradient(145deg, #050b1c 0%, #101847 48%, #061833 100%);
      }}
      main {{
        width: min(100%, 420px);
        padding: 28px 22px;
        border: 1px solid rgba(255,255,255,.16);
        border-radius: 28px;
        background: rgba(255,255,255,.08);
        box-shadow: 0 24px 70px rgba(0,0,0,.32);
        backdrop-filter: blur(18px);
      }}
      h1 {{ margin: 0 0 8px; font-size: 28px; }}
      p {{ margin: 0 0 22px; line-height: 1.7; color: rgba(247,249,255,.72); }}
      .upload-actions {{ display: grid; gap: 14px; }}
      label, button {{
        width: 100%;
        min-height: 54px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 999px;
        color: #fff;
        font-size: 17px;
        font-weight: 800;
        background: linear-gradient(90deg, #9a55ea, #529dff);
      }}
      label.secondary {{ background: rgba(255,255,255,.11); border: 1px solid rgba(255,255,255,.18); }}
      input {{ display: none; }}
      #status {{ margin-top: 18px; min-height: 24px; color: rgba(247,249,255,.82); }}
      .success {{ color: #9df0bd !important; }}
      .error {{ color: #ffb4b4 !important; }}
      label[aria-disabled="true"] {{ opacity: .46; pointer-events: none; }}
    </style>
  </head>
  <body>
    <main>
      <h1>上传人物图</h1>
      <p id="intro">{html.escape(status_text)}</p>
      <div class="upload-actions">
        <label aria-disabled="{str(expired).lower()}">
          选择相册照片
          <input id="album-input" type="file" accept="image/*" {disabled} />
        </label>
        <label class="secondary" aria-disabled="{str(expired).lower()}">
          现场拍照上传
          <input id="camera-input" type="file" accept="image/*" capture="user" {disabled} />
        </label>
      </div>
      <p id="status"></p>
    </main>
    <script>
      const sessionId = "{escaped_session_id}";
      const statusEl = document.getElementById("status");
      const inputs = [document.getElementById("album-input"), document.getElementById("camera-input")];
      async function uploadFile(file) {{
        if (!file) return;
        statusEl.className = "";
        statusEl.textContent = "正在上传...";
        const formData = new FormData();
        formData.append("person_image", file, file.name || "person.jpg");
        try {{
          const response = await fetch(`/api/person-upload-sessions/${{sessionId}}/image`, {{
            method: "POST",
            body: formData
          }});
          if (!response.ok) {{
            let message = "上传失败，请重试。";
            try {{
              const payload = await response.json();
              message = payload.detail || message;
            }} catch (_) {{}}
            throw new Error(message);
          }}
          statusEl.className = "success";
          statusEl.textContent = "上传成功，请回到大屏继续操作。";
        }} catch (error) {{
          statusEl.className = "error";
          statusEl.textContent = error.message || "上传失败，请重试。";
        }}
      }}
      inputs.forEach((input) => input?.addEventListener("change", () => uploadFile(input.files?.[0])));
    </script>
  </body>
</html>"""


def build_share_page(result_path: Path, image_url: str, download_url: str, share_url: str) -> str:
    safe_title = html.escape(result_path.stem)
    safe_share_url = html.escape(share_url)
    safe_download_url = html.escape(download_url)
    safe_image_url = html.escape(image_url)
    share_url_json = json.dumps(share_url, ensure_ascii=False)
    return f"""<!DOCTYPE html>
<html lang=\"zh-CN\">
    <head>
        <meta charset=\"UTF-8\" />
        <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />
        <title>文旅打卡成片下载</title>
        <meta name=\"description\" content=\"我的 AIGC 文旅打卡成片已生成，快来看看吧。\" />
        <meta property=\"og:type\" content=\"website\" />
        <meta property=\"og:title\" content=\"文旅打卡成片\" />
        <meta property=\"og:description\" content=\"我的 AIGC 文旅打卡成片已生成，快来看看吧。\" />
        <meta property=\"og:image\" content=\"{safe_image_url}\" />
        <meta property=\"og:url\" content=\"{safe_share_url}\" />
        <style>
            :root {{
                color-scheme: light;
                --bg: #f6efe5;
                --card: rgba(255, 252, 247, 0.94);
                --text: #30221c;
                --muted: #7c6c62;
                --accent: #c97a42;
                --accent-strong: #8a4a27;
                --line: rgba(112, 80, 54, 0.12);
                --shadow: 0 18px 40px rgba(48, 31, 17, 0.12);
            }}

            * {{ box-sizing: border-box; }}

            body {{
                margin: 0;
                min-height: 100vh;
                font-family: \"Noto Sans SC\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif;
                color: var(--text);
                background:
                    radial-gradient(circle at top, rgba(255, 255, 255, 0.88), transparent 36%),
                    linear-gradient(180deg, var(--bg), #ffffff);
            }}

            .share-shell {{
                width: min(100%, 760px);
                margin: 0 auto;
                padding: 24px 18px 40px;
            }}

            .share-card {{
                padding: 22px;
                border: 1px solid var(--line);
                border-radius: 28px;
                background: var(--card);
                box-shadow: var(--shadow);
            }}

            .eyebrow {{
                margin: 0 0 10px;
                font-size: 11px;
                font-weight: 800;
                letter-spacing: 0.24em;
                color: var(--accent-strong);
            }}

            h1 {{
                margin: 0;
                font-size: clamp(28px, 7vw, 42px);
                line-height: 1.05;
            }}

            p {{
                margin: 0;
                line-height: 1.8;
            }}

            .subcopy {{
                margin-top: 12px;
                color: var(--muted);
                font-size: 14px;
            }}

            .preview {{
                width: 100%;
                margin-top: 20px;
                border-radius: 22px;
                display: block;
                background: #f2e9df;
            }}

            .actions {{
                display: grid;
                gap: 12px;
                margin-top: 20px;
            }}

            .primary-action,
            .secondary-action,
            .share-action {{
                display: inline-flex;
                justify-content: center;
                align-items: center;
                width: 100%;
                min-height: 50px;
                border-radius: 999px;
                font-size: 15px;
                font-weight: 800;
                text-decoration: none;
                appearance: none;
                font-family: inherit;
                cursor: pointer;
            }}

            .primary-action {{
                background: linear-gradient(135deg, var(--accent), var(--accent-strong));
                color: #fff;
            }}

            .secondary-action {{
                border: 1px solid var(--line);
                background: rgba(255, 255, 255, 0.84);
                color: var(--accent-strong);
            }}

            .share-action {{
                border: 1px solid var(--line);
                background: rgba(255, 255, 255, 0.84);
                color: var(--accent-strong);
            }}

            .primary-action:active,
            .secondary-action:active,
            .share-action:active {{
                transform: translateY(1px);
            }}

            .share-url {{
                margin-top: 12px;
                word-break: break-all;
                color: var(--accent-strong);
                font-size: 12px;
            }}

            .share-status {{
                min-height: 18px;
                margin-top: 8px;
                color: var(--muted);
                font-size: 12px;
                text-align: center;
            }}

            .share-overlay[hidden] {{
                display: none;
            }}

            .share-overlay {{
                position: fixed;
                inset: 0;
                z-index: 20;
                display: flex;
                align-items: flex-end;
                justify-content: center;
                padding: 16px;
                background: rgba(24, 16, 10, 0.42);
                backdrop-filter: blur(8px);
            }}

            .share-sheet {{
                width: min(100%, 430px);
                padding: 18px;
                border: 1px solid rgba(129, 83, 51, 0.14);
                border-radius: 24px 24px 20px 20px;
                background: rgba(255, 252, 246, 0.97);
                box-shadow: 0 20px 50px rgba(80, 48, 26, 0.2);
            }}

            .share-sheet-title {{
                margin: 0 0 6px;
                color: var(--text);
                font-size: 18px;
                font-weight: 900;
            }}

            .share-sheet-copy {{
                margin: 0 0 14px;
                color: var(--muted);
                font-size: 13px;
            }}

            .share-option {{
                width: 100%;
                min-height: 48px;
                margin-top: 10px;
                border: 1px solid var(--line);
                border-radius: 999px;
                background: #fff;
                color: var(--accent-strong);
                font-family: inherit;
                font-size: 15px;
                font-weight: 850;
            }}

            .share-option.primary {{
                border: 0;
                background: linear-gradient(135deg, var(--accent), var(--accent-strong));
                color: #fff;
            }}

            .share-cancel {{
                width: 100%;
                min-height: 44px;
                margin-top: 12px;
                border: 0;
                border-radius: 999px;
                background: rgba(129, 83, 51, 0.08);
                color: var(--muted);
                font-family: inherit;
                font-size: 14px;
                font-weight: 800;
            }}
        </style>
    </head>
    <body>
        <main class=\"share-shell\">
            <section class=\"share-card\">
                <p class=\"eyebrow\">AIGC TRAVEL CHECK-IN</p>
                <h1>文旅打卡成片已生成</h1>
                <p class=\"subcopy\">你可以直接下载原图，也可以先预览大图后再保存。如果正在微信内打开，长按图片也可以保存到手机。</p>
                <img class=\"preview\" src=\"{safe_image_url}\" alt=\"{safe_title}\" />
                <div class=\"actions\">
                    <a class=\"primary-action\" href=\"{safe_download_url}\">下载原图</a>
                    <a class=\"secondary-action\" href=\"{safe_image_url}\" target=\"_blank\" rel=\"noreferrer\">查看大图</a>
                    <button id=\"share-button\" class=\"share-action\" type=\"button\">分享</button>
                </div>
                <p id=\"share-status\" class=\"share-status\"></p>
                <p class=\"share-url\">分享地址：{safe_share_url}</p>
            </section>
        </main>
        <div id=\"share-sheet\" class=\"share-overlay\" hidden>
            <div class=\"share-sheet\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"share-sheet-title\">
                <p id=\"share-sheet-title\" class=\"share-sheet-title\">选择分享方式</p>
                <p class=\"share-sheet-copy\">如果在微信内打开，请点右上角“...”发送给好友或分享到朋友圈。</p>
                <button class=\"share-option primary\" type=\"button\" data-share-channel=\"friend\">微信好友</button>
                <button class=\"share-option\" type=\"button\" data-share-channel=\"timeline\">朋友圈</button>
                <button class=\"share-option\" type=\"button\" data-share-channel=\"copy\">复制分享链接</button>
                <button id=\"share-cancel\" class=\"share-cancel\" type=\"button\">取消</button>
            </div>
        </div>
        <script>
            const shareUrl = {share_url_json};
            const shareButton = document.getElementById("share-button");
            const shareStatus = document.getElementById("share-status");
            const shareSheet = document.getElementById("share-sheet");
            const shareCancel = document.getElementById("share-cancel");
            const isWeChat = /MicroMessenger/i.test(navigator.userAgent);

            async function copyShareUrl() {{
                if (navigator.clipboard && window.isSecureContext) {{
                    await navigator.clipboard.writeText(shareUrl);
                    return true;
                }}
                const input = document.createElement("textarea");
                input.value = shareUrl;
                input.setAttribute("readonly", "");
                input.style.position = "fixed";
                input.style.left = "-9999px";
                document.body.appendChild(input);
                input.select();
                const copied = document.execCommand("copy");
                document.body.removeChild(input);
                return copied;
            }}

            async function tryNativeShare(channel) {{
                const payload = {{
                    title: "文旅打卡成片",
                    text: "我的 AIGC 文旅打卡成片已生成，快来看看吧。",
                    url: shareUrl,
                }};
                try {{
                    if (navigator.share) {{
                        await navigator.share(payload);
                        shareStatus.textContent = "已打开手机分享面板，请选择微信好友或朋友圈。";
                        return;
                    }}
                    const copied = await copyShareUrl();
                    if (isWeChat) {{
                        shareStatus.textContent = copied
                            ? "链接已复制。请点右上角“...”选择发送给好友或分享到朋友圈。"
                            : "请点右上角“...”选择发送给好友或分享到朋友圈。";
                    }} else {{
                        const targetText = channel === "timeline" ? "朋友圈" : "微信好友";
                        shareStatus.textContent = copied
                            ? `链接已复制。请打开微信，粘贴到${{targetText}}；也可以在微信内打开本页后点右上角分享。`
                            : `请复制下方链接后分享到${{targetText}}，或在微信内打开本页后点右上角分享。`;
                    }}
                }} catch (error) {{
                    if (error?.name === "AbortError") {{
                        shareStatus.textContent = "已取消分享。";
                        return;
                    }}
                    const copied = await copyShareUrl().catch(() => false);
                    shareStatus.textContent = copied
                        ? "分享未成功，已为你复制链接。"
                        : "分享未成功，请手动复制下方链接。";
                }}
            }}

            shareButton?.addEventListener("click", () => {{
                shareSheet.hidden = false;
            }});

            shareCancel?.addEventListener("click", () => {{
                shareSheet.hidden = true;
            }});

            shareSheet?.addEventListener("click", async (event) => {{
                if (event.target === shareSheet) {{
                    shareSheet.hidden = true;
                    return;
                }}
                const option = event.target.closest("[data-share-channel]");
                if (!option) return;
                const channel = option.dataset.shareChannel;
                shareSheet.hidden = true;
                if (channel === "copy") {{
                    const copied = await copyShareUrl().catch(() => false);
                    shareStatus.textContent = copied ? "分享链接已复制。" : "复制失败，请手动复制下方链接。";
                    return;
                }}
                await tryNativeShare(channel);
            }});
        </script>
    </body>
</html>"""


def create_qr_response(content: str) -> StreamingResponse:
    qr_code = qrcode.QRCode(box_size=8, border=2)
    qr_code.add_data(content)
    qr_code.make(fit=True)

    qr_image = qr_code.make_image(fill_color="#6e3d23", back_color="white")
    buffer = BytesIO()
    qr_image.save(buffer, format="PNG")
    buffer.seek(0)

    headers = {"Cache-Control": "no-store, max-age=0"}
    return StreamingResponse(iter([buffer.getvalue()]), media_type="image/png", headers=headers)


def build_result_response(
    request: Request,
    image_bytes: bytes,
    media_type: str,
    prompt_id: str,
    timing: dict[str, int] | None = None,
    editor_face_bounds: dict[str, int] | None = None,
    editor_face_mask_bytes: bytes | None = None,
    generation_warning: str | None = None,
) -> FileResponse:
    result_id, result_path = store_result_file(image_bytes, media_type)
    result_urls = build_result_urls(request, result_id, result_path.name)
    editor_mask_path = store_editor_mask_file(result_id, editor_face_mask_bytes) if editor_face_mask_bytes else None

    headers = {
        "X-Comfy-Prompt-Id": prompt_id,
        "X-Result-Id": result_id,
        "X-Result-Image-Url": result_urls["image_url"],
        "X-Result-Download-Url": result_urls["download_url"],
        "X-Result-Share-Url": result_urls["share_url"],
        "X-Result-Qr-Url": result_urls["qr_url"],
        "Content-Disposition": f'inline; filename="travel-checkin-result{result_path.suffix}"',
    }
    if timing:
        headers.update(
            {
                "X-Perf-Upload-Ms": str(timing.get("upload_ms", 0)),
                "X-Perf-Submit-Ms": str(timing.get("submit_ms", 0)),
                "X-Perf-Wait-Ms": str(timing.get("wait_ms", 0)),
                "X-Perf-Fetch-Ms": str(timing.get("fetch_ms", 0)),
                "X-Perf-Total-Ms": str(timing.get("total_ms", 0)),
            }
        )
    if editor_face_bounds:
        headers["X-Editor-Face-Bounds"] = json.dumps(editor_face_bounds, separators=(",", ":"))
    if editor_mask_path:
        headers["X-Editor-Face-Mask-Url"] = f"/result-files/{quote(editor_mask_path.name)}?v={editor_mask_path.stat().st_mtime_ns}"
    if generation_warning:
        headers["X-Generation-Warning"] = generation_warning
    return FileResponse(result_path, media_type=media_type, headers=headers)


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(
        WEB_DIR / "scene.html",
        headers={"Cache-Control": "no-store, max-age=0"},
    )


@app.get("/studio")
async def studio_page() -> FileResponse:
    return FileResponse(
        WEB_DIR / "index.html",
        headers={"Cache-Control": "no-store, max-age=0"},
    )


@app.get("/generate")
async def generate_page() -> FileResponse:
    return FileResponse(
        WEB_DIR / "generate.html",
        headers={"Cache-Control": "no-store, max-age=0"},
    )


@app.get("/api/health")
async def health() -> JSONResponse:
    system_stats = await comfy_client.healthcheck()
    return JSONResponse(
        {
            "ok": True,
            "app": settings.app_name,
            "comfy_base_url": settings.comfy_base_url,
            "system_stats": system_stats,
        }
    )


@app.get("/api/runtime-info")
async def runtime_info(request: Request) -> JSONResponse:
    lan_ip = detect_lan_ip()
    lan_base_url = f"http://{lan_ip}:{settings.app_port}" if lan_ip else None
    return JSONResponse(
        {
            "lan_base_url": lan_base_url,
            "public_base_url": build_public_base_url(request),
            "request_base_url": str(request.base_url).rstrip("/"),
        }
    )


@app.get("/api/templates")
async def list_templates() -> JSONResponse:
    templates = []
    for path in sorted(settings.template_dir.iterdir()):
        if not path.is_file() or path.suffix.lower() not in TEMPLATE_EXTENSIONS:
            continue
        thumb_path = ensure_template_thumbnail(path)
        version = path.stat().st_mtime_ns
        templates.append(
            {
                "name": path.name,
                "label": path.stem,
                "url": f"/template-files/{quote(path.name)}?v={version}",
                "thumbnail_url": f"/template-thumbs/{quote(thumb_path.name)}?v={version}",
            }
        )

    return JSONResponse({"templates": templates})


@app.get("/api/results/{result_id}/download")
async def download_result(result_id: str) -> FileResponse:
    result_path = get_result_path(result_id)
    return FileResponse(
        result_path,
        media_type=resolve_result_media_type(result_path),
        filename=result_path.name,
    )


@app.post("/api/results/publish-edited")
async def publish_edited_result(
    request: Request,
    edited_image: UploadFile = File(..., description="前端编辑后的成片"),
) -> JSONResponse:
    validate_image_file(edited_image, "edited_image")

    image_bytes = await edited_image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="edited_image 不能为空")

    media_type = normalize_media_type(edited_image.content_type or "image/png")
    result_id, result_path = store_result_file(image_bytes, media_type)
    result_urls = build_result_urls(request, result_id, result_path.name)

    return JSONResponse(
        {
            "result_id": result_id,
            "result_filename": result_path.name,
            "image_url": result_urls["image_url"],
            "download_url": result_urls["download_url"],
            "share_url": result_urls["share_url"],
            "qr_url": result_urls["qr_url"],
        }
    )


@app.post("/api/person-upload-sessions")
async def create_person_upload_session(request: Request) -> JSONResponse:
    cleanup_person_upload_sessions()
    PERSON_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    session_id = uuid.uuid4().hex
    created_at = time.time()
    expires_at = created_at + PERSON_UPLOAD_SESSION_TTL_SECONDS
    person_upload_sessions[session_id] = {
        "created_at": created_at,
        "expires_at": expires_at,
        "version": 0,
    }

    upload_url = build_person_upload_url(request, session_id)
    return JSONResponse(
        {
            "session_id": session_id,
            "upload_url": upload_url,
            "qr_url": f"/api/qr?content={quote(upload_url, safe='')}",
            "expires_at": expires_at,
        }
    )


@app.get("/mobile/person-upload/{session_id}")
async def mobile_person_upload_page(session_id: str) -> HTMLResponse:
    cleanup_person_upload_sessions()
    session = get_person_upload_session(session_id)
    expired = session is None or float(session.get("expires_at", 0)) <= time.time()
    return HTMLResponse(build_mobile_person_upload_page(session_id, expired=expired))


@app.post("/api/person-upload-sessions/{session_id}/image")
async def upload_person_session_image(session_id: str, request: Request, person_image: UploadFile = File(...)) -> JSONResponse:
    cleanup_person_upload_sessions()
    session = get_person_upload_session(session_id)
    if session is None or float(session.get("expires_at", 0)) <= time.time():
        raise HTTPException(status_code=410, detail="二维码已过期，请回到大屏重新打开扫码上传")

    validate_image_file(person_image, "person_image")
    image_bytes = await person_image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="请上传有效图片")
    if len(image_bytes) > PERSON_UPLOAD_MAX_BYTES:
        raise HTTPException(status_code=413, detail="图片不能超过 15MB")

    PERSON_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    media_type = normalize_media_type(person_image.content_type or "image/png")
    suffix = MEDIA_TYPE_EXTENSIONS.get(media_type, ".png")
    image_path = PERSON_UPLOAD_DIR / f"{session_id}_{uuid.uuid4().hex}{suffix}"
    image_path.write_bytes(image_bytes)

    old_image_path = session.get("image_path")
    if isinstance(old_image_path, Path):
        try:
            old_image_path.unlink(missing_ok=True)
        except OSError:
            logger.warning("old person upload image cleanup failed for %s", old_image_path)

    safe_filename = Path(person_image.filename or f"person{suffix}").name or f"person{suffix}"
    uploaded_at = time.time()
    session.update(
        {
            "image_path": image_path,
            "filename": safe_filename,
            "media_type": media_type,
            "uploaded_at": uploaded_at,
            "version": int(session.get("version", 0) or 0) + 1,
        }
    )

    return JSONResponse(build_person_upload_payload(request, session_id, session))


@app.get("/api/person-upload-sessions/{session_id}/status")
async def get_person_upload_session_status(session_id: str, request: Request) -> JSONResponse:
    cleanup_person_upload_sessions()
    session = get_person_upload_session(session_id)
    if session is None or float(session.get("expires_at", 0)) <= time.time():
        return JSONResponse({"session_id": session_id, "status": "expired", "version": 0})

    return JSONResponse(build_person_upload_payload(request, session_id, session))


@app.get("/api/person-upload-sessions/{session_id}/image")
async def get_person_upload_session_image(session_id: str) -> FileResponse:
    cleanup_person_upload_sessions()
    session = get_person_upload_session(session_id)
    if session is None or float(session.get("expires_at", 0)) <= time.time():
        raise HTTPException(status_code=410, detail="二维码已过期")

    image_path = session.get("image_path")
    if not isinstance(image_path, Path) or not image_path.is_file():
        raise HTTPException(status_code=404, detail="尚未上传图片")

    return FileResponse(
        image_path,
        media_type=str(session.get("media_type") or "image/png"),
        filename=str(session.get("filename") or image_path.name),
    )


@app.get("/api/results/{result_id}/qr")
async def result_qr_code(result_id: str, request: Request) -> StreamingResponse:
    result_path = get_result_path(result_id)
    share_url = build_result_urls(request, result_id, result_path.name)["share_url"]

    return create_qr_response(share_url)


@app.get("/api/qr")
async def dynamic_qr_code(content: str) -> StreamingResponse:
    decoded_content = unquote(content).strip()
    if not decoded_content:
        raise HTTPException(status_code=400, detail="二维码内容不能为空")

    parsed_content = urlsplit(decoded_content)
    if parsed_content.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="二维码只支持 http 或 https 地址")

    if len(decoded_content) > 2048:
        raise HTTPException(status_code=400, detail="二维码内容过长")

    return create_qr_response(decoded_content)


@app.get("/share/{result_id}")
async def share_result(result_id: str, request: Request) -> HTMLResponse:
    result_path = get_result_path(result_id)
    result_urls = build_result_urls(request, result_id, result_path.name)
    return HTMLResponse(
        build_share_page(
            result_path,
            result_urls["image_url"],
            result_urls["download_url"],
            result_urls["share_url"],
        )
    )


@app.post("/api/swap")
@app.post("/api/checkin/upload-background")
async def upload_background_checkin(
    request: Request,
    person_image: UploadFile = File(..., description="用户自拍或打卡人物照"),
    background_image: UploadFile | None = File(None, description="文旅背景参考图"),
    background_template_name: str = Form("", description="系统背景模板文件名"),
    composition_payload: str = Form("", description="摄像头虚拟背景构图参数"),
):
    validate_image_file(person_image, "person_image")

    template_path = None
    if background_image is not None:
        validate_image_file(background_image, "background_image")
    elif background_template_name.strip():
        template_path = resolve_template_file(background_template_name)
    else:
        raise HTTPException(status_code=400, detail="请上传背景图，或从图库选择一个背景模板")

    parsed_composition_payload = None
    if composition_payload.strip():
        try:
            parsed_composition_payload = json.loads(composition_payload)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail=f"composition_payload 不是有效 JSON：{exc.msg}")
        if not isinstance(parsed_composition_payload, dict):
            raise HTTPException(status_code=400, detail="composition_payload 必须是 JSON 对象")

    image_bytes, media_type, prompt_id, timing, editor_face_bounds, editor_face_mask_bytes = await comfy_client.run_upload_background_checkin(
        person_file=person_image,
        background_file=background_image,
        background_template_path=template_path,
        composition_payload=parsed_composition_payload,
    )

    logger.info(
        "upload-background prompt_id=%s template=%s upload_ms=%s submit_ms=%s wait_ms=%s fetch_ms=%s total_ms=%s",
        prompt_id,
        template_path.name if template_path else "uploaded-file",
        timing.get("upload_ms", 0),
        timing.get("submit_ms", 0),
        timing.get("wait_ms", 0),
        timing.get("fetch_ms", 0),
        timing.get("total_ms", 0),
    )

    return build_result_response(request, image_bytes, media_type, prompt_id, timing, editor_face_bounds, editor_face_mask_bytes)
