# python-render-drawthings-client Specification (delta)

## Purpose
Модуль `py/render/drawthings_client.py` — HTTP-клиент к локальному Draw Things
(Stable Diffusion WebUI API) для генерации изображений. Зеркалит интерфейс
`generate_image` в `py/render/minimax_client.py:17` чтобы `provider_router` мог
переключаться без изменения вызывающего кода. Дополнительно поддерживает LoRA
(для Stalker, Pixar, и т.д.) и фиксированный seed для consistency.

## Requirements

### Requirement: Stable Diffusion txt2img
Система SHALL предоставлять функцию `generate_image(prompt, output_path, aspect_ratio="16:9", seed=None, lora=None, sampler="DPM++ SDE Karras", steps=20, cfg_scale=7) -> Path` в `py/render/drawthings_client.py`.

Делает `POST {DRAWTHINGS_BASE_URL}/sdapi/v1/txt2img` с payload:
```json
{
  "prompt": "<prompt>",
  "negative_prompt": "blurry, low quality, text, watermark",
  "seed": <seed or -1>,
  "sampler_name": "<sampler>",
  "steps": <steps>,
  "cfg_scale": <cfg_scale>,
  "width": <w>,
  "height": <h>,
  "override_settings": {"sd_model_lora": "<lora filename>"}  // только если lora != None
}
```

Headers: `Content-Type: application/json`. Без auth (Draw Things локальный).

Возвращает `Path(output_path)`, записанный из base64-декодированного
`response.json()["images"][0]`.

#### Scenario: Successful generation
- **WHEN** Draw Things отвечает 200 с `images[0]` (base64 PNG)
- **THEN** PNG декодируется и пишется в `output_path`, функция возвращает `Path`

#### Scenario: Aspect ratio mapping
- **WHEN** `aspect_ratio="16:9"` передан
- **THEN** payload использует `width=1024, height=576`
- **AND** `aspect_ratio="1:1"` → `1024x1024`
- **AND** `aspect_ratio="9:16"` → `576x1024`

#### Scenario: LoRA override
- **WHEN** `lora="stalker_sdxl_lora_f16.ckpt"` передан
- **THEN** payload содержит `override_settings.sd_model_lora = "stalker_sdxl_lora_f16.ckpt"`

#### Scenario: Random seed if None
- **WHEN** `seed=None`
- **THEN** payload использует `seed=-1` (Draw Things выберет случайный)

### Requirement: Error semantics
Функция SHALL бросать `DTRuntimeError(Exception)` (определён в этом модуле) при:
- HTTP status != 200
- Таймаут (env `DRAWTHINGS_TIMEOUT`, default 120 сек)
- JSON parse error ответа
- Отсутствии `images[0]` в ответе

#### Scenario: Draw Things down
- **WHEN** Draw Things не запущен, `requests` бросает `ConnectionError`
- **THEN** функция бросает `DTRuntimeError("Draw Things unavailable: <reason>")`

#### Scenario: HTTP 422 (invalid params)
- **WHEN** Draw Things вернул 422
- **THEN** функция бросает `DTRuntimeError("Draw Things HTTP 422: <body>")`

### Requirement: Env defaults
- `DRAWTHINGS_BASE_URL` default `"http://192.168.55.1:7860"`
- `DRAWTHINGS_TIMEOUT` default `"120"` (seconds)

#### Scenario: Env not set, defaults used
- **WHEN** ни одна env var не установлена
- **THEN** функция пытается подключиться к `http://192.168.55.1:7860` с timeout 120s
