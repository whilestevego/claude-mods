# claude-mods

Mods for Claude Code: small plugins that add to its screen and behavior. Each folder is
one mod. Turn on the ones you want (see [Setup](#setup)) and change their settings in
`/config`, under the mod's name.

## The mods

### context-bar

Shows how full Claude's context window is, as a colored bar above the prompt.

- Point at the bar to see what's using the space (system prompt, messages, tools…).
- `/context-bar` hides or shows it for this session.

### rate-limits

Shows how much of your 5-hour and weekly usage limits you've used, as two small meters
under the context bar. They turn yellow at 70% and red at 90%, and you get a warning
once a limit passes 90%.

- Nothing to do: it appears on its own when you're on a subscription plan.

### session-id

Shows this session's ID in the bottom-right corner of the screen.

- Click it to copy the ID.
- Ctrl-click it to copy the full `claude --resume <id>` command.

### turn-receipt

Adds a receipt to the line that closes each turn ("✻ Baked for 42s"): how many tools ran,
which files were edited, the tokens used and what the turn cost.

- Nothing to do: it appears after every turn.

### tldr

Adds a one-sentence summary under Claude's longer replies, written by Claude Haiku.

- Nothing to do. **TL;DR: long reply** in `/config` sets how long a reply must be
  (600 characters by default).

### paths

Turns file paths in Claude's replies, like `src/app.ts:42`, into links.

- ⌘-click a path to open the file.
- Set **Paths: open with** to `zed`, `vscode` or `cursor` to open it in that editor at the
  right line instead of the file's default app.

### previews

Lets you see images Claude reads, right in the conversation.

- Under each image Claude opens, a line reads `🖼 name.png · hover to preview`. Point at
  it to show the picture, and move away to hide it.

### voice

Gives Claude a voice, through [murmur](https://github.com/whilestevego/murmur). It speaks
only when you're away from the session (another app or tab in front), so it never talks
over you while you're watching.

- It says what a long turn did, when Claude needs your permission or has a question,
  when a background task finishes, how a long task is going every few minutes, and when
  you're close to a usage limit.
- `/read` reads Claude's last reply aloud.
- `/tldr-aloud` gives a spoken 2–3 sentence summary of the session so far.
- `/hush` mutes this session; run it again to unmute.
- Each open session gets its own voice. Pick one fixed voice, or the list sessions choose
  from, in `/config` under **voice**.

### ghostty

Ties Claude into the [Ghostty](https://ghostty.org) terminal. All its settings start with
"Ghostty" in `/config`.

- **Tab title:** a 3-word summary of what the session is about, updated as it goes.
- **Tab progress bar:** shows while Claude works, fills in as its to-do list gets done,
  and turns red when a command fails.
- **❓ waiting on you:** a ❓ in the tab title and a desktop notification when Claude
  needs a permission or an answer. If voice is on, it speaks instead of notifying.
- **Mode tint:** the background takes a faint tint in risky permission modes: blue for
  plan, amber for accept edits, red for bypass permissions.
- **`/goto`** (or ⌘⌃G) lists your open Claude sessions, the ones waiting on you first,
  and jumps to the one you pick. `/goto next` jumps straight to the one waiting longest;
  `/goto <words>` jumps to the one whose title matches.
- **`/workspace save [name]`** remembers this window's tabs, each Claude tab with its
  conversation. Without a name, Haiku picks one. **`/workspace list`** shows saved
  workspaces: pick one to reopen it (every conversation resumes where it left off), or
  delete it. **`/workspace open <name>`** reopens one directly.
- **`/keybind add <keys> <text>`** makes a Ghostty key type something into Claude, like
  `/keybind add super+ctrl+h /hush` for ⌘⌃H. `/keybind` lists them, and
  `/keybind remove <keys>` removes one.

## Setup

1. Clone this repo.
2. List the mods you want in `CLAUDE_CODE_PLUGIN_DIRS`, separated by `:`, in the `env`
   block of `~/.claude/settings.json`:

   ```json
   "env": {
     "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/claude-mods/context-bar:/path/to/claude-mods/voice"
   }
   ```

3. Start a new Claude session.

To try one mod for a single session: `claude --plugin-dir /path/to/claude-mods/paths`.

## Requirements

- **ghostty** needs Ghostty 1.3 or newer on macOS. Set
  `CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1` in the same `env` block, so Claude Code doesn't
  overwrite the tab title.
- **voice** needs [murmur](https://github.com/whilestevego/murmur) installed, which runs on
  Apple Silicon Macs.
- **previews** needs a terminal that can draw images, like Ghostty or Kitty.
- **session-id**'s pointing-hand cursor works in Ghostty, Kitty and foot.

The first time a mod controls Ghostty, macOS asks for permission. Allow it.

## Development

Editing a mod's files reloads it in running sessions.

```sh
claude plugin validate context-bar   # check a mod the way Claude Code will load it
claude plugin test context-bar       # run its tests
```

[IDEAS.md](IDEAS.md) has ideas for more mods.
