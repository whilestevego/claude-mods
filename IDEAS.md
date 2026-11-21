# Mod ideas

Claude Code mods: what's built, and ideas for more. ✅ = built.

## Built

- ✅ **context-bar**: the context window as a colored bar above the prompt.
  - Hover the bar to swap it for the legend (what's using the space).
  - `/context-bar` hides or shows it.
- ✅ **rate-limits**: 5-hour and weekly usage meters under the context bar.
  - Yellow at 70%, red at 90%, and a warning once a limit passes 90%.
- ✅ **session-info**: the session's name, ID and git worktree in the footer, as `📝 <name> 🏷️ <id> 🌳 <worktree>`.
  - Blue and underlined on hover, with a pointing-hand cursor (Ghostty, Kitty, foot).
  - Click copies what was clicked; ctrl-click copies `claude --resume <id>`.
- ✅ **turn-receipt**: a receipt on each turn's "Baked for…" line.
  - Tools run, files edited, tokens in and out, and the turn's cost.
- ✅ **tldr**: a one-sentence Haiku summary under long replies.
  - The say mod speaks this same line, so a turn has one summary.
- ✅ **say**: Claude speaks through [murmur](https://github.com/whilestevego/murmur), only when you're away.
  - Turn summaries, needs-you alerts, background tasks done, progress check-ins, rate-limit warnings.
  - `/say` plays this session's voice; `/say pick` picks another (`/say pick random` for a surprise); `/say read`, `/say tldr`, `/say hush`.
  - Each session gets its own voice; new speech cuts off old; a soft chime plays first.
- ✅ **ghostty**: Ghostty integration, settings all under "Ghostty" in `/config`.
  - Tab title: a 4-word summary of the session; `/title` for a new one now; restored on resume.
  - Tab progress bar: busy while Claude works, red after a failed tool call.
  - ❓ in the tab and a notification when Claude waits on you (say speaks it instead when on).
  - `/workspace save`, `close`, `list`, `open`: put a window of sessions away and bring it back, every conversation resumed with its tab title.
- ✅ **rex**: Rex integration. Claude Code reports its own status to Rex.
  - Tab title: a 4-word summary as the tab's name; `/title` for a new one now; restored on resume.
  - Tells notify when you're looking at the session.

Related, outside this repo: **[murmur](https://github.com/whilestevego/murmur)**, the text-to-speech tool say uses (Kokoro on the Apple Neural Engine, 28 voices, pronunciation fixes).

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

## Rex

Most of these react to Rex events. `rex.on` handlers only run in a script that `rex do` keeps running, so the rex mod
would start one watcher, `rex do claude.lua --all`, when none runs yet. Each idea that reacts to an event is a handler
in that file. Effort: **S** about an hour, **M** a day, **L** more.

### Ambient awareness

- **🎨 Mood lighting** (S): the watcher tints Claude's pane with `set_theme` when its status changes: amber while it
  waits on you, red after an error, a short green flash when it finishes.
- **🌡️ Context warmth** (S): the pane's background turns warmer as the context window fills, so you see the need for
  `/compact` before you read a number.
- **🖍️ Project hues** (S): a hue from a hash of the repo name, set as each Claude pane's theme, so two repos never look
  the same.
- **📟 Pane header readout** (S): "waiting 3m · $1.20 · 64% ctx" as the block label (`set_block_label`), updated on
  each event. Rex's tab title stays as it is.

### Answer Claude without going to it

- **🪄 Summon the waiting pane** (M): one key moves a blocked Claude pane from a background tab into a floating layer
  over your current tab (`detach_block`, `new_layer`, `float_block`). After you answer, it goes back to its home split.
- **✅ Approve from any pane** (M): a `claude/` key mode where `y` and `n` type the answer into the blocked pane
  (`write`). A floating preview of its screen (`format`) shows the question first.
- **🛑 Panic button** (S): one key sends Esc to every Claude pane whose status is "working", in every session.
- **🎛️ Palette actions** (S): `rex.action` entries in Rex's command palette, such as "Claude: approve waiting tool",
  "Claude: send /compact to all idle sessions" and "Claude: resume last conversation here".

### Give Claude eyes on other panes

- **👀 `/pane`** (M): pick a pane in Claude; its screen and scrollback (`format`) go into the prompt as text.
- **🎯 Send selection to Claude** (S): select text in any pane with copy mode, press a key, and it goes into Claude's
  prompt as a quote (`write` with bracketed paste). Works from logs, vim and remote hosts.
- **🚑 Crash watch** (M): `terminal.child_exited` with a non-zero code in a pane without Claude (a dev server) shows
  "Server crashed. Ask Claude?" through Claude Notify. A click types the pane's last 50 lines into an idle Claude.
- **🔌 Port awareness** (S): the terminal's `ports` method and `ports_changed` event tell Claude which port the dev
  server listens on, and when it goes down.

### Claude arranges your workspace

- **📺 Live panes** (M): a background Bash command (dev server, test watcher) also opens a split below Claude that
  follows its output file (`rex split --focus=false`). It closes when the task ends.
- **🌳 Worktree sessions** (M): a new git worktree gets a Rex session named after it, with Claude, a shell and a dev
  server (`session.create` with a layout). Removing the worktree closes the session.
- **🧱 Layouts Claude writes once** (S): "set me up for the API work" makes Claude write the layout as a `rex.action`
  in the Rex config and run it. Next time it is a palette entry or a key.
- **♻️ Reboot resume** (M): if Rex brings back sessions but not their programs, the watcher types
  `claude --resume <id>` into each pane that ran Claude (`initial_input`). Depends on the reboot check.

### Away from the desk

- **🚚 `/handoff <host>`** (L): push the branch, then open a tab on another Rex server (`rex.server(label)`) that runs
  `claude --resume` there. The job moves to the fast machine and stays in the same Rex window.
- **📱 Notifications that follow you** (M): when the Mac is idle and a phone client is connected, notify lets Rex send
  its own notifications so they reach the phone, and goes back to Claude Notify when you return. Not yet confirmed
  that a Rex phone client exists.
- **📸 Whiteboard to prompt** (S): bind Rex's Insert Photo (`pane.insert_photo`) in Claude's pane, so a photo of a
  sketch lands in the prompt as a path.

### History

- **🎞️ Session replay** (M): at each status change the watcher saves Claude's pane as HTML (`format`) with the time and
  status. A local page with a slider replays a long run frame by frame.

First picks: summon the waiting pane, `/pane`, and mood lighting. All three need the watcher first.
