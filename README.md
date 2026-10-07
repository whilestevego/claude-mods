# claude-mods

Plugins ("mods") that change Claude Code's terminal UI and behavior. Each folder is one
plugin: a `.claude-plugin/plugin.json` manifest and a `hooks/` module that hooks Claude Code
events and drawing.

| Mod | What it does |
|---|---|
| [context-bar](context-bar) | Context window as a stacked bar above the prompt; hover swaps the row to the legend. `/context-bar` toggles it. |
| [rate-limits](rate-limits) | 5-hour and weekly usage gauges under the context bar; a warning at 90%. |
| [session-id](session-id) | Session ID in the footer: click copies it, ctrl-click copies `claude --resume <id>`. |
| [tab-title](tab-title) | Sets the terminal tab title to a 3-word summary of the session (Claude Haiku), refreshed as it goes. |
| [turn-receipt](turn-receipt) | Adds tools, edited files, tokens and cost to each turn's "Baked for…" line. |
| [voice](voice) | Claude speaks through [murmur](https://github.com/whilestevego/murmur): turn summaries, needs-you alerts, background tasks, progress check-ins, rate-limit warnings, `/read`, `/tldr-aloud`, `/hush`. One voice per session. |

[IDEAS.md](IDEAS.md) has more mod ideas.

## Using them

List the folders in `CLAUDE_CODE_PLUGIN_DIRS` (`:`-separated) in the `env` block of
`~/.claude/settings.json`, then start a new session:

```json
"env": { "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/claude-mods/context-bar:/path/to/claude-mods/voice" }
```

Or try one for a single session: `claude --plugin-dir context-bar`. Editing a loaded mod
reloads it live.

Settings live in `/config`, under each mod's name.

## Requirements

- **tab-title** and **session-id**'s pointer hand are for Ghostty (also Kitty and foot for
  the pointer). tab-title also needs `CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1` so Claude Code
  doesn't set its own title.
- **voice** needs [murmur](https://github.com/whilestevego/murmur) on the `PATH`, so it
  needs Apple Silicon. Its "away" detection uses Ghostty's AppleScript support.

## Development

```sh
claude plugin validate context-bar   # check a mod the way Claude Code will load it
claude plugin test context-bar       # run its *.test.ts files
```

Each mod's `tsconfig.json` extends the types Claude Code writes into
`.claude-plugin/types/` when it loads the mod, so `tsc -p <mod>` type-checks a loaded mod.
