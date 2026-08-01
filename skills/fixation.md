---
title: Конвенция «Фиксация» — стандартная процедура закрытия задачи
created: 2026-07-29
updated: 2026-08-01
type: convention
tags: [convention, fixation, workflow, audit, tasks, openspec]
aliases: [фиксация, fixation, закрытие задачи, task closure, процедура, procedure, зафиксировать]
---

# Фиксация (Fixation)

**Фиксация** — стандартная процедура полного закрытия и документирования любой задачи в проекте `summaryProjects`. Обязательна для всех мутирующих задач.

## Процедура (4 шага)

### 1. OpenSpec Change (если задача затрагивает код/спек)

```bash
# Создать change и все артефакты
openspec new change "<kebab-case-name>"
openspec instructions proposal --change "<name>" --json   → создать proposal.md
openspec instructions design --change "<name>" --json     → создать design.md
openspec instructions specs --change "<name>" --json      → создать specs/*.md
openspec instructions tasks --change "<name>" --json      → создать tasks.md

# Реализация
openspec instructions apply --change "<name>" --json
# ... реализовать задачи, отмечать [x] в tasks.md ...

# Синхронизация + архивация
# (sync delta specs → main specs)
openspec/changes/<name>/ → mv в archive/YYYY-MM-DD-<name>/
```

### 2. Аудит в `summary/audit/`

Создать файл: `summary/audit/<NNN>_<slug>.md`

```markdown
# Аудит: <тема>

## 1. Контекст
## 2. Что сделано
## 3. Статус
```

### 3. Задачи в `summary/tasks/`

Создать/обновить: `summary/tasks/<NNN>_<slug>.md`

```markdown
# Задачи: <тема>

## Статус: Active

| ID | Задача | Оценка | Статус |
|---|---|---|---|
| 1 | ... | ... | ✅ Done |
```

### 4. Git Commit

```bash
git add <все файлы задачи>
git commit -m "<type>: <description>"
```

## Объём фиксации

| Что | Где |
|-----|-----|
| Аудит (что сделано, выводы) | `summary/audit/` |
| Задачи (план, статус) | `summary/tasks/` |
| OpenSpec change | `openspec/changes/` → `archive/` |
| OpenSpec specs | `openspec/specs/` |
| Код/скрипты | `<project>/` |
| Git | `commit` |

## Признак завершения

Фиксация считается выполненной когда:
1. ✅ Все 4 шага пройдены
2. ✅ Git clean (только файлы задачи закоммичены)
3. ✅ `openspec validate --specs` — все новые спеки валидны
