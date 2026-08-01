"""Транскрибация YouTube через yt-dlp + Voicebox (STT) или готовые субтитры.

Стратегия:
1. Попробовать скачать авто-субтитры (быстро, бесплатно).
2. Если субтитров нет — скачать аудио и транскрибировать через Voicebox (mlx-whisper на Apple Silicon).
3. Если Voicebox недоступен — whisper (PyTorch, тяжёлый).
"""
from __future__ import annotations

import json
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

from py.lib.logging_setup import setup

logger = setup("ingest.youtube")

VOICEBOX_URL = "http://127.0.0.1:17493"
MAX_TRANSCRIPT_CHARS = 30_000


def _extract_video_id(url: str) -> str:
    patterns = [
        r"(?:v=|\/)([0-9A-Za-z_-]{11}).*",
        r"^([0-9A-Za-z_-]{11})$",
        r"youtu\.be\/([0-9A-Za-z_-]{11})",
    ]
    for pat in patterns:
        m = re.search(pat, url)
        if m:
            return m.group(1)
    raise ValueError(f"Cannot extract video id from: {url!r}")


def _fetch_subs(video_id: str, workdir: Path) -> Optional[str]:
    """Пробует скачать готовые субтитры. Возвращает текст или None."""
    logger.info(f"Trying auto-subs for {video_id}")
    cmd = [
        "yt-dlp",
        "--write-auto-sub",
        "--sub-lang", "ru,en",
        "--sub-format", "vtt",
        "--skip-download",
        "-o", str(workdir / "%(id)s.%(ext)s"),
        f"https://www.youtube.com/watch?v={video_id}",
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=60)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        logger.warning(f"yt-dlp subs failed: {e}")
        return None

    vtt_files = list(workdir.glob("*.vtt"))
    if not vtt_files:
        logger.info("No subtitles found")
        return None

    vtt = vtt_files[0].read_text(encoding="utf-8")
    lines = []
    for line in vtt.split("\n"):
        line = line.strip()
        if not line or line.startswith("WEBVTT") or "-->" in line:
            continue
        line = re.sub(r"<[^>]+>", "", line)
        if line:
            lines.append(line)
    text = " ".join(lines)
    logger.info(f"Got {len(text)} chars from subs")
    return text


def _transcribe_voicebox(audio_path: Path, language: str = "ru") -> Optional[str]:
    """Транскрибирует через Voicebox API (mlx-whisper). Возвращает текст или None."""
    import urllib.request
    import urllib.parse

    logger.info(f"Trying Voicebox transcription for {audio_path}")
    try:
        with open(audio_path, "rb") as f:
            audio_data = f.read()

        boundary = "----VoiceboxFormBoundary7MA4YWxkTrZu0gW"
        body = b""
        body += f"--{boundary}\r\n".encode()
        body += f'Content-Disposition: form-data; name="file"; filename="{audio_path.name}"\r\n'.encode()
        body += b"Content-Type: audio/mpeg\r\n\r\n"
        body += audio_data
        body += f"\r\n--{boundary}--\r\n".encode()

        req = urllib.request.Request(
            f"{VOICEBOX_URL}/transcribe",
            data=body,
            headers={
                "Content-Type": f"multipart/form-data; boundary={boundary}",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=300) as resp:
            result = json.loads(resp.read())
            text = result.get("text", "").strip()
            logger.info(f"Voicebox: {len(text)} chars, {result.get('duration', '?')}s")
            return text
    except Exception as e:
        logger.warning(f"Voicebox transcription failed: {e}")
        return None


def _fetch_audio_and_transcribe(video_id: str, workdir: Path, language: str = "ru") -> Optional[str]:
    """Скачивает аудио и транскрибирует: Voicebox → whisper fallback."""
    audio_path = workdir / f"{video_id}.mp3"
    logger.info(f"Downloading audio to {audio_path}")

    cmd = [
        "yt-dlp",
        "-x", "--audio-format", "mp3",
        "-o", str(workdir / "%(id)s.%(ext)s"),
        f"https://www.youtube.com/watch?v={video_id}",
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=300)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        logger.error(f"yt-dlp audio failed: {e}")
        return None

    if not audio_path.exists():
        candidates = list(workdir.glob(f"{video_id}.*"))
        if not candidates:
            logger.error("No audio file produced")
            return None
        audio_path = candidates[0]

    # 1. Пробуем Voicebox (mlx-whisper, быстро, без PyTorch)
    text = _transcribe_voicebox(audio_path, language)
    if text:
        return text

    # 2. Fallback: whisper (PyTorch)
    logger.info("Voicebox unavailable, falling back to whisper")
    try:
        import whisper
        model = whisper.load_model("base")
        result = model.transcribe(str(audio_path), language=None)
        return result.get("text", "")
    except ImportError:
        logger.error("whisper not installed; pip install openai-whisper")
        return None


def transcribe_youtube(url: str, language: str = "ru") -> str:
    """Транскрибирует YouTube-видео. Возвращает текст."""
    video_id = _extract_video_id(url)
    with tempfile.TemporaryDirectory() as tmp:
        workdir = Path(tmp)

        # 1. Субтитры (приоритет)
        text = _fetch_subs(video_id, workdir)
        if text:
            if len(text) > MAX_TRANSCRIPT_CHARS:
                text = text[:MAX_TRANSCRIPT_CHARS]
            return text

        # 2. Транскрибация: Voicebox → whisper
        logger.info("No subs, transcribing audio")
        text = _fetch_audio_and_transcribe(video_id, workdir, language)
        if not text:
            raise RuntimeError(f"Failed to transcribe {url}")

        if len(text) > MAX_TRANSCRIPT_CHARS:
            logger.info(f"Transcript {len(text)} chars exceeds {MAX_TRANSCRIPT_CHARS}, truncating")
            text = text[:MAX_TRANSCRIPT_CHARS]
        return text


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python -m py.ingest.youtube <YOUTUBE_URL>")
        sys.exit(1)
    print(transcribe_youtube(sys.argv[1])[:2000])
