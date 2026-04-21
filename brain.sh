#!/usr/bin/env bash
# brain — local CLI for the Brainminds Orchestrator
# Usage: brain [status|logs|watch|pause|resume|kill <issue>|ssh]

SERVER="root@116.203.251.28"
KEY="$HOME/.ssh/id_ed25519_personalai"
ORCH="http://localhost:3001"
SSH="ssh -i $KEY -o ConnectTimeout=5 $SERVER"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

cmd="${1:-status}"

# ── helpers ────────────────────────────────────────────────────────────────────

orch_get()  { $SSH "curl -s $ORCH/$1" 2>/dev/null; }
orch_post() { $SSH "curl -s -X POST $ORCH/$1 -H 'Content-Type: application/json' -d '${2:-{}}'"; }

pm2_status() {
  $SSH "pm2 list --no-color 2>&1" | grep -E "(online|stopped|errored)" | \
    awk '{printf "  %-20s %s\n", $2, $18}'
}

print_status() {
  local raw
  raw=$(orch_get "status")
  local paused agents
  paused=$(echo "$raw" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("paused", False))' 2>/dev/null)
  agents=$(echo "$raw" | python3 -c '
import sys, json
d = json.load(sys.stdin)
for a in d.get("agents", []):
    elapsed = ""
    try:
        import datetime
        start = datetime.datetime.fromisoformat(a["startedAt"].replace("Z","+00:00"))
        secs = int((datetime.datetime.now(datetime.timezone.utc) - start).total_seconds())
        elapsed = f" ({secs//60:02d}:{secs%60:02d})"
    except: pass
    cf = f" — {a[\"currentFile\"]}" if a.get("currentFile") else ""
    print(f"  {a[\"agentName\"]:10s} #{a[\"issueNumber\"]}{elapsed}{cf}")
' 2>/dev/null)

  echo ""
  echo -e "${BOLD}Brainminds Orchestrator${RESET}"
  echo -e "${DIM}$(date)${RESET}"
  echo ""

  echo -e "${BOLD}PM2 Processes${RESET}"
  pm2_status

  echo ""
  if [[ "$paused" == "True" ]]; then
    echo -e "${BOLD}Orchestrator:${RESET} ${YELLOW}⏸  PAUSED${RESET}"
  else
    echo -e "${BOLD}Orchestrator:${RESET} ${GREEN}▶  RUNNING${RESET}"
  fi

  echo ""
  echo -e "${BOLD}Active Agents${RESET}"
  if [[ -z "$agents" ]]; then
    echo -e "  ${DIM}None${RESET}"
  else
    echo -e "${GREEN}$agents${RESET}"
  fi
  echo ""
}

# ── commands ───────────────────────────────────────────────────────────────────

case "$cmd" in

  status|s)
    print_status
    ;;

  watch|w)
    echo -e "${DIM}Watching — Ctrl+C to exit${RESET}"
    while true; do
      clear
      print_status
      echo -e "${DIM}Refreshing every 5s — Ctrl+C to exit${RESET}"
      sleep 5
    done
    ;;

  logs|l)
    PROCESS="${2:-orchestrator}"
    echo -e "${DIM}Tailing $PROCESS logs — Ctrl+C to exit${RESET}"
    $SSH "pm2 logs $PROCESS --raw" 2>/dev/null
    ;;

  pause|p)
    echo -n "Pausing orchestrator... "
    result=$(orch_post "pause")
    paused=$(echo "$result" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("paused"))' 2>/dev/null)
    [[ "$paused" == "True" ]] && echo -e "${YELLOW}⏸  Paused${RESET}" || echo -e "${RED}Failed${RESET}"
    ;;

  resume|r)
    echo -n "Resuming orchestrator... "
    result=$(orch_post "resume")
    paused=$(echo "$result" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("paused"))' 2>/dev/null)
    [[ "$paused" == "False" ]] && echo -e "${GREEN}▶  Running${RESET}" || echo -e "${RED}Failed${RESET}"
    ;;

  kill|k)
    ISSUE="$2"
    if [[ -z "$ISSUE" ]]; then
      echo -e "${RED}Usage: brain kill <issue-number>${RESET}"
      exit 1
    fi
    echo -n "Killing agent for issue #$ISSUE... "
    result=$(orch_post "kill/$ISSUE")
    ok=$(echo "$result" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("ok"))' 2>/dev/null)
    [[ "$ok" == "True" ]] && echo -e "${GREEN}Killed${RESET}" || echo -e "${YELLOW}Not running${RESET}"
    ;;

  stop)
    echo -n "Stopping PM2 orchestrator process... "
    $SSH "pm2 stop orchestrator" > /dev/null 2>&1 && echo -e "${RED}Stopped${RESET}" || echo -e "${RED}Failed${RESET}"
    ;;

  start)
    echo -n "Starting PM2 orchestrator process... "
    $SSH "pm2 start orchestrator" > /dev/null 2>&1 && echo -e "${GREEN}Started${RESET}" || echo -e "${RED}Failed${RESET}"
    ;;

  restart)
    echo -n "Restarting PM2 orchestrator... "
    $SSH "pm2 restart orchestrator" > /dev/null 2>&1 && echo -e "${GREEN}Restarted${RESET}" || echo -e "${RED}Failed${RESET}"
    ;;

  ssh)
    exec $SSH
    ;;

  help|--help|-h|"")
    echo ""
    echo -e "${BOLD}brain — Brainminds Orchestrator CLI${RESET}"
    echo ""
    echo "  brain status          Show PM2 + agent state"
    echo "  brain watch           Live dashboard (refresh every 5s)"
    echo "  brain logs            Tail orchestrator logs"
    echo "  brain logs control    Tail control-panel logs"
    echo "  brain pause           Pause — stop picking up new issues"
    echo "  brain resume          Resume polling"
    echo "  brain kill <issue>    Kill a specific running agent"
    echo "  brain stop            PM2 stop orchestrator"
    echo "  brain start           PM2 start orchestrator"
    echo "  brain restart         PM2 restart orchestrator"
    echo "  brain ssh             Open a shell on the builder server"
    echo ""
    ;;

  *)
    echo -e "${RED}Unknown command: $cmd${RESET}"
    echo "Run 'brain help' for usage."
    exit 1
    ;;

esac
