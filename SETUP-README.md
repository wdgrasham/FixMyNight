# FixMyNight — Claude Code Commands Setup

## What's In This Folder

This is your clean project folder, ready to use with Claude Code. Everything is
in the right place already.

## Folder Structure

```
FixMyNight/
├── CLAUDE.md                              ← Claude Code reads this automatically every session
├── SETUP-README.md                        ← You're reading this
├── specs/                                 ← All 9 spec documents (V1.6, source of truth)
│   ├── MASTER-SPEC.md
│   ├── DATABASE-SCHEMA.md
│   ├── BACKEND-SPEC.md
│   ├── VAPI-PROMPT-SPEC.md
│   ├── FRONTEND-SPEC.md
│   ├── DEPLOYMENT-SPEC.md
│   ├── QA-AND-LAUNCH.md
│   ├── DECISIONS-AND-CHANGES.md
│   └── CLAUDE-SESSION-GUIDE.md            ← Was originally your CLAUDE.md (renamed to avoid collision)
└── .claude/
    └── commands/
        ├── fixmynight-audit.md            ← /project:fixmynight-audit
        ├── fixmynight-review.md           ← /project:fixmynight-review
        ├── fixmynight-validate-code.md    ← /project:fixmynight-validate-code
        ├── fixmynight-status.md           ← /project:fixmynight-status
        ├── fixmynight-decision.md         ← /project:fixmynight-decision
        └── fixmynight-phase.md            ← /project:fixmynight-phase
```

## What Each File Does

**CLAUDE.md** (root) — New file. Claude Code reads this automatically when you
start a session. It gives Claude the full project context: what FixMyNight is,
where the specs are, the 10 architecture rules, and key build patterns. You
never have to re-explain the project.

**CLAUDE-SESSION-GUIDE.md** (in specs/) — Your original CLAUDE.md, renamed.
It has the build order, current status tracker, Stellar HVAC values, and
environment variable reference. The commands read this when they need to check
project status or build phase details.

## How to Use

1. Open Claude Code with this folder as your working directory
2. Type any command, for example: `/project:fixmynight-status`
3. Claude reads the specs from disk and gives you a report

## Command Quick Reference

| Command | What It Does |
|---------|-------------|
| `/project:fixmynight-audit` | Full cross-document consistency check across all 9 specs |
| `/project:fixmynight-review FILENAME` | Check one spec file against the other 8 |
| `/project:fixmynight-validate-code FILEPATH` | Compare code against the relevant spec |
| `/project:fixmynight-status` | Where am I in the build? What's next? What's blocked? |
| `/project:fixmynight-decision DESCRIPTION` | Log a new decision to DECISIONS-AND-CHANGES.md |
| `/project:fixmynight-phase NUMBER` | Detailed walkthrough of a specific build phase (1-5) |

## When You Start Building

Your code directories (app/, frontend/, etc.) will live alongside specs/ and
CLAUDE.md in this same folder. The commands know where to look for everything.
