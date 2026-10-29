# claude-mods

Mods for Claude Code: small plugins that add to its screen and behavior. Each folder is
one mod. Turn on the ones you want (see [Setup](#setup)) and change their settings in
`/config`, under the mod's name.

Each mod works on its own, and a few work better together. **notify** tells you when
something happens; with **say** it can tell you out loud, with **tldr** its turn summaries
reuse tldr's line instead of writing their own, and with **ghostty** it stays quiet while
you're looking at the session. In Ghostty, clicking its notification brings you back to the
session's tab.

## The mods

### context-bar

Shows how full Claude's context window is, as a colored bar above the prompt.

- Point at the bar to see what's using the space (system prompt, messages, tools…).
- `/context-bar` hides or shows it for this session.

### rate-limits

Shows how much of your 5-hour and weekly usage limits you've used, as two small meters
under the context bar. They turn yellow at 70% and red at 90%, and you get a warning
inside Claude once a limit passes 90%. (notify also warns, as a desktop notification or out
loud, at a threshold you set.)

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
- With notify on, the same line is its summary when a long turn finishes, at no extra cost.

### notify

Tells you when something happens in a session: as a desktop notification, out loud
through say, or both. With the ghostty mod on, it only tells you when you're away from the
session (another app or tab in front), so it never interrupts you while you're watching.
Without it, nothing can tell whether you're looking, so it always tells you.

- **What it tells you about:** Claude needs your permission or has a question, or a turn
  stopped on an API error (like a lost connection); a long turn finished, with a one-line
  summary of what it did; you're close to a usage limit; a background task finished; and
  every few minutes, how a long turn is going.
- **Where each one goes:** each event has its own setting in `/config` under **notify**:
  `both`, `banner` (the desktop notification), `voice` (spoken by say) or `off`. By default
  the first three are `both`, and background tasks and check-ins are `voice`.
- **Clicking a notification** in Ghostty brings you to the tab of the session that sent it,
  switching to its Space rather than pulling its window over. In Ghostty the banners come
  from Claude Notify, a small app notify builds from source the first time it starts.
  Each one is titled with the session's folder, so you can tell sessions apart.
- Without say, `voice` alerts are skipped and the banners still go out.

| Command | What it does |
|---|---|
| `/notify test` | Sends a desktop notification right away. macOS can't tell a mod whether your terminal may show notifications, so this is how to check. The first time notify starts, it reminds you once. |
| `/notify haiku` | The same, with a fresh haiku from Claude Haiku as its text. |
| `/notify settings` | Opens the switch in System Settings: Claude Notify's entry in Ghostty, the Notifications list elsewhere. |

### say

Gives Claude a voice, through [murmur](https://github.com/whilestevego/murmur). The notify
mod decides what gets said and when; say is the voice it speaks in.

- A soft chime plays before it speaks, so a voice never starts out of nowhere. Turn it
  off with **Chime** in `/config`.
- Each open session gets its own voice: the best one no other session has, by Kokoro's
  grades (Heart, then Bella, Nicole, Emma…). Pick one fixed voice, or your own list, in
  `/config` under **say**.

Everything else is one command, `/say`:

| Command | What it does |
|---|---|
| `/say` | Names this session's voice and plays a short sample of it. |
| `/say pick` | Lists every voice with its grade and switches this session to the one you pick, with a sample in it. The choice sticks to the conversation, so resuming it keeps the voice. |
| `/say pick <name>` | Switches directly, like `/say pick emma`. Part of the name is enough. |
| `/say pick random` | Switches to a random voice, other than the current one. Better-graded voices come up more often. |
| `/say read` | Reads Claude's last reply aloud. |
| `/say tldr` | A spoken 2–3 sentence summary of the session so far. |
| `/say hush` | Mutes this session; run it again to unmute. |
| `/say help` | Lists these. |

### ghostty

Ties Claude into the [Ghostty](https://ghostty.org) terminal. All its settings start with
"Ghostty" in `/config`.

- **Tab title:** a 4-word summary of what the session is about, from your last 10
  messages and Claude's latest reply, updated every few minutes as it goes. `/title` gets
  a new one right away. A resumed session gets its old title back.
- **Tab progress bar:** shows while Claude works, and turns red when a command fails.
- **❓ waiting on you:** a ❓ in the tab title when Claude needs a permission or an answer.
  The notify mod sends the notification.
- **`/workspace`** saves and reopens whole windows of sessions: see [Workspaces](#workspaces).
- **`/goto`** lists your open Claude sessions, the ones waiting on you first,
  and jumps to the one you pick. `/goto next` jumps straight to the one waiting longest;
  `/goto <words>` jumps to the one whose title matches.
- **`/keybind add <keys> <text>`** makes a Ghostty key type something into Claude, like
  `/keybind add super+ctrl+h /say hush` for ⌘⌃H. `/keybind` lists them, and
  `/keybind remove <keys>` removes one. For ⌘⌃G to open `/goto`, run
  `/keybind add super+ctrl+g /goto`, or turn on **Ghostty: install Claude keybinds** in `/config`.
  The mod changes your Ghostty config only when you do one of these: it adds one line that loads
  its own `claude-keybinds` file.

#### Workspaces

A workspace is a Ghostty window of Claude sessions you can put away and bring back later.
It remembers every tab and split: each Claude session with its conversation, and each shell
with its folder. Reopening it brings back the whole window, with every conversation picking
up where it left off.

| Command | What it does |
|---|---|
| `/workspace save [name]` | Saves this window. With no name, it keeps the name the window already had, or Claude Haiku picks one from the tabs. |
| `/workspace close [name]` | Saves this window, then exits every Claude session in it and closes their tabs. Your current tab stays open at the shell, and shell tabs stay open. If another session is still working or waiting on you, it closes nothing and names them; `/workspace close --force` closes them anyway. |
| `/workspace list` | Shows your saved workspaces, newest first. Press a number or Enter to reopen one, or Tab to **✕ delete** to remove it. |
| `/workspace open <name>` | Reopens a saved workspace in a new window. Part of the name is enough. |

- **Reopening** puts each tab back in its folder. Claude tabs run `claude --resume`, so
  they continue their own conversation, with the tab title they had when you saved. A tab
  saved without a title gets a new one from its conversation. Shell tabs open at the prompt.
- **Put away a project for the day:** `/workspace close`. **Pick it up tomorrow:**
  `/workspace list`, then press its number.
- **What doesn't come back:** programs that were running (a dev server, a test watcher),
  and the exact split layout. Splits reopen side by side.
- **Where they're kept:** `~/.claude/workspaces/`, one JSON file per workspace. Saving never
  overwrites a different workspace that happens to have the same name: the new one gets a file of its own.

## Setup

Install the mods you want, one line each, at the prompt of a Claude Code session:

```
/plugin install context-bar --marketplace whilestevego/claude-mods
```

Answer `y` to add the marketplace, then pick a scope. The mods are `context-bar`,
`rate-limits`, `session-id`, `turn-receipt`, `tldr`, `notify`, `say` and `ghostty`.

### From a clone, while working on them

1. Clone this repo.
2. List the mods you want in `CLAUDE_CODE_PLUGIN_DIRS`, separated by `:`, in the `env`
   block of `~/.claude/settings.json`:

   ```json
   "env": {
     "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/claude-mods/context-bar:/path/to/claude-mods/say"
   }
   ```

3. Start a new Claude session.

To try one mod for a single session: `claude --plugin-dir /path/to/claude-mods/tldr`.

## Requirements

- **ghostty** needs Ghostty 1.3 or newer on macOS. Set
  `CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1` in the same `env` block, so Claude Code doesn't
  overwrite the tab title.
- **say** needs [murmur](https://github.com/whilestevego/murmur) installed, which runs on
  Apple Silicon Macs.
- **notify**'s desktop notifications need notifications allowed in System Settings →
  Notifications: for Claude Notify in Ghostty, which needs the Xcode command line tools
  (`swiftc`) to build, or for your terminal elsewhere. `/notify test` checks;
  `/notify settings` opens the page.
- **session-id**'s pointing-hand cursor works in Ghostty, Kitty and foot.

The first time a mod controls Ghostty, macOS asks for permission. Allow it.

## Development

Editing a mod's files reloads it in running sessions. A mod newly added to
`CLAUDE_CODE_PLUGIN_DIRS` loads only in sessions started after that.

```sh
claude plugin validate context-bar   # check a mod the way Claude Code will load it
claude plugin test context-bar       # run its tests
```

Mods can call each other through nouns on `$`: say adds `$.voice.say({ text })`, which
notify speaks through, and ghostty adds `$.ghostty.isFocused()`, which notify asks before
alerting. Their types are in each mod's `types/index.d.ts`.

[IDEAS.md](IDEAS.md) has ideas for more mods.
