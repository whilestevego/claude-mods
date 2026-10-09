# Mod ideas

Claude Code mods: what's built, and ideas for more. ✅ = built.

## Built

- ✅ **context-bar**: the context window as a colored bar above the prompt.
  - Hover the bar to swap it for the legend (what's using the space).
  - `/context-bar` hides or shows it.
- ✅ **rate-limits**: 5-hour and weekly usage meters under the context bar.
  - Yellow at 70%, red at 90%, and a warning once a limit passes 90%.
- ✅ **session-id**: the session ID in the footer, as `🏷️ <id>`.
  - Blue and underlined on hover, with a pointing-hand cursor (Ghostty, Kitty, foot).
  - Click copies the ID; ctrl-click copies `claude --resume <id>`.
- ✅ **turn-receipt**: a receipt on each turn's "Baked for…" line.
  - Tools run, files edited, tokens in and out, and the turn's cost.
- ✅ **tldr**: a one-sentence Haiku summary under long replies.
  - The voice mod speaks this same line, so a turn has one summary.
- ✅ **previews**: a `🖼 … hover to preview` line under each image Claude reads.
  - Hover it to see the picture inline, keeping its shape.
- ✅ **voice**: Claude speaks through [murmur](https://github.com/whilestevego/murmur), only when you're away.
  - Turn summaries, needs-you alerts, background tasks done, progress check-ins, rate-limit warnings.
  - `/read`, `/tldr-aloud`, `/hush`.
  - Each session gets its own voice; new speech cuts off old.
- ✅ **ghostty**: Ghostty integration, settings all under "Ghostty" in `/config`.
  - Tab title: a 4-word summary of the session; `/title` for a new one now; restored on resume.
  - Tab progress bar: follows the to-do list, red after a failed tool call.
  - ❓ in the tab and a notification when Claude waits on you (voice speaks it instead when on).
  - `/goto` (⌘⌃G): jump between sessions, waiting ones first; `/goto next` to the longest wait.
  - `/workspace save`, `close`, `list`, `open`: put a window of sessions away and bring it back, every conversation resumed with its tab title.
  - `/keybind`: Ghostty keys that type into Claude.

Related, outside this repo: **[murmur](https://github.com/whilestevego/murmur)**, the text-to-speech tool voice uses (Kokoro on the Apple Neural Engine, 28 voices, pronunciation fixes).

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
- **🍴 `/fork-tab`**: open a new tab continuing this conversation as a fork, to try an alternative side by side.
- **🚀 `/spawn <task>`**: open a new tab with a fresh Claude session on a task, titled after it, for parallel work.
- **🖌️ Cursor state**: the cursor's color shows busy or idle, the subtlest status indicator there is.
- **🎤 Presentation mode**: `/present` bumps the font and hides the bars for screen sharing and pairing; again to undo.
- **🌗 Theme sync**: the mods' colors follow your Ghostty theme, light or dark.

