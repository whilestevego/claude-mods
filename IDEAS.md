# Mod ideas

Suggestions for Claude Code mods (plugins in `~/.claude/mods/`). ✅ = built.

## Built

- ✅ **session-id**: session ID in the footer; click copies the ID, ctrl-click copies `claude --resume <id>`, pointer hand on hover (Ghostty/Kitty/foot).
- ✅ **context-bar**: context window bar above the prompt; hover swaps the row to the legend.
- ✅ **turn-receipt**: time, tools, files edited, tokens and cost on each turn's "Baked for…" line.
- ✅ **rate-limits**: 5-hour and weekly usage gauges under the context bar, warning at 90%.
- ✅ **voice**: Claude speaks through murmur: turn summaries, needs-you, background tasks, check-ins, rate-limit warnings, /read, /tldr-aloud, /hush; quiet unless you're away; a voice per session.
- ✅ **tab-title**: Ghostty tab title is a 3-word Haiku summary of the session, refreshed every few minutes.

## Staying in flow

- **🔔 Done ping**: native notification and sound when a turn over 30s finishes while Ghostty isn't focused.
- **📊 Tab progress**: Ghostty's tab progress bar while a turn runs; red on a failed tool call.
- **⏸️ Waiting-on-you alert**: ❓ badge on the tab title and a notification when Claude asks a question or needs permission.

## Safety and trust

- **🛡️ Guardrails**: block or ask before `rm -rf`, `git push --force`, `DROP`, `--no-verify`, edits to `.env` or lockfiles, with the reason inline.
- **🧪 Test gate**: after code edits, run the related tests quietly and tell Claude about failures before the turn ends.
- **🔐 Secret sniffer**: block API keys, tokens and private keys from being written to disk.
- **↩️ Turn undo**: snapshot files before each turn; `/undo-turn` rolls back the last turn's changes without git.
- **🌿 Branch guard**: warn before edits on `main`/`master` and offer to create a feature branch named after the task.

## Seeing what's happening

- **🧭 Files-touched pane**: side pane of every file read or edited this session, as a tree with diff counts; click to copy a path.
- **🗺️ Plan tracker**: Claude's todo list pinned above the prompt as a checklist with `3/7 ✓` progress.
- **📈 Session ledger**: `/ledger` pane with every turn's receipt and session totals.
- **🧠 Project memory panel**: which CLAUDE.md files and memories are loaded, with their size in tokens.

## Prompts in, answers out

- **📝 Prompt snippets**: `;;` opens a picker of saved prompts, kept across sessions.
- **📎 Context injector**: add the branch, uncommitted diff and last failing test output when a prompt says "this" or "the bug".
- **📋 Copy last answer**: one click or a shortcut copies Claude's last reply or its last code block.
- **🔎 TL;DR line**: a one-line Haiku summary under long replies.

## Repo and workflow

- **🧹 Commit-ready check**: `/ready` runs lint, type checks and tests, shows a pass/fail panel and suggests a commit message.
- **📮 Session inbox**: pane of your other live Claude sessions with "message" and "hand off task" buttons.

## Just for fun

- **🐣 Tamagotchi**: a critter above the prompt that's happy when tests pass, sad on errors, sleepy as context fills.
