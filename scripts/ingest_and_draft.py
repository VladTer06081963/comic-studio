"""Главная точка входа: ingest контекста → сценарий → черновик.

Использование:
    python scripts/ingest_and_draft.py --url "https://example.com/article"
    python scripts/ingest_and_draft.py --youtube "https://youtu.be/..."
    python scripts/ingest_and_draft.py --freeform "Идея комикса: пожарный спасает котёнка"
    python scripts/ingest_and_draft.py --file path/to/context.txt
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

# Позволяет запускать как `python scripts/ingest_and_draft.py` из корня проекта
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from py.ingest.url import fetch_url
from py.ingest.youtube import transcribe_youtube
from py.ingest.freeform import save_freeform
from py.scenario.writer import generate_scenario, save_scenario
from py.lib.logging_setup import setup
from py.lib import notion_sync

logger = setup("scripts.ingest_and_draft")

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def _notify_telegram(message: str) -> None:
    """Send a message via Telegram bot if token is configured."""
    import os
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "1045621572")
    if not token:
        logger.warning("TELEGRAM_BOT_TOKEN not set, skipping notification")
        return
    try:
        import urllib.request
        import urllib.parse
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        payload = json.dumps({
            "chat_id": chat_id,
            "text": message,
            "parse_mode": "Markdown",
        }).encode("utf-8")
        req = urllib.request.Request(
            url, data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read())
            if result.get("ok"):
                logger.info("Telegram notification sent")
            else:
                logger.error(f"Telegram error: {result}")
    except Exception as e:
        logger.error(f"Telegram notification failed: {e}")


def _format_scenario_message(sc: dict) -> str:
    panels = "\n".join(
        f"  {p['n']}. _{p['caption']}_" for p in sc.get("panels", [])
    )
    return (
        f"🎨 *Новый сценарий* (id: `{sc['id']}`)\n\n"
        f"*{sc.get('title', 'Untitled')}*\n"
        f"Tone: {sc.get('tone', 'epic')} | "
        f"Style: {sc.get('style', 'star')} | "
        f"Layout: {sc.get('layout', 'comic')}\n\n"
        f"Панели:\n{panels}\n\n"
        f"Источник: {sc.get('source', 'unknown')}\n\n"
        f"Отправьте ID `{sc['id']}` боту для просмотра с кнопками ✅✏️❌"
    )


def main():
    ap = argparse.ArgumentParser(description="Ingest context → draft scenario")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--url", help="URL статьи или блога")
    src.add_argument("--youtube", help="YouTube URL для транскрибации")
    src.add_argument("--freeform", help="Свободный текст как контекст")
    src.add_argument("--file", help="Путь к файлу с контекстом")

    ap.add_argument("--tone", choices=["epic", "funny", "educational", "dark", "whimsical"])
    ap.add_argument("--style", choices=["star", "bubble", "gothic", "boom", "memo", "bar"], help="Стиль подписей")
    ap.add_argument("--image-style", choices=["cartoon", "anime", "comic", "realistic", "watercolor"], default="comic", help="Стиль изображений (default: comic)")
    ap.add_argument("--panels", type=int, default=3, help="Количество панелей (3-4)")
    ap.add_argument("--seed", type=int, help="Seed для детерминированного рендера")
    ap.add_argument("--skip-notify", action="store_true", help="Пропустить Telegram-уведомление")
    args = ap.parse_args()

    # 1. Ingest
    if args.url:
        context = fetch_url(args.url)
        source_meta = {"source": "url", "source_url": args.url}
    elif args.youtube:
        context = transcribe_youtube(args.youtube)
        source_meta = {"source": "youtube", "source_url": args.youtube}
    elif args.freeform:
        if not args.freeform.strip():
            raise ValueError("--freeform text cannot be empty")
        save_freeform(args.freeform)
        context = args.freeform
        source_meta = {"source": "freeform"}
    else:
        context = Path(args.file).read_text(encoding="utf-8")
        source_meta = {"source": "file", "source_path": args.file}

    # 2. Scenario
    scenario = generate_scenario(
        context,
        tone=args.tone,
        style=args.style,
        image_style=args.image_style,
        num_panels=args.panels,
    )
    scenario.update(source_meta)
    if args.seed is not None:
        scenario["seed"] = args.seed

    # 3. Persist draft
    out_path = save_scenario(scenario, status="draft")
    print(f"\n✅ Draft saved → {out_path}")
    print(f"   ID: {scenario['id']}")
    print(f"   Title: {scenario['title']}")
    print(f"   Tone: {scenario['tone']}, Caption: {scenario['style']}, Image: {scenario['image_style']}, "
          f"Panels: {len(scenario['panels'])}")

    # 4. Notion mirror (optional, no-op if not configured)
    try:
        page_id = notion_sync.sync_scenario(scenario)
        if page_id:
            scenario["notion_page_id"] = page_id
            logger.info(f"Notion scenario page: {page_id}")
    except Exception as e:
        logger.warning(f"Notion sync skipped: {e}")

    # 5. Telegram notification (only after successful persistence)
    if not args.skip_notify:
        msg = _format_scenario_message(scenario)
        _notify_telegram(msg)
        print(f"\n📬 Уведомление отправлено в Telegram\n")
    else:
        print(f"\n→ Запустите Telegram-бот и утвердите сценарий:")
        print(f"   node tg-bot/bot.js")
        print(f"   или отправьте ID {scenario['id']} вручную боту.\n")


if __name__ == "__main__":
    main()
