#!/usr/bin/env bash
set -euo pipefail

# ─── Three-Agent E2E Dogfood Test ─────────────────────────────────────────────
#
# Tests the full Spandrel experience with three agents:
#   1. BUILDER  — follows BOOTSTRAP.md cold, builds a KG about Spandrel
#   2. REVIEWER — evaluates the KG as information architect, context engineer,
#                 and analyst (the three Spandrel roles)
#   3. EXPLORER — connects to the MCP blind, tries to learn and use the graph
#
# Usage:
#   ./test/e2e-dogfood/run.sh              # run all three agents
#   ./test/e2e-dogfood/run.sh build        # builder only
#   ./test/e2e-dogfood/run.sh review       # reviewer only (needs prior build)
#   ./test/e2e-dogfood/run.sh explore      # explorer only (needs prior build)
#
# Options:
#   KEEP=1 ./test/e2e-dogfood/run.sh       # don't clean up the KG after
#   MODEL=sonnet ./test/e2e-dogfood/run.sh # use a specific model
#   KG_DIR=/path ./test/e2e-dogfood/run.sh # use existing KG dir
# ──────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SPANDREL_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROMPTS_DIR="$SCRIPT_DIR/prompts"
RESULTS_DIR="$SCRIPT_DIR/results"
MODEL="${MODEL:-sonnet}"
PHASE="${1:-all}"

# KG directory — ephemeral by default, overridable
if [ -n "${KG_DIR:-}" ]; then
  TEST_KG_DIR="$KG_DIR"
  echo "Using existing KG dir: $TEST_KG_DIR"
else
  TEST_KG_DIR=$(mktemp -d "${TMPDIR:-/tmp}/spandrel-dogfood-XXXXXX")
  echo "Created KG dir: $TEST_KG_DIR"
fi

mkdir -p "$RESULTS_DIR"

# Timestamp for this run
RUN_ID=$(date +%Y%m%d-%H%M%S)

cleanup() {
  # Kill dev server if running
  if [ -n "${DEV_PID:-}" ]; then
    kill "$DEV_PID" 2>/dev/null || true
    wait "$DEV_PID" 2>/dev/null || true
  fi
  # Clean up KG dir unless KEEP=1 or user provided KG_DIR
  if [ -z "${KEEP:-}" ] && [ -z "${KG_DIR:-}" ]; then
    echo "Cleaning up $TEST_KG_DIR"
    rm -rf "$TEST_KG_DIR"
  else
    echo "KG preserved at: $TEST_KG_DIR"
  fi
}
trap cleanup EXIT

# ─── Helpers ──────────────────────────────────────────────────────────────────

prepare_prompt() {
  local template="$1"
  sed -e "s|TEST_KG_DIR|$TEST_KG_DIR|g" \
      -e "s|SPANDREL_DIR|$SPANDREL_DIR|g" \
      "$template"
}

run_agent() {
  local name="$1"
  local prompt_file="$2"
  local output_file="$RESULTS_DIR/${RUN_ID}-${name}.txt"

  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "  $name agent starting"
  echo "  Model: $MODEL"
  echo "  KG: $TEST_KG_DIR"
  echo "═══════════════════════════════════════════════════════════════"
  echo ""

  local prompt
  prompt=$(prepare_prompt "$prompt_file")

  echo "$prompt" | claude \
    --print \
    --model "$MODEL" \
    --settings '{"hooks":{}}' \
    --dangerously-skip-permissions \
    --no-session-persistence \
    --add-dir "$SPANDREL_DIR" \
    --add-dir "$TEST_KG_DIR" \
    2>&1 | tee "$output_file"

  echo ""
  echo "─── $name agent finished ───"
  echo "Output saved: $output_file"
  echo ""
}

start_dev_server() {
  echo "Starting dev server..."
  cd "$SPANDREL_DIR"
  npx tsx src/cli.ts dev "$TEST_KG_DIR" &
  DEV_PID=$!

  # Wait for server to be ready
  for i in {1..30}; do
    if curl -s http://localhost:4000/graphql -X POST \
      -H "Content-Type: application/json" \
      -d '{"query":"{ node(path:\"/\") { name } }"}' > /dev/null 2>&1; then
      echo "Dev server ready (PID $DEV_PID)"
      return 0
    fi
    sleep 1
  done
  echo "ERROR: Dev server failed to start"
  return 1
}

stop_dev_server() {
  if [ -n "${DEV_PID:-}" ]; then
    kill "$DEV_PID" 2>/dev/null || true
    wait "$DEV_PID" 2>/dev/null || true
    unset DEV_PID
    echo "Dev server stopped"
  fi
}

# ─── Ensure build is ready ───────────────────────────────────────────────────

echo "Checking Spandrel build..."
cd "$SPANDREL_DIR"
if [ ! -d "dist" ] || [ "src/cli.ts" -nt "dist/cli.js" ]; then
  echo "Building..."
  npm run build
fi
echo "Build OK"

# ─── Run phases ──────────────────────────────────────────────────────────────

if [ "$PHASE" = "all" ] || [ "$PHASE" = "build" ]; then
  run_agent "BUILDER" "$PROMPTS_DIR/builder.md"

  # Quick sanity check — did the builder create anything?
  if [ ! -f "$TEST_KG_DIR/index.md" ]; then
    echo "ERROR: Builder did not create index.md. Aborting."
    exit 1
  fi
  echo "Builder created $(find "$TEST_KG_DIR" -name 'index.md' | wc -l | tr -d ' ') index.md files"
fi

if [ "$PHASE" = "all" ] || [ "$PHASE" = "review" ]; then
  start_dev_server
  run_agent "REVIEWER" "$PROMPTS_DIR/validator.md"
  stop_dev_server
fi

if [ "$PHASE" = "all" ] || [ "$PHASE" = "explore" ]; then
  start_dev_server
  run_agent "EXPLORER" "$PROMPTS_DIR/explorer.md"
  stop_dev_server
fi

# ─── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  E2E Dogfood Test Complete"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  KG dir:    $TEST_KG_DIR"
echo "  Results:   $RESULTS_DIR/${RUN_ID}-*.txt"
echo ""

# Print reports if they exist
for report in "$TEST_KG_DIR"/.build-report.json "$TEST_KG_DIR"/.validation-report.json "$TEST_KG_DIR"/.explorer-report.json; do
  if [ -f "$report" ]; then
    echo "  $(basename "$report"):"
    cat "$report" | python3 -m json.tool 2>/dev/null || cat "$report"
    echo ""
  fi
done
