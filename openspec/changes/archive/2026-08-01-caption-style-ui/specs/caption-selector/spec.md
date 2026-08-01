# Spec: Caption Style Selector

## Telegram Bot

### REQ-001: Buttons
После выбора image_style показать кнопки выбора caption_style.

### REQ-002: Caption Styles
6 стилей: bubble, star, gothic, boom, memo, bar.

### REQ-003: Default
По умолчанию `bubble`.

### REQ-004: Callback
`caption_<name>` callback.

### REQ-005: State
Сохранять caption_style в userState.

### REQ-006: Generation
Передавать `--style` в scripts/ingest_and_draft.py.

## Web UI

### REQ-007: Select
Добавить `<select id="caption-style">` в форму создания.