"""Fuzzy scenario resolver for AiPULT.

Резолвит сценарий по title/context без обращения к LLM. Используется
chat-панелью, чтобы пользователь мог ссылаться на комикс по названию,
а не по 8-char hex ID.

Паттерн: GitHub Copilot suggestions — AI советует, человек подтверждает.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Optional

try:
    from rapidfuzzy import fuzz as _fuzz
    _FUZZ_BACKEND = 'rapidfuzzy'
except ImportError:  # pragma: no cover
    try:
        from thefuzz import fuzz as _fuzz
        _FUZZ_BACKEND = 'thefuzz'
    except ImportError:
        raise RuntimeError(
            "scenario_resolver requires rapidfuzzy or thefuzz. "
            "Install one via `pip install rapidfuzzy` (preferred) or `pip install thefuzz`."
        )


def _partial_ratio(needle: str, haystack: str) -> float:
    """Compatibility shim: rapidfuzzy and thefuzz both expose `partial_ratio`."""
    return float(_fuzz.partial_ratio(needle, haystack))

from py.lib.config import scenarios_dir
from py.lib.logging_setup import setup

logger = setup("lib.scenario_resolver")

ID_RE = re.compile(r"^[A-Za-z0-9_-]{4,64}$")
RECENCY_TOKENS = ("последний", "последняя", "последнее", "последнего", "latest", "last")
STATES = ("draft", "approved", "rejected", "rendered", "published")
TITLE_FLOOR = 60
CONTEXT_WEIGHT = 0.7
AMBIGUITY_GAP = 10
CONTEXT_PREVIEW_CHARS = 200
DEFAULT_LIMIT = 5

RESOLUTION_METHODS = (
    "explicit_id",
    "title_match",
    "context_match",
    "recency",
)


def _load_all_scenarios() -> list[dict]:
    """Сканирует data/scenarios/{state}/*.json и возвращает list[dict]."""
    out: list[dict] = []
    for state in STATES:
        d = scenarios_dir(state)
        if not d.exists():
            continue
        for path in d.glob("*.json"):
            try:
                rec = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                logger.warning(
                    "scenario_resolver.skip_malformed",
                    extra={"path": str(path), "code": "MALFORMED", "error": str(exc)},
                )
                continue
            if not isinstance(rec, dict) or "id" not in rec or "title" not in rec:
                logger.warning(
                    "scenario_resolver.skip_incomplete",
                    extra={"path": str(path), "code": "INCOMPLETE"},
                )
                continue
            rec.setdefault("status", state)
            out.append(rec)
    return out


# === Natural-language phrase handling =========================================
# Drop Russian/English stop words + intent verbs + common UI nouns so that
# "поменяй стиль у Роза и Яша на star" reduces to "роза яша star" and
# matches scenario titled "Роза и Яша". Tokens < 2 chars dropped.
STOP_WORDS = frozenset({
    # Russian stop words
    "у", "на", "и", "в", "с", "по", "для", "это", "что", "как", "а", "но",
    "или", "же", "бы", "ли", "не", "ни", "то", "он", "она", "они", "мы", "вы",
    "я", "ты", "мне", "тебе", "ему", "ей", "нам", "вам", "их", "его", "ее",
    "из", "от", "до", "за", "над", "под", "при", "без", "через", "между",
    "тот", "этот", "такой", "какой", "весь", "все", "всё", "кто", "где",
    "когда", "чтобы", "потому", "если", "только", "уже", "ещё", "еще", "так",
    "там", "тут", "здесь", "там", "очень", "просто", "сейчас", "можно",
    # English stop words
    "the", "a", "an", "of", "to", "in", "on", "at", "for", "by", "with",
    "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
    "do", "does", "did", "will", "would", "could", "should", "may", "might",
    "i", "you", "he", "she", "it", "we", "they", "my", "your", "his", "its",
    "our", "their", "this", "that", "these", "those",
    # Common UI/intent verbs (don't help matching)
    "поменяй", "сделай", "измени", "удали", "добавь", "убери", "создай",
    "покажи", "найди", "запусти", "открой", "закрой", "сделать", "поменять",
    "изменить", "узнать", "посмотреть", "рендери", "нарисуй", "стиль",
    "стиле", "стиля", "стильу", "комикс", "комикса", "комиксы", "комиксе",
    "стиль", "цвет", "цвета", "картинку", "картинки", "файл", "файла",
    "make", "change", "show", "find", "delete", "create", "render", "open",
    "style", "color", "image", "file",
})


def _extract_keywords(phrase: str) -> list[str]:
    """Drop stop words + intent verbs, keep meaningful tokens (≥2 chars)."""
    tokens = re.findall(r"[а-яёa-z0-9]+", phrase.lower())
    return [t for t in tokens if t not in STOP_WORDS and len(t) >= 2]


def _best_score(needle: str, haystack: str) -> float:
    """Best partial_ratio score over (whole, each keyword, each bigram) of needle.

    Uses _extract_keywords to drop stop words + 1-char tokens before
    per-token scoring — otherwise "the" matches "The Mysterious Glitch"
    and "to" matches "story" with 100% (false positives).
    """
    if not haystack or not needle:
        return 0.0
    needle = needle.lower()
    haystack = haystack.lower()
    tokens = _extract_keywords(needle)
    best = _partial_ratio(needle, haystack) if tokens else 0.0
    for tok in tokens:
        s = _partial_ratio(tok, haystack)
        if s > best:
            best = s
    for i in range(len(tokens) - 1):
        bigram = f"{tokens[i]} {tokens[i+1]}"
        s = _partial_ratio(bigram, haystack)
        if s > best:
            best = s
    return float(best)


def _score(phrase: str, scenario: dict) -> tuple[float, str]:
    """Возвращает (score, method) — max(title, context*0.7). 0-100 шкала.

    Использует _best_score для natural-language queries:
    пробует whole phrase, каждый token, каждую bigram, и берёт MAX.
    Это позволяет "поменяй стиль у Роза и Яша на star" резолвить в "Роза и Яша".
    """
    title = str(scenario.get("title", ""))
    context = str(scenario.get("context", ""))[:CONTEXT_PREVIEW_CHARS]

    title_score = _best_score(phrase, title)
    context_score = _best_score(phrase, context) * CONTEXT_WEIGHT if context else 0

    if title_score >= context_score:
        return float(title_score), "title_match"
    return float(context_score), "context_match"


def _is_recency_phrase(phrase: str) -> bool:
    p = phrase.lower()
    return any(token in p for token in RECENCY_TOKENS)


def resolve_scenario(
    phrase: str,
    *,
    limit: int = DEFAULT_LIMIT,
    recency_status: str = "rendered",
    scenarios: Optional[list[dict]] = None,
) -> list[dict]:
    """Резолвит сценарий по phrase.

    Args:
        phrase: пользовательская фраза ("кот", "последний rendered", "8eaa57cc")
        limit: максимум кандидатов (default 5)
        recency_status: какой статус использовать для recency fallback
        scenarios: опциональный уже-загруженный список (для тестов)

    Returns:
        list[dict] — кандидаты, отсортированные по (confidence desc, created_at desc).
        Каждый dict: {id, title, status, confidence, resolution_method,
        ambiguity?, created_at}
    """
    if not _FUZZ_BACKEND:
        raise RuntimeError(
            "rapidfuzzy or thefuzz is required for scenario_resolver. "
            "Install one via `pip install rapidfuzzy` (preferred) or `pip install thefuzz`."
        )

    if not isinstance(phrase, str):
        raise TypeError("phrase must be a string")
    phrase = phrase.strip()
    if not phrase:
        return []

    scenarios = scenarios if scenarios is not None else _load_all_scenarios()

    # 1. Explicit ID short-circuit (also matches when ID is embedded in phrase,
    #    e.g. "покажи сценарий 8eaa57cc" or "view 8eaa57cc please")
    id_candidates = ID_RE.findall(phrase)
    for candidate_id in id_candidates:
        for sc in scenarios:
            if sc.get("id") == candidate_id:
                return [{
                    "id": sc["id"],
                    "title": sc.get("title", ""),
                    "status": sc.get("status", ""),
                    "confidence": 1.0,
                    "resolution_method": "explicit_id",
                    "created_at": sc.get("created_at", ""),
                }]

    # 2. Title/context fuzzy match
    scored: list[tuple[float, str, dict]] = []
    for sc in scenarios:
        score, method = _score(phrase, sc)
        if score >= TITLE_FLOOR:
            scored.append((score, method, sc))

    # Sort by (score desc, created_at desc)
    scored.sort(
        key=lambda item: (
            -item[0],
            -_parse_ts(item[2].get("created_at", "")),
        )
    )
    top = scored[:limit]

    # 3. Recency fallback если ничего не нашлось
    if not top and _is_recency_phrase(phrase):
        matching = [s for s in scenarios if s.get("status") == recency_status]
        if not matching and recency_status != "published":
            # fallback на latest published
            matching = [s for s in scenarios if s.get("status") == "published"]
        if matching:
            matching.sort(key=lambda s: -_parse_ts(s.get("created_at", "")))
            latest = matching[0]
            return [{
                "id": latest["id"],
                "title": latest.get("title", ""),
                "status": latest.get("status", recency_status),
                "confidence": 0.5,
                "resolution_method": "recency",
                "created_at": latest.get("created_at", ""),
            }]
        return []

    if not top:
        return []

    # 4. Build candidates + disambiguation flag
    candidates: list[dict] = []
    for score, method, sc in top:
        candidates.append({
            "id": sc["id"],
            "title": sc.get("title", ""),
            "status": sc.get("status", ""),
            "confidence": round(score / 100.0, 4),
            "resolution_method": method,
            "created_at": sc.get("created_at", ""),
        })

    if len(candidates) >= 2:
        top_conf = candidates[0]["confidence"] * 100
        second_conf = candidates[1]["confidence"] * 100
        if abs(top_conf - second_conf) < AMBIGUITY_GAP:
            for c in candidates[:2]:
                c["ambiguity"] = True

    return candidates


def _parse_ts(value: str) -> int:
    """Парсит ISO-8601 timestamp в epoch seconds. Возвращает 0 при ошибке."""
    if not value:
        return 0
    try:
        from datetime import datetime
        # Поддержка naive и tz-aware ISO строк
        cleaned = value.replace("Z", "+00:00")
        dt = datetime.fromisoformat(cleaned)
        return int(dt.timestamp())
    except (ValueError, TypeError):
        return 0


__all__ = [
    "resolve_scenario",
    "RESOLUTION_METHODS",
    "TITLE_FLOOR",
    "CONTEXT_WEIGHT",
    "AMBIGUITY_GAP",
    "ID_RE",
    "RECENCY_TOKENS",
    "_FUZZ_BACKEND",
]
