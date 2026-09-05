# python-scenario-lmstudio-client Specification (delta)

## Purpose
Модуль `py/scenario/lmstudio_client.py` — клиент к LM Studio через OpenAI-совместимый
API для текстовой генерации. Зеркалит интерфейс `_call_minimax_chat` в
`py/scenario/writer.py:81` чтобы `provider_router` мог переключаться без изменения
вызывающего кода.

## Requirements

### Requirement: OpenAI-compatible chat completion
Система SHALL предоставлять функцию `_call_lmstudio_chat(system: str, user: str, model: str | None = None) -> str` в `py/scenario/lmstudio_client.py`.

Делает `POST {LM_BASE_URL}/v1/chat/completions` с payload:
```json
{
  "model": "<model or env LM_MODEL>",
  "messages": [
    {"role": "system", "content": "<system>"},
    {"role": "user", "content": "<user>"}
  ],
  "temperature": 0.8,
  "max_tokens": 2048
}
```

Headers: `Authorization: Bearer {LM_API_KEY}`, `Content-Type: application/json`.

Возвращает `response.json()["choices"][0]["message"]["content"]`.

#### Scenario: Successful completion
- **WHEN** LM Studio отвечает 200 с `choices[0].message.content = "Hello"`
- **THEN** функция возвращает `"Hello"`

#### Scenario: Default model from env
- **WHEN** `model=None` и env `LM_MODEL=magnum-picaro-0.7-v3-12b-i1`
- **THEN** payload использует `"magnum-picaro-0.7-v3-12b-i1"`

#### Scenario: Model parameter override
- **WHEN** вызвано с `model="qwen2.5-7b"`
- **THEN** payload использует `"qwen2.5-7b"` независимо от env

### Requirement: Error semantics
Функция SHALL бросать `LMRuntimeError(Exception)` (определён в этом модуле) при:
- HTTP status != 200
- Таймаут (120 сек)
- JSON parse error ответа
- Отсутствии `choices[0].message.content`

#### Scenario: Connection refused
- **WHEN** LM Studio не запущен, `requests` бросает `ConnectionError`
- **THEN** функция бросает `LMRuntimeError("LM Studio unavailable: <reason>")`

#### Scenario: HTTP 500
- **WHEN** LM Studio вернул 500
- **THEN** функция бросает `LMRuntimeError("LM Studio HTTP 500: <body>")`

### Requirement: Env defaults
- `LM_BASE_URL` default `"http://192.168.55.1:1234"`
- `LM_API_KEY` default `"lm-studio"` (LM Studio игнорирует, но клиенты требуют)
- `LM_MODEL` default `"magnum-picaro-0.7-v3-12b-i1"`

#### Scenario: Env not set, defaults used
- **WHEN** ни одна env var не установлена
- **THEN** функция использует defaults и пытается подключиться к `http://192.168.55.1:1234`
