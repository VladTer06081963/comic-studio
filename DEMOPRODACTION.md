# Развертывание демо-продакшена (Demo Production)

Данный документ описывает процесс подготовки и деплоя проекта Comic Studio на минимальный сервер (VPS уровня 1 CPU / 1-2 GB RAM, например, минимальный тариф Oracle Cloud или любой дешевый сервер за $3).

Для работы на столь слабом железе необходимо отключить "тяжелые" локальные зависимости машинного обучения (в частности, локальный фоллбэк на Whisper), так как все основные ресурсоемкие задачи (LLM, генерация изображений) уже вынесены в API (MiniMax).

## 1. Системные требования и зависимости

*   **ОС:** Linux (Ubuntu 22.04 / 24.04 или Debian 12).
*   **Node.js:** v20+ (для бэкенда и Telegram-бота).
*   **Python:** 3.10+ (для рендеринга и скриптов).
*   **Менеджер процессов:** PM2 (для фонового запуска сервисов).

## 2. Адаптация кода (Заглушки / Stubs)

Чтобы проект не потреблял лишнюю оперативную память и не требовал установки тяжелых библиотек (PyTorch, FFmpeg), необходимо заглушить фоллбэк-логику в `py/ingest/youtube.py`.

Откройте файл `py/ingest/youtube.py` и найдите функцию `_fetch_audio_and_transcribe`. 
Замените её тело на "заглушку":

```python
def _fetch_audio_and_transcribe(video_id: str, workdir: Path, language: str = "ru") -> Optional[str]:
    # ЗАГЛУШКА ДЛЯ ДЕМО-ПРОДАКШЕНА
    # Отключаем загрузку yt-dlp и запуск whisper, чтобы не перегружать 1GB RAM сервер.
    logger.warning(f"Audio transcription for {video_id} is disabled in demo production.")
    return None
```

После этого из файла `py/requirements.txt` можно смело **удалить** строки:
- `yt-dlp>=2024.3.10`
- `openai-whisper>=20231117`

Это значительно ускорит установку зависимостей и сэкономит место и память на сервере.

## 3. Установка на сервере

Зайдите на сервер по SSH и выполните следующие шаги:

### Шаг 3.1: Клонирование и установка пакетов

```bash
# 1. Скачиваем проект
git clone <ваш-репозиторий> comic-studio
cd comic-studio

# 2. Устанавливаем зависимости Node.js
cd web && npm install
cd ../tg-bot && npm install
cd ..

# 3. Устанавливаем PM2 глобально
sudo npm install -g pm2

# 4. Настраиваем Python-окружение
python3 -m venv .venv
source .venv/bin/activate
pip install -r py/requirements.txt
```

### Шаг 3.2: Настройка окружения

Скопируйте пример конфига и заполните ключи:

```bash
cp .env.example .env
nano .env
```

Обязательные ключи для демо-сервера:
- `MINIMAX_API_KEY` — генерация текста и картинок.
- `TELEGRAM_BOT_TOKEN` — работа бота.
- `SUPADATA_API_KEY` — транскрибация YouTube (так как мы отключили локальный whisper).

## 4. Запуск процессов (PM2)

Чтобы веб-сервер и Telegram-бот работали в фоне и автоматически перезапускались при сбоях, используем PM2.

Находясь в корне проекта (`comic-studio`):

```bash
# Запускаем Web API и дашборд
pm2 start web/server.js --name "comic-web"

# Запускаем Telegram-бота
pm2 start tg-bot/bot.js --name "comic-tg"

# Сохраняем конфигурацию, чтобы она запускалась после ребута сервера
pm2 save
pm2 startup
```

## 5. Доступ к дашборду (Опционально: Nginx)

Web-интерфейс будет запущен на `http://IP_АДРЕС_СЕРВЕРА:3000/ui/`.
Для красивого доступа без порта (по 80 порту) можно настроить Nginx:

```bash
sudo apt install nginx
```

Конфиг `/etc/nginx/sites-available/comic-studio`:
```nginx
server {
    listen 80;
    server_name ваш-домен.com; # или IP сервера

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/comic-studio /etc/nginx/sites-enabled/
sudo systemctl reload nginx
```

## Итог
После этих шагов проект будет стабильно работать на минимальном VPS. Бэкенд на Node.js будет обслуживать UI, Python будет вызываться только по запросу для создания изображений, а вся тяжелая работа будет уходить в API провайдеров.
