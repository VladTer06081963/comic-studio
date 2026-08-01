#!/usr/bin/env bash
# cron/nightly.sh — ежедневный выпуск серии комиксов.
#
# Запуск через Hermes cron или системный crontab:
#   0 2 * * * /Users/vladteresena/Projects/comic-studio/cron/nightly.sh
#
# Использование:
#   bash cron/nightly.sh           # обычный запуск
#   bash cron/nightly.sh --dry-run # показать план без side effects
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

BATCH_SIZE="${CRON_BATCH_SIZE:-3}"
DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

# Подгружаем .env
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  . "$PROJECT_ROOT/.env"
  set +a
fi

log() { echo "[$(date -u +%FT%T)] $*"; }

report() {
  local total=$1 succ=$2 fail=$3 skip=$4
  echo ""
  echo "=== Comic Studio nightly summary ==="
  echo "  Timestamp: $(date -u +%FT%TZ)"
  echo "  Total:     $total"
  echo "  ✅ Passed: $succ"
  echo "  ❌ Failed: $fail"
  echo "  ⊘ Skipped: $skip"
}

# ── Collect approved scenarios ──────────────────────────────────────────────────
if [ -d "$PROJECT_ROOT/data/scenarios/approved" ]; then
  mapfile -t APPROVED < <(ls -1t "$PROJECT_ROOT/data/scenarios/approved/"*.json 2>/dev/null || true)
  SELECTED=("${APPROVED[@]:0:$BATCH_SIZE}")
else
  SELECTED=()
fi

if [ ${#SELECTED[@]} -eq 0 ]; then
  log "No approved scenarios, nothing to do."
  report 0 0 0 0
  exit 0
fi

log "Project: $PROJECT_ROOT"
log "Batch size: $BATCH_SIZE (of ${#APPROVED[@]} approved)"
log "Dry run: $DRY_RUN"
echo

if $DRY_RUN; then
  echo "=== DRY RUN — no side effects ==="
  for f in "${SELECTED[@]}"; do
    sid=$(basename "$f" .json)
    title=$(node -e "const s=require('fs').readFileSync('$f','utf-8'); console.log(JSON.parse(s).title||'untitled')" 2>/dev/null || echo "???")
    panels=$(node -e "const s=require('fs').readFileSync('$f','utf-8'); console.log(JSON.parse(s).panels?.length||'?')" 2>/dev/null || echo "?")
    echo "  Would process: $sid — $title (${panels} panels)"
  done
  echo ""
  echo "=== Would do ==="
  echo "  1. Render ${#SELECTED[@]} scenarios"
  echo "  2. Publish rendered scenarios"
  echo "  3. Archive to data/archive/$(date +%Y-%m-%d)/"
  echo "  4. Send Telegram summary"
  exit 0
fi

# ── Nightly run ────────────────────────────────────────────────────────────────
START_TS=$(date -u +%FT%TZ)
TODAY=$(date +%Y-%m-%d)
ARCHIVE_DIR="$PROJECT_ROOT/data/archive/$TODAY"
mkdir -p "$ARCHIVE_DIR"

# Активируем venv если есть
if [ -d "$PROJECT_ROOT/.venv" ]; then
  source "$PROJECT_ROOT/.venv/bin/activate"
fi

SUCCESS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
SUMMARY_IDS=()

for f in "${SELECTED[@]}"; do
  sid=$(basename "$f" .json)
  log "[$sid] Starting..."

  # Render (isolated — failure does not stop the batch)
  set +e
  render_out=$(python "$PROJECT_ROOT/scripts/render_approved.py" --scenario-id "$sid" 2>&1)
  render_rc=$?
  set -e

  if [ $render_rc -ne 0 ]; then
    log "[$sid] ❌ render failed (rc=$render_rc): $render_out"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    SUMMARY_IDS+=("❌ $sid")
    continue
  fi

  log "[$sid] ✅ rendered"

  # Publish (isolated)
  set +e
  publish_out=$(node "$PROJECT_ROOT/scripts/publish_rendered.js" 2>&1)
  publish_rc=$?
  set -e

  if [ $publish_rc -ne 0 ]; then
    log "[$sid] ⚠️  publish failed (rc=$publish_rc): $publish_out"
    # Comic is rendered, mark as failed for summary but don't block archive
    FAIL_COUNT=$((FAIL_COUNT + 1))
    SUMMARY_IDS+=("⚠️ $sid (rendered, publish failed)")
  else
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    SUMMARY_IDS+=("✅ $sid")
  fi

  # Archive (copy — does not remove source; safe to repeat)
  # Archive the scenario file if it still exists
  for status_dir in draft approved rejected rendered published; do
    scenario_file="$PROJECT_ROOT/data/scenarios/$status_dir/${sid}.json"
    if [ -f "$scenario_file" ]; then
      archive_dest="$ARCHIVE_DIR/${status_dir}-${sid}.json"
      if [ ! -f "$archive_dest" ]; then
        cp "$scenario_file" "$archive_dest"
        log "[$sid] Archived: $archive_dest"
      fi
      break
    fi
  done

  # Archive comic PNG
  for comic_file in "$PROJECT_ROOT/data/comics/${sid}.png" \
                    "$PROJECT_ROOT/data/comics/${sid}/"*.png; do
    [ -f "$comic_file" ] || continue
    bn=$(basename "$comic_file")
    archive_comic="$ARCHIVE_DIR/$bn"
    if [ ! -f "$archive_comic" ]; then
      cp "$comic_file" "$archive_comic"
      log "[$sid] Archived comic: $bn"
    fi
  done
done

# ── Telegram summary ───────────────────────────────────────────────────────────
SUMMARY_TEXT="📊 *Nightly run* $(date +%Y-%m-%d)\n\n"
SUMMARY_TEXT+="Total: $((SUCCESS_COUNT + FAIL_COUNT)) | ✅ $SUCCESS_COUNT | ❌ $FAIL_COUNT\n\n"
for line in "${SUMMARY_IDS[@]}"; do
  SUMMARY_TEXT+="$line\n"
done

node "$PROJECT_ROOT/scripts/notify_telegram.js" "$SUMMARY_TEXT" 2>/dev/null || \
  log "Telegram summary failed to send"

report $((SUCCESS_COUNT + FAIL_COUNT)) "$SUCCESS_COUNT" "$FAIL_COUNT" "$SKIP_COUNT"
log "Done at $(date -u +%FT%TZ)"
