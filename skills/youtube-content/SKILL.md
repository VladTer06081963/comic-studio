---
name: youtube-content
description: "YouTube transcripts to summaries, threads, blogs."
platforms: [linux, macos, windows]
---

# YouTube Content Tool

## When to use

Use when user shares a YouTube URL and asks to summarize, transcribe, or reformat video content.

## Fetch Transcript

```bash
/opt/data/skills/media/youtube-content/scripts/get_transcript.sh "URL" ru
```

Возвращает чистый текст в stdout. Cookies и все флаги уже внутри скрипта.
Если нет русских субтитров — убери `ru` (скачает любые доступные).

## Output Formats

- **Summary**: краткое резюме 5-10 предложений
- **Chapters**: тематические блоки с таймкодами
- **Blog post**: статья с заголовком и разделами
- **Thread**: пронумерованные посты до 280 символов
- **Quotes**: заметные цитаты с таймкодами

## Workflow

1. Запусти скрипт через `terminal`, получи текст
2. Преобразуй в запрошенный формат
3. Если скрипт вернул ERROR — субтитры отключены или видео недоступно

## Notes

- Cookies: `/opt/data/www.youtube.com_cookies.txt` (Chrome-аккаунт Влада)
- Зависимости: `yt-dlp`, `python3` — уже установлены
