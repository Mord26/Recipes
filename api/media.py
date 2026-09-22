"""Resolves a social media URL into a downloadable video plus its caption.

Kept in Python because yt-dlp is the only thing that reliably tracks Instagram, TikTok, YouTube
and Facebook as they change. It only resolves - the Node side downloads and reads the video, so a
12MB file never has to cross this boundary.
"""

import json
import os
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

ALLOWED_HOSTS = (
    "instagram.com",
    "tiktok.com",
    "youtube.com",
    "youtu.be",
    "facebook.com",
    "fb.watch",
    "pinterest.com",
)

# Prefer a single progressive file: merging separate video and audio streams needs ffmpeg, which
# is not available here. Small first, since the whole point is to hand it to an AI, not to watch it.
FORMAT_SPEC = "best[ext=mp4][filesize<20M]/best[ext=mp4][filesize_approx<20M]/best[ext=mp4]/best"


def _host_allowed(url: str) -> bool:
    try:
        host = (urlparse(url).hostname or "").lower()
    except ValueError:
        return False
    if not host:
        return False
    return any(host == h or host.endswith("." + h) for h in ALLOWED_HOSTS)


def _pick_format(info: dict) -> dict | None:
    """The format yt-dlp settled on, flattened to what the caller needs."""
    if info.get("url") and info.get("ext") == "mp4":
        chosen = info
    else:
        candidates = [
            f
            for f in (info.get("formats") or [])
            if f.get("url") and f.get("vcodec") not in (None, "none") and f.get("acodec") not in (None, "none")
        ]
        if not candidates:
            return None
        chosen = candidates[-1]
    return {
        "url": chosen.get("url"),
        "ext": chosen.get("ext") or "mp4",
        "width": chosen.get("width"),
        "height": chosen.get("height"),
        "filesize": chosen.get("filesize") or chosen.get("filesize_approx"),
        "headers": chosen.get("http_headers") or info.get("http_headers") or {},
    }


def _resolve(url: str) -> dict:
    import yt_dlp

    options = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        "socket_timeout": 20,
        "format": FORMAT_SPEC,
        "extractor_args": {"youtube": {"player_client": ["web"]}},
    }
    with yt_dlp.YoutubeDL(options) as ydl:
        info = ydl.extract_info(url, download=False)

    if info.get("_type") == "playlist":
        entries = info.get("entries") or []
        if not entries:
            raise ValueError("no playable entry")
        info = entries[0]

    return {
        "ok": True,
        "extractor": info.get("extractor_key"),
        "title": info.get("title") or "",
        "description": info.get("description") or "",
        "uploader": info.get("uploader") or info.get("channel") or info.get("uploader_id") or "",
        "duration": info.get("duration"),
        "thumbnail": info.get("thumbnail") or "",
        "webpage_url": info.get("webpage_url") or url,
        "video": _pick_format(info),
    }


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        params = parse_qs(urlparse(self.path).query)
        target = (params.get("url") or [""])[0].strip()

        secret = os.environ.get("MEDIA_RESOLVER_SECRET")
        provided = self.headers.get("x-resolver-secret")
        if not secret or provided != secret:
            return self._send(401, {"ok": False, "error": "notAllowed"})

        if not target or not _host_allowed(target):
            return self._send(400, {"ok": False, "error": "unsupportedSource"})

        try:
            return self._send(200, _resolve(target))
        except Exception as exc:  # noqa: BLE001 - every failure is reported the same way
            message = str(exc)
            private = any(
                needle in message.lower()
                for needle in ("login required", "empty media response", "private", "rate-limit", "not available")
            )
            return self._send(
                200,
                {"ok": False, "error": "mediaUnavailable" if private else "resolveFailed", "detail": message[:300]},
            )

    def _send(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)
