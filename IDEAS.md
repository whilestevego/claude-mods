# Mod ideas

Suggestions for Claude Code mods (plugins in `~/.claude/mods/`). ✅ = built.

## Built

- ✅ **session-id**: session ID in the footer; click copies the ID, ctrl-click copies `claude --resume <id>`, pointer hand on hover (Ghostty/Kitty/foot).
- ✅ **context-bar**: context window bar above the prompt; hover swaps the row to the legend.
- ✅ **turn-receipt**: time, tools, files edited, tokens and cost on each turn's "Baked for…" line.
- ✅ **rate-limits**: 5-hour and weekly usage gauges under the context bar, warning at 90%.
- ✅ **voice**: Claude speaks through murmur: turn summaries, needs-you, background tasks, check-ins, rate-limit warnings, /read, /tldr-aloud, /hush; quiet unless you're away; a voice per session.
- ✅ **tldr**: a one-line Haiku TL;DR under long replies; voice speaks the same line.
- ✅ **ghostty**: tab title summary; tab progress bar; ❓ and a notification when Claude waits on you; background tint by permission mode; `/goto` between Claude sessions.

## Staying in flow

- **🔔 Done ping**: native notification and sound when a turn over 30s finishes while Ghostty isn't focused.

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

## Repo and workflow

- **🧹 Commit-ready check**: `/ready` runs lint, type checks and tests, shows a pass/fail panel and suggests a commit message.
- **📮 Session inbox**: pane of your other live Claude sessions with "message" and "hand off task" buttons.

## Just for fun

- **🐣 Tamagotchi**: a critter above the prompt that's happy when tests pass, sad on errors, sleepy as context fills.

## Ghostty

- **🎨 Session hues**: each session's background gets its own faint hue, matching its voice, so tabs are recognizable at a glance.
- **🔔 Attention bell**: ring the bell when Claude waits on you; Ghostty's `bell-features` bounce the dock and mark the tab.
- **📺 Live panes**: long-running background commands (dev server, test watcher, logs) open in a small split instead of running hidden.
- **🐚 `/shell`**: a split or the quick terminal in the session's folder.
- **🔍 `/diff`**: a split with `git diff`, `delta` or `lazygit` on the files the last turn changed.
- **🔐 Secure input**: Ghostty's Secure Keyboard Entry on while you type a secret Claude asked for.
- **🌳 Worktree tabs**: the git worktree's name in the tab title.
- **📥 `/grab`**: pull the neighbouring split's screen or scrollback (a failing server, a stack trace) into the prompt.
- **🎯 Ask about this**: select text in any Ghostty pane, press a key, and it lands in Claude's prompt as a quote.
- **▶️ Run in split**: a button on Claude's shell code blocks that runs them in a split you can watch, instead of through Claude.
- **🗂️ Workspaces**: `/workspace save` remembers your Ghostty tabs of Claude sessions (folder and resume ID); `/workspace open` brings them all back.
- **🍴 `/fork-tab`**: open a new tab continuing this conversation as a fork, to try an alternative side by side.
- **🚀 `/spawn <task>`**: open a new tab with a fresh Claude session on a task, titled after it, for parallel work.
- **🧭 Waiting first in /goto**: sessions waiting on you (❓) at the top of the picker, with how long they've waited.
- **⌨️ Keybind installer**: add Ghostty keybinds that type into Claude (⌘. for /hush, ⌘G for /goto).
- **🖼️ Image previews**: screenshots and images Claude reads or makes, shown inline through Ghostty's image support.
- **🔗 Clickable paths**: `file.ts:42` in Claude's replies becomes a link that opens your editor at that line.
- **🖌️ Cursor state**: the cursor's color shows busy or idle, the subtlest status indicator there is.
- **🎤 Presentation mode**: `/present` bumps the font and hides the bars for screen sharing and pairing; again to undo.
- **🌗 Theme sync**: the mods' colors follow your Ghostty theme, light or dark.

