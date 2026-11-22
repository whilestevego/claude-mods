# claude-mods

Mods for Claude Code: small plugins that add to its screen and behavior. Each folder is
one mod. Turn on the ones you want (see [Setup](#setup)) and change their settings in
`/config`, under the mod's name.

Each mod works on its own, and a few work better together. **notify** tells you when
something happens; with **say** it can tell you out loud, with **turn-receipt** its turn
summaries reuse the TL;DR instead of writing their own, and with **ghostty** or **rex** it stays quiet
while you're looking at the session. In Ghostty and Rex, clicking its notification brings you
back to the session's tab.

## The mods

### context-bar

Shows how full Claude's context window is, as a colored bar above the prompt.

- Point at the bar to see what's using the space (system prompt, messages, tools…).
- `/context-bar` hides or shows it for this session.

### rate-limits

Shows how much of your 5-hour and weekly usage limits you've used, as two small meters
under the context bar. They turn yellow at 70% and red at 90%. notify warns you when you're
away, as a desktop notification or out loud, at a threshold you set.

- Nothing to do: it appears on its own when you're on a subscription plan.

### session-info

Shows the session's name, its ID, the name of its git worktree and the model in the
bottom-right corner of the screen. Outside a git repository the worktree is left out.

The name has the same ref as in `/list-agents`, for example `mods-42 [c38dc6]`. Two sessions
can have the same name, but the ref is different for each. Use the full name with SendMessage.

- Click any of them to copy it.
- Ctrl-click one to copy the full `claude --resume <id>` command.

Other mods use session-info too. ghostty, rex and say get Claude's process from it. ghostty
and rex get the tab titles from it, and ghostty and notify learn from it when a permission
dialog is up. Keep session-info on when you use those mods.

### turn-receipt

Adds a receipt to the line that closes each turn ("✻ Baked for 42s"): how many tools ran,
which files were edited, the tokens used and what the turn cost. Under a longer reply it
adds a one-sentence TL;DR, written by Claude Haiku.

- Nothing to do: it appears after every turn.
- **TL;DR: long reply** in `/config` sets how long a reply must be to get a TL;DR
  (600 characters by default).
- With notify on, the same line is its summary when a long turn finishes, at no extra cost.

### notify

Tells you when something happens in a session: as a desktop notification, out loud
through say, or both. With the ghostty or rex mod on, it only tells you when you're away from the
session (another app or tab in front), so it never interrupts you while you're watching.
Without it, nothing can tell whether you're looking, so it always tells you.

- **What it tells you about:** Claude needs your permission or has a question, or a turn
  stopped on an API error (like a lost connection); a long turn finished, with a one-line
  summary of what it did; you're close to a usage limit; a background task finished; and
  every few minutes, how a long turn is going ("Still working on running the tests, 5 minutes
  in.", naming the task in progress, or else Claude's latest command).
- **Where each one goes:** each event has its own setting in `/config` under **notify**:
  `both`, `banner` (the desktop notification), `voice` (spoken by say) or `off`. By default
  the first three are `both`, and background tasks and check-ins are `voice`.
- **Clicking a notification** in Ghostty brings you to the tab of the session that sent it,
  switching to its Space rather than pulling its window over. In Rex it brings you to the
  session's pane. In both, [herald](https://github.com/whilestevego/herald) posts the
  banners, from its source `claude` with the title Claude Code. notify makes the source with
  its first banner. A click runs a command that the ghostty or rex mod builds. Each banner is titled with the session's folder, so you can tell sessions
  apart.
- **The banner's icon** is `notify/icon.png` when that file exists, else 🔔. To change it,
  replace the file and start a new session. herald gives the new icon its own app ID and
  removes the old one, and macOS asks once more to allow banners and control of the terminal.
- Without say, `voice` alerts are skipped and the banners still go out.

| Command | What it does |
|---|---|
| `/notify haiku` | Sends a desktop notification right away, with a fresh haiku from Claude Haiku as its text. macOS can't tell a mod whether your terminal may show notifications, so this is how to check. The first time notify starts, it reminds you once. |
| `/notify settings` | Opens the switch in System Settings: the entry of herald's `claude` source in Ghostty and Rex, the Notifications list elsewhere. |

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

In other terminals the ghostty mod does nothing.

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

### rex

Ties Claude into the [Rex](https://www.superlogical.com/rex) terminal. Claude Code already
reports its status to Rex (tab dots, Dock badge, sounds). All its settings start with "Rex" in
`/config`.

- **Tab title:** a 4-word summary of what the session is about, as the tab's name, updated
  every few minutes as it goes. `/title` gets a new one right away. A resumed session gets
  its old title back, also when it was titled in Ghostty.
- **Focus for notify:** tells notify whether you're looking at the session: Rex is in front,
  on this session, with this pane focused. With several Rex windows open, Rex only names the
  session of the window you used last, so the answer can be wrong.

In other terminals the rex mod does nothing.

Turn off Rex's own system notifications for program activity, so notify sends the only banner.

## Setup

Install the mods you want, one line each, at the prompt of a Claude Code session:

```
/plugin install context-bar --marketplace whilestevego/claude-mods
```

Answer `y` to add the marketplace, then pick a scope. The mods are `context-bar`,
`rate-limits`, `session-info`, `turn-receipt`, `notify`, `say`, `ghostty` and `rex`.

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

To load the ghostty mod only in Ghostty and the rex mod only in Rex, set the list in your
shell's startup file in place of `settings.json`. A value in `settings.json` applies in every
terminal. In zsh, put this in `~/.zshenv`, which runs for every zsh, also when `ZDOTDIR` is set:

```sh
mods="$HOME/claude-mods"
CLAUDE_CODE_PLUGIN_DIRS="$mods/context-bar:$mods/notify:$mods/say"
case "$TERM_PROGRAM" in
  ghostty) CLAUDE_CODE_PLUGIN_DIRS="$CLAUDE_CODE_PLUGIN_DIRS:$mods/ghostty" ;;
  rex) CLAUDE_CODE_PLUGIN_DIRS="$CLAUDE_CODE_PLUGIN_DIRS:$mods/rex" ;;
esac
export CLAUDE_CODE_PLUGIN_DIRS
```

A Claude session that no shell starts, such as one an editor starts, then loads no mods.

To try one mod for a single session: `claude --plugin-dir /path/to/claude-mods/turn-receipt`.

## Requirements

- **ghostty**, **rex**, **notify** and **say** need **session-info** on for some of their features (see [session-info](#session-info)).
- **ghostty** needs Ghostty 1.3 or newer on macOS. Set
  `CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1` in Ghostty only, so Claude Code doesn't overwrite
  the tab title. That variable also stops Claude Code's status reports to Rex. In
  `~/.zshenv`: `[ "$TERM_PROGRAM" = ghostty ] && export CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1`.
- **say** needs [murmur](https://github.com/whilestevego/murmur) installed, which runs on
  Apple Silicon Macs.
- **notify**'s desktop notifications need notifications allowed in System Settings →
  Notifications: for Claude Code (herald's `claude` source) in Ghostty and Rex, which needs
  herald installed, or for your terminal elsewhere. `/notify haiku` checks;
  `/notify settings` opens the page.
- **session-info**'s pointing-hand cursor works in Ghostty, Kitty and foot.

The first time a mod controls Ghostty or Rex, macOS asks for permission. Allow it.

## Development

Editing a mod's files reloads it in running sessions. A mod newly added to
`CLAUDE_CODE_PLUGIN_DIRS` loads only in sessions started after that.

```sh
claude plugin validate context-bar   # check a mod the way Claude Code will load it
claude plugin test context-bar       # run its tests
```

Mods can call each other through nouns on `$`: say adds `$.voice.say({ text })`, which
notify speaks through, and ghostty and rex add `$.ghostty.isFocused()` and `$.rex.isFocused()`,
which notify asks before alerting. Each answers false outside its own terminal. Two mods can't
add the same noun, and a hook on a noun no loaded mod adds stops its mod from loading, so each
terminal mod has its own. Their types are in each mod's `types/index.d.ts`.

[IDEAS.md](IDEAS.md) has ideas for more mods.
