---
name: youtube-content
description: Транскрибация YouTube через supadata.ai API. Используй для получения текста из YouTube видео для создания комиксов.
allowed-tools: Bash
license: MIT
compatibility: Comic Studio
metadata:
  author: comic-studio
  version: "1.0"
  triggers: [youtube, ютуб, видео, транскрипт, transcript]
---

# YouTube Content — Транскрибация видео

## Использование

Для получения транскрипта YouTube видео используй:

```bash
cd /Users/vladteresena/Projects/comic-studio
source .venv/bin/activate
python -m py.ingest.youtube "https://www.youtube.com/watch?v=VIDEO_ID"
```

Или напрямую в Python:
```python
from py.ingest.youtube import transcribe_youtube
text = transcribe_youtube("https://www.youtube.com/watch?v=VIDEO_ID")
```

## Методы (в порядке приоритета)

1. **supadata.ai API** — быстрый, без скачивания
2. **yt-dlp субтитры** — бесплатный, если субтитры включены
3. **Аудио + Voicebox/whisper** — последний fallback

## Требования

- `SUPADATA_API_KEY` в `.env` (для supadata API)
- `yt-dlp` в PATH
- `openai-whisper` (опционально, для fallback)

## Получение API ключа

1. Зарегистрируйся на https://supadata.ai
2. Получи API ключ
3. Добавь в `.env`:
   ```
   SUPADATA_API_KEY=твой_ключ
   ```

## Пример

```
Пользователь: https://www.youtube.com/watch?v=ABC123

Агент: Получаю транскрипт...
source .venv/bin/activate && python -m py.ingest.youtube "https://www.youtube.com/watch?v=ABC123"
→ [текст транскрипта]
```

## Обработка ошибок

- "Supadata error" — нет API ключа или видео недоступно
- "No subtitles found" — субтитры отключены
- "yt-dlp audio failed" — видео недоступно для скачивания

Если supadata не работает — видео приватное или регионально заблокировано.
