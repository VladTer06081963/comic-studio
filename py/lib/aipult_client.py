"""AiPULT — Python-side MiniMax Text-01 wrapper с COMMAND_COOKBOOK.

Single source of truth для system prompt живёт здесь. Node-side импортирует
через subprocess: `python3 -c "from py.lib.aipult_client import route_command, ..."`.

Не вызывает побочных эффектов: только MiniMax chat API (или mock в тестах).
Не пишет в data/scenarios, data/comics, Telegram, Notion.
"""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime
from typing import Optional

from py.lib.config import MINIMAX_API_KEY, MINIMAX_BASE_URL
from py.lib.logging_setup import setup

logger = setup("lib.aipult_client")


# === Public errors ============================================================

class AipultRouterError(Exception):
    """Базовый класс для всех ошибок AiPULT router."""


class AipultInvalidResponse(AipultRouterError):
    """LLM вернул не-валидный JSON."""

    def __init__(self, raw_excerpt: str):
        super().__init__(f"LLM response is not valid JSON: {raw_excerpt[:200]!r}")
        self.raw_excerpt = raw_excerpt


class AipultForbiddenIntent(AipultRouterError):
    """LLM вернул intent не из ALLOWED_INTENTS."""

    def __init__(self, intent: str):
        super().__init__(f"Forbidden intent: {intent!r}")
        self.intent = intent


class AipultScenarioNotFound(AipultRouterError):
    """LLM выдумал scenario_id, которого нет в candidates."""

    def __init__(self, scenario_id: str):
        super().__init__(f"Scenario not found in candidates: {scenario_id!r}")
        self.scenario_id = scenario_id


class AipultLlmUnavailable(AipultRouterError):
    """MINIMAX_API_KEY не задан или HTTP-вызов упал после retries."""

    def __init__(self, reason: str):
        super().__init__(f"LLM unavailable: {reason}")
        self.reason = reason


# === Constants ================================================================

ALLOWED_INTENTS = frozenset({
    "restyle", "render", "revise", "view", "list",
    "approve", "publish", "delete", "stats",
})

ALLOWED_CAPTION_STYLES = frozenset({
    "bubble", "star", "gothic", "boom", "memo", "bar",
})

INTENT_REQUIRES_SCENARIO = frozenset({
    "restyle", "render", "revise", "view", "approve", "delete",
})

INTENT_TIME_COST = {
    "restyle": ("2-5 сек", "$0", True),
    "render":  ("1-2 мин", "~$0.10", False),
    "revise":  ("3-5 сек", "~$0.01", True),
    "view":    ("<1 сек", "$0", True),
    "list":    ("<1 сек", "$0", True),
    "approve": ("<1 сек", "$0", False),
    "publish": ("5-10 сек", "$0", False),
    "delete":  ("<1 сек", "$0", False),
    "stats":   ("<1 сек", "$0", True),
}


COMMAND_COOKBOOK = """
Ты — AI-ассистент Comic Studio. Твоя задача: подготовить КАРТОЧКУ
с терминальной командой. НИКОГДА не выполняй команды сам.

═══════════════════════════════════════════════════════════════════
ВАЖНО: РЕЗОЛВ СЦЕНАРИЙ ПО НАЗВАНИЮ, НЕ ПО ID
═══════════════════════════════════════════════════════════════════
Пользователи помнят НАЗВАНИЕ комикса ("Кот в одиночестве"),
но НЕ ПОМНЯТ 8-char hex ID ("8eaa57cc"). Если пользователь говорит
"кот", "виталик", "тот про Сашу" — найди подходящий сценарий
через fuzzy match на title и context. Список кандидатов с их id
и title будет передан в candidates.

Возвращай scenario_id ВСЕГДА (он нужен для команды), но в
explanation упоминал название для ясности.

Если кандидатов 2+ с похожим score — добавь warning с обоими.

═══════════════════════════════════════════════════════════════════
ДОСТУПНЫЕ КОМАНДЫ (intent):
═══════════════════════════════════════════════════════════════════

### restyle — сменить стиль баблов (быстро, 0 MiniMax cost)
Синтаксис: python3 scripts/restyle.py --scenario-id <ID> --style <bubble|star|gothic|boom|memo|bar>
Пример: python3 scripts/restyle.py --scenario-id 8eaa57cc --style gothic
Когда: пользователь хочет сменить визуальный стиль подписей без ре-рендера панелей

### render — запустить рендер approved сценария (MiniMax image-01, ~$0.05-0.10)
Синтаксис: python3 scripts/render_approved.py --scenario-id <ID> [--rerender --staging-dir <path>]
Пример: python3 scripts/render_approved.py --scenario-id 8eaa57cc
Когда: пользователь хочет сгенерировать PNG-панели через MiniMax

### revise — LLM-редакция approved/rendered сценария
Синтаксис: python3 scripts/revise_scenario.py --scenario-id <ID> --feedback "<text>"
Пример: python3 scripts/revise_scenario.py --scenario-id 8eaa57cc --feedback "Сделать смешнее"
Когда: пользователь хочет изменить сценарий (re-render после re-approval)

### view — показать сценарий (instant, 0 cost)
Синтаксис: GET /api/scenarios/<ID>
Когда: пользователь хочет посмотреть JSON

### list — список сценариев по статусу
Синтаксис: GET /api/scenarios?status=<draft|approved|rendered|published|rejected|all>
Когда: пользователь хочет увидеть все сценарии (с id+title)

### approve — утвердить draft
Синтаксис: POST /api/scenarios/<ID>/approve

### publish — опубликовать rendered
Синтаксис: node scripts/publish_rendered.js
Требует SITE_API_URL в .env

### delete — удалить (НЕОБРАТИМО)
Синтаксис: DELETE /api/scenarios/<ID>
DESTRUCTIVE

### stats — статистика
Синтаксис: GET /api/stats

═══════════════════════════════════════════════════════════════════
ФОРМАТ ОТВЕТА (строго JSON, без markdown-обёртки):
═══════════════════════════════════════════════════════════════════
{
  "intent": "restyle",
  "scenario_id": "8eaa57cc",
  "style": "gothic",
  "command": "python3 scripts/restyle.py --scenario-id 8eaa57cc --style gothic",
  "explanation": "Сменит стиль баблов «Кот в одиночестве» с bubble на gothic",
  "warnings": []
}

═══════════════════════════════════════════════════════════════════
ЗАПРЕЩЕНО:
═══════════════════════════════════════════════════════════════════
- Генерировать command с rm, mv, curl|wget, env|grep, /etc/, .env
- Возвращать intent вне ALLOWED_INTENTS
- Возвращать scenario_id, которого нет в candidates
- Оборачивать ответ в ```json ... ``` (верни только JSON)
"""


# === LLM transport ============================================================

def _call_minimax_chat(system: str, user: str, *, model: str = "MiniMax-Text-01") -> str:
    """Минимальный вызов MiniMax chat API (compatible mode). Re-uses pattern from
    `py/scenario/writer.py` but stays decoupled (own import) to allow mocking.
    """
    import requests

    if not MINIMAX_API_KEY:
        raise AipultLlmUnavailable("MINIMAX_API_KEY not set")

    base = MINIMAX_BASE_URL or "https://api.minimax.io"
    url = f"{base}/v1/text/chatcompletion_v2"
    headers = {
        "Authorization": f"Bearer {MINIMAX_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.4,  # ниже чем scenario writer — нам нужна точная команда
        "max_tokens": 1024,
    }
    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=30)
    except requests.RequestException as exc:
        raise AipultLlmUnavailable(f"network error: {exc}") from exc

    if resp.status_code >= 500:
        raise AipultLlmUnavailable(f"HTTP {resp.status_code}: {resp.text[:200]}")

    try:
        data = resp.json()
    except ValueError as exc:
        raise AipultLlmUnavailable(f"non-JSON response: {exc}") from exc

    if "choices" in data and data["choices"]:
        return data["choices"][0]["message"]["content"]
    if "base_resp" in data and data["base_resp"].get("status_code") != 0:
        raise AipultLlmUnavailable(f"API error: {data['base_resp']}")
    raise AipultLlmUnavailable(f"Unexpected response: {data}")


def _extract_json(text: str) -> dict:
    """Извлекает JSON из ответа LLM, даже если обёрнут в ```json ... ```."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise AipultInvalidResponse(text) from exc


# === Command card construction ================================================

def _find_candidate(scenario_id: str, candidates: list[dict]) -> Optional[dict]:
    for c in candidates or []:
        if c.get("id") == scenario_id:
            return c
    return None


def _command_for(intent: str, scenario_id: str, **kwargs) -> str:
    """Строит exact shell command для intent + scenario_id. Не доверяем LLM-у. """
    if intent == "restyle":
        style = kwargs.get("style", "bubble")
        if style not in ALLOWED_CAPTION_STYLES:
            style = "bubble"
        return f"python3 scripts/restyle.py --scenario-id {scenario_id} --style {style}"
    if intent == "render":
        return f"python3 scripts/render_approved.py --scenario-id {scenario_id}"
    if intent == "revise":
        feedback = kwargs.get("feedback", "")
        # Эскейпим двойные кавычки в feedback
        safe = feedback.replace('"', '\\"')
        return f'python3 scripts/revise_scenario.py --scenario-id {scenario_id} --feedback "{safe}"'
    if intent == "view":
        return f"GET /api/scenarios/{scenario_id}"
    if intent == "list":
        status = kwargs.get("status", "all")
        return f"GET /api/scenarios?status={status}"
    if intent == "approve":
        return f"POST /api/scenarios/{scenario_id}/approve"
    if intent == "publish":
        return "node scripts/publish_rendered.js"
    if intent == "delete":
        return f"DELETE /api/scenarios/{scenario_id}"
    if intent == "stats":
        return "GET /api/stats"
    raise AipultForbiddenIntent(intent)


def _build_card(
    payload: dict,
    candidates: list[dict],
) -> dict:
    """Валидирует и обогащает LLM payload → CommandCard."""
    intent = payload.get("intent")
    if intent not in ALLOWED_INTENTS:
        raise AipultForbiddenIntent(str(intent))

    scenario_id = payload.get("scenario_id")
    if intent in INTENT_REQUIRES_SCENARIO:
        if not scenario_id or not re.match(r"^[A-Za-z0-9_-]{4,64}$", str(scenario_id)):
            raise AipultScenarioNotFound(str(scenario_id))

    # Резолвим кандидат
    resolved = None
    if scenario_id:
        cand = _find_candidate(str(scenario_id), candidates)
        if cand is None and intent != "list":
            raise AipultScenarioNotFound(str(scenario_id))
        if cand is not None:
            resolved = {
                "id": cand["id"],
                "title": cand.get("title", ""),
                "status": cand.get("status", ""),
                "confidence": cand.get("confidence", 1.0),
                "resolution_method": cand.get("resolution_method", "explicit_id"),
            }

    # Строим command из наших helpers (не доверяем LLM-у)
    kwargs = {}
    if "style" in payload:
        kwargs["style"] = payload["style"]
    if "feedback" in payload:
        kwargs["feedback"] = payload["feedback"]
    if "status" in payload:
        kwargs["status"] = payload["status"]

    command = _command_for(intent, str(scenario_id) if scenario_id else "ALL", **kwargs)

    # Time/cost/reversible
    est_time, est_cost, reversible = INTENT_TIME_COST.get(intent, ("<1 сек", "$0", True))

    explanation = str(payload.get("explanation", "")).strip()[:500]
    warnings = [str(w) for w in payload.get("warnings", [])][:5]

    # Disambiguation warning
    if resolved is None and intent in INTENT_REQUIRES_SCENARIO:
        # Если ID не нашли в candidates, scenario_id уже поднят
        pass

    related_artifacts = []
    if resolved and resolved["id"]:
        related_artifacts = [
            f"data/comics/{resolved['id']}.png",
            f"data/comics/{resolved['id']}.html",
        ]

    return {
        "card_id": uuid.uuid4().hex,
        "intent": intent,
        "command": command,
        "explanation": explanation or f"Команда: {intent}",
        "warnings": warnings,
        "estimated_time": est_time,
        "estimated_cost": est_cost,
        "reversible": reversible,
        "resolved_scenario": resolved,
        "related_artifacts": related_artifacts,
    }


# === Public entry point =======================================================

def route_command(
    user_message: str,
    candidates: list[dict],
    history: Optional[list[dict]] = None,
    *,
    chat_client=None,
) -> dict:
    """Генерирует CommandCard для user_message.

    Args:
        user_message: сырое сообщение пользователя ("поменяй стиль у кота на gothic")
        candidates: list[dict] с полями id, title, status, confidence, resolution_method.
                   Берётся из `py.lib.scenario_resolver.resolve_scenario(...)`.
        history: опциональная история чата [{role, content}, ...] (max 20).
        chat_client: опциональный callable для подмены MiniMax (для тестов).
                     Принимает (system, user) и возвращает string.

    Returns:
        CommandCard dict. См. PRD §7.3.
    """
    if not isinstance(user_message, str) or not user_message.strip():
        raise ValueError("user_message must be a non-empty string")
    if not isinstance(candidates, list):
        raise TypeError("candidates must be a list")

    history = (history or [])[:20]

    # Build user prompt: include candidates for LLM context
    cand_preview = json.dumps(
        [{"id": c.get("id"), "title": c.get("title"), "status": c.get("status")} for c in candidates[:10]],
        ensure_ascii=False,
    )
    history_text = "\n".join(
        f"[{h.get('role', 'user')}] {h.get('content', '')}" for h in history
    )

    user_prompt = (
        f"Кандидаты (выбери scenario_id из списка, не выдумывай):\n{cand_preview}\n\n"
        + (f"История чата:\n{history_text}\n\n" if history_text else "")
        + f"Сообщение пользователя: {user_message.strip()}\n\n"
        + "Верни ТОЛЬКО JSON (без ```json):"
    )

    # Call LLM (or mock)
    client = chat_client or _call_minimax_chat
    raw = client(COMMAND_COOKBOOK, user_prompt)
    payload = _extract_json(raw)

    # Build card (this validates intent + scenario_id)
    card = _build_card(payload, candidates)

    logger.info(
        "aipult.routed",
        extra={
            "intent": card["intent"],
            "scenario_id": card.get("resolved_scenario", {}).get("id") if card.get("resolved_scenario") else None,
            "card_id": card["card_id"],
            "candidate_count": len(candidates),
        },
    )

    return card


__all__ = [
    "COMMAND_COOKBOOK",
    "ALLOWED_INTENTS",
    "ALLOWED_CAPTION_STYLES",
    "AipultRouterError",
    "AipultInvalidResponse",
    "AipultForbiddenIntent",
    "AipultScenarioNotFound",
    "AipultLlmUnavailable",
    "route_command",
]
