---
name: obsidian-cli
description: Control Obsidian from command line. Use when user needs to automate Obsidian tasks, manage vaults, search notes, handle files, or execute Obsidian commands via CLI. Requires Obsidian 1.12+ installer and running app.
---

# Obsidian CLI Skill

## Overview

This skill provides comprehensive guidance for using Obsidian CLI to control Obsidian from the terminal. Use when users need to automate Obsidian workflows, manage vaults programmatically, search notes, handle files, or integrate Obsidian with external tools.

**Requirements:**
- Obsidian 1.12+ installer (check with `obsidian version`)
- Obsidian app must be running (CLI launches it if not)
- CLI enabled in Settings → General → Command line interface

## Quick Start

```bash
# Install & Enable CLI
# 1. Update to Obsidian 1.12+ installer
# 2. Settings → General → Enable "Command line interface"
# 3. Follow registration prompt

# Basic usage
obsidian help              # List all commands
obsidian <command>         # Run specific command
obsidian                   # Open TUI (interactive mode)
```

## Core Commands

### File Operations

```bash
# Create files
obsidian create name="Note" content="Hello" open
obsidian create name="Note" content="# Title\n\nBody" template="Template"
obsidian create name="Note" open overwrite

# Read files
obsidian read                       # Active file
obsidian read file="Note"           # By name (wikilink resolution)
obsidian read path="Folder/Note.md" # By exact path
obsidian read --copy                # Copy to clipboard

# Modify files
obsidian append file="Note" content="New line"
obsidian prepend file="Note" content="# Header"
obsidian append file="Note" content="Inline" inline

# Move/rename/delete
obsidian move file="Old" to="New"
obsidian move file="Note" to="Folder/"
obsidian rename file="Note" to="NewName"
obsidian delete file="Note"
obsidian delete file="Note" permanent  # Skip trash
```

### Daily Notes

```bash
obsidian daily                        # Open today's daily note
obsidian daily:path                   # Get daily note path
obsidian daily:read                   # Read daily note content
obsidian daily:append content="- [ ] Task"
obsidian daily:prepend content="# Today"
obsidian daily:append content="Note" open
```

### Search & Discovery

```bash
# Search
obsidian search query="TODO"
obsidian search query="meeting" format=json
obsidian search:context query="important"
obsidian search:open query="urgent"

# Links & relationships
obsidian links file="Note"            # Outgoing links
obsidian backlinks file="Note"        # Incoming links
obsidian backlinks file="Note" format=json
obsidian orphans                      # Files with no incoming links
obsidian deadends                     # Files with no outgoing links

# Tags & metadata
obsidian tags counts                  # All tags with counts
obsidian aliases file="Note"
obsidian properties file="Note"
```

### File Listing

```bash
obsidian files                        # List all files
obsidian files folder="Diary"
obsidian files ext=md
obsidian files --total                # Count only
obsidian folders                      # List folders
obsidian folders --total
```

### Tasks

```bash
obsidian tasks                        # All tasks
obsidian tasks daily                  # Tasks from daily note
obsidian tasks file="Project"
```

### Templates

```bash
obsidian templates                    # List templates
obsidian template:read name="Daily"
obsidian template:insert name="Meeting"
```

### Plugins & Themes

```bash
# Plugins
obsidian plugins                      # List all plugins
obsidian plugins:enabled              # List enabled
obsidian plugin:enable id=obsidian-git
obsidian plugin:disable id=obsidian-git
obsidian plugin:install id=obsidian-git enable
obsidian plugin:uninstall id=obsidian-git
obsidian plugin:reload id=my-plugin   # For developers

# Themes
obsidian themes                       # List themes
obsidian theme:set name="Minimal"
obsidian theme:install id=theme-id
obsidian theme:uninstall id=theme-id

# Snippets
obsidian snippets                     # List snippets
obsidian snippet:enable id=custom
obsidian snippet:disable id=custom
```

### Bookmarks

```bash
obsidian bookmarks                    # List bookmarks
obsidian bookmark file="Note.md"
obsidian bookmark folder="Projects"
obsidian bookmark search="TODO"
obsidian bookmark url="https://..." title="Site"
```

### Vault Management

```bash
obsidian vaults                       # List all vaults
obsidian vault                        # Current vault info
obsidian vault:open name="Personal"
obsidian vault=Notes daily            # Target specific vault
```

### Sync & History

```bash
# Sync
obsidian sync
obsidian sync:status
obsidian sync:history

# File history
obsidian history file="Note"
obsidian history:read file="Note" version=2
obsidian history:restore file="Note" version=2
obsidian history:open file="Note"

# Diff versions
obsidian diff file="README" from=1 to=3
```

### Outline & Structure

```bash
obsidian outline                      # Show headings (tree format)
obsidian outline file="Note"
obsidian outline file="Note" format=md
obsidian outline file="Note" format=json
```

### Publish (Obsidian Publish)

```bash
obsidian publish:list
obsidian publish:add file="Note"
obsidian publish:remove file="Note"
obsidian publish:open
obsidian publish:status
```

### Random Notes

```bash
obsidian random                       # Open random note
obsidian random:read                  # Read random note content
```

### General Commands

```bash
obsidian help                         # All commands
obsidian help <command>               # Specific command help
obsidian version                      # Show version
obsidian reload                       # Reload app window
obsidian restart                      # Restart app
```

## Parameters & Flags

### Parameters
Format: `parameter=value`

```bash
# String values with spaces need quotes
obsidian create name="My Note" content="Hello world"

# Multiline content
obsidian create name="Note" content="# Title\n\nParagraph"

# File targeting (mutually exclusive)
file=<name>    # Resolves by name (wikilink-style)
path=<path>    # Exact path from vault root
```

### Flags
Boolean switches (no value needed)

```bash
open          # Open file after operation
overwrite     # Overwrite existing file
newtab        # Open in new tab
inline        # Append/prepend without newline
permanent     # Delete permanently (skip trash)
--copy        # Copy output to clipboard
```

### Output Formats
```bash
format=json   # JSON output
format=tsv    # TSV output (default for lists)
format=csv    # CSV output
format=md     # Markdown output
format=tree   # Tree structure (outline)
format=paths  # File paths only
```

## Advanced Usage

### Target Specific Vault
```bash
# As first parameter before command
obsidian vault=Notes search query="test"
obsidian vault="My Vault" daily

# In TUI
vault:open <name>
```

### Developer Commands
```bash
obsidian devtools                   # Open dev tools
obsidian eval code="app.vault.getFiles().length"
obsidian dev:screenshot path=screen.png
obsidian commands                   # List command IDs
obsidian command id=editor:save-file
obsidian hotkey id=editor:save-file
obsidian hotkeys --total
```

### Bases (Obsidian Bases)
```bash
obsidian bases                      # List .base files
obsidian base:views file="Database"
obsidian base:create file="DB" name="Item" content="Data"
obsidian base:query file="DB" format=md
```

### Properties
```bash
obsidian property:set file="Note" key="status" value="done"
obsidian property:remove file="Note" key="status"
obsidian property:read file="Note" key="status"
```

### Word Count
```bash
obsidian wordcount file="Note"
obsidian wordcount                  # Active file
```

## Practical Examples

### Example 1: Daily Workflow
```bash
# Morning setup
obsidian daily:append content="## Today's Goals\n- [ ] Task 1\n- [ ] Task 2"
obsidian daily:prepend content="# $(date +%Y-%m-%d)"

# Quick capture
obsidian daily:append content="- [x] Completed at $(date)"
```

### Example 2: Project Setup
```bash
# Create project structure
obsidian create name="Project Plan" template="Project" open
obsidian create name="Meeting Notes" folder="Projects/MyProject"
```

### Example 3: Search & Export
```bash
# Find all TODOs and copy
obsidian search query="TODO" --copy

# Export tag statistics
obsidian tags counts format=csv --copy
```

### Example 4: Plugin Development
```bash
# Reload plugin during development
obsidian plugin:reload id=my-dev-plugin

# Test API
obsidian eval code="Object.keys(app.plugins.plugins).length"

# Screenshot for docs
obsidian dev:screenshot path=docs/screenshot.png
```

### Example 5: Content Review
```bash
# Find orphaned files
obsidian orphans --total

# Review file structure
obsidian outline file="Documentation" format=tree

# Check backlinks
obsidian backlinks file="Important" counts
```

## TUI Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+R` | Search command history |
| `Tab` | Autocomplete |
| `↑/↓` | Navigate history |
| `Ctrl+C` | Exit TUI |

## Troubleshooting

### CLI Not Working
```bash
# Check version
obsidian version
# Must be 1.12+ installer

# Re-enable CLI
# Settings → General → Toggle "Command line interface"
```

### Command Fails
1. Ensure Obsidian app is running
2. Check vault is correctly specified
3. Verify file exists: `obsidian files`
4. Use `obsidian help <command>` for syntax

### File Not Found
```bash
# Use exact name (case-sensitive)
obsidian read file="ExactName"

# Or use full path
obsidian read path="Folder/ExactName.md"

# List to verify
obsidian files | grep pattern
```

### Installer Out of Date
```
Your Obsidian installer is out of date.
Download: https://obsidian.md/download
```

## Best Practices

1. **Use TUI for exploration**: `obsidian` then browse commands
2. **Quote values with spaces**: `name="My Note"`
3. **Use `\n` for newlines**: `content="Line1\nLine2"`
4. **Target vaults explicitly**: `vault=Name command`
5. **Copy output with `--copy`**: For piping to other tools
6. **Check help first**: `obsidian help <command>`

## Related Resources

- Official Docs: https://help.obsidian.md/cli
- Obsidian Download: https://obsidian.md/download
- Community Plugins: https://obsidian.md/plugins

---

## Examples

### User: "Create a new note called Meeting Notes with a template"
```bash
obsidian create name="Meeting Notes" template="Meeting" open
```

### User: "Show me all my TODO items"
```bash
obsidian search query="TODO"
# or
obsidian tasks
```

### User: "What tags am I using most?"
```bash
obsidian tags counts
```

### User: "Add a task to today's daily note"
```bash
obsidian daily:append content="- [ ] New task"
```

### User: "Find all files that link to this note"
```bash
obsidian backlinks file="CurrentNote"
```

### User: "I need to see the structure of my documentation"
```bash
obsidian outline file="Documentation" format=tree
```

### User: "Reload my custom plugin"
```bash
obsidian plugin:reload id=my-custom-plugin
```

### User: "How many markdown files do I have?"
```bash
obsidian files ext=md --total
```
