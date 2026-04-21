# Braintime AI Team — Setup Instructions

## What Was Created

```
braintime-ai-setup/
├── CLAUDE.md                → Copy to repo root (local Claude Code reads this)
├── CODEX.md                 → Copy to repo root (Codex reads this)
├── SETUP-INSTRUCTIONS.md   → This file
└── .ai/
    ├── workflow.md          → Team workflow reference
    ├── server-context.md    → Server Claude primer
    ├── gemini-review.md     → Paste to Gemini as context when reviewing
    ├── tasks.md             → DEPRECATED — tasks live in GitHub Issues now
    └── handoffs/
        └── from-server/     → Legacy — now using GitHub Issues instead
```

## One-Time Setup

### Step 1 — Create GitHub Labels (run on your Mac)

```bash
gh label create "ai-task" --color "0075ca" --description "Task created by Server Claude" --repo brianmindslab/braintime
gh label create "P0-critical" --color "d73a4a" --description "Production crash or security hole" --repo brianmindslab/braintime
gh label create "P1-important" --color "e4e669" --description "Important feature or significant bug" --repo brianmindslab/braintime
gh label create "P2-enhancement" --color "a2eeef" --description "Enhancement or improvement" --repo brianmindslab/braintime
gh label create "P3-nice-to-have" --color "cfd3d7" --description "Polish or future idea" --repo brianmindslab/braintime
gh label create "for-claude-code" --color "6f42c1" --description "Assigned to local Claude Code" --repo brianmindslab/braintime
gh label create "for-codex" --color "e99695" --description "Assigned to Codex (isolated branch)" --repo brianmindslab/braintime
gh label create "needs-review" --color "f9d0c4" --description "Ready for Gemini review" --repo brianmindslab/braintime
gh label create "in-progress" --color "0e8a16" --description "Being worked on" --repo brianmindslab/braintime
gh label create "deployed" --color "1d76db" --description "Verified in production by Server Claude" --repo brianmindslab/braintime
```

### Step 2 — Copy Files to Repo (run on your Mac)

Transfer files from the server first:
```bash
scp -r user@server-ip:/home/aiagent/braintime-ai-setup/* ~/path/to/braintime/
```

Then commit them:
```bash
cd ~/path/to/braintime
git add CLAUDE.md CODEX.md .ai/
git commit -m "add AI team coordination system"
git push origin main
```

### Step 3 — Local Claude Code

Open Claude Code in the repo. It reads `CLAUDE.md` automatically.
First thing to tell it:
```
Check GitHub issues: gh issue list --repo brianmindslab/braintime --label "ai-task"
Start with P0-critical issues first.
```

### Step 4 — Codex

Open Codex, point it at the repo. It reads `CODEX.md` automatically.
Give it tasks labeled `for-codex` from GitHub Issues.

### Step 5 — Gemini

No setup needed. When you want a review:
1. Paste the contents of `.ai/gemini-review.md` as the first message
2. Then paste: `gh pr diff <number> --repo brianmindslab/braintime`
3. Ask: "Review this PR"

### Step 6 — Server Claude (new session)

Start a new session and say:
```
Read /opt/braintime/.ai/server-context.md to restore your context.
Then check: gh issue list --repo brianmindslab/braintime --label "ai-task" --state open
```

---

## Day-to-Day

| You Want To | Do This |
|-------------|---------|
| Fix a production bug | Tell Server Claude → it creates a GitHub Issue → Local Claude Code fixes it |
| Build a new feature | Server Claude creates issue → Local Claude Code or Codex executes |
| Review a PR | `gh pr diff <N>` → paste to Gemini with gemini-review.md context |
| Check task status | `gh issue list --label "ai-task"` or visit GitHub Issues |
| Plan next sprint | Ask Server Claude — it reads live code + open issues |
| Verify a fix is live | Ask Server Claude — it checks docker logs |

## The Communication Flow

```
Server Claude
  → creates GitHub Issues (diagnosis + exact fix instructions)
  → verifies deployed fixes

Local Claude Code
  → reads GitHub Issues
  → implements fixes/features
  → commits with "closes #N"
  → pushes → auto-deploys

Codex
  → reads GitHub Issues labeled for-codex
  → implements on feature branches
  → opens PRs

Gemini
  → reviews PRs labeled needs-review
  → returns structured feedback

You
  → direct all AIs
  → approve merges
  → final decision on everything
```
