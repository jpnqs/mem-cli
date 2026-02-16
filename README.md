# Memory CLI (mem)

A lightweight, powerful, and secure "digital memory" for your terminal. Store notes, code snippets, and secrets with ease. Featuring **regex search**, **AES-256 encryption**, and **date filtering**.

---

## Features

- **Fast Storage:** Quickly save text or clipboard content.
- **Secure Vault:** Optional AES-256-CBC encryption for sensitive data.
- **Advanced Search:** Search using keywords, regex, or wildcards (`*`).
- **Date Filtering:** Find entries from `today`, `yesterday`, or specific dates.
- **Organization:** Tag-based system with a built-in frequency analyzer.
- **Analytics:** Automatic usage counter for every entry.
- **Clean UI:** Beautiful terminal output with tables and colors.

---

## Installation

### Prerequisites

Ensure you have [Node.js](https://nodejs.org/) (v16 or higher) installed.

### Setup

Navigate to your project folder and install the required dependencies:

```bash
npm install
```

### Global Command

To make the mem command available globally on your system:

```bash
npm link
```

### Usage

```bash
# Basic add
mem add "React useEffect cleanup: return () => { ... }" --tags react,hooks

# Add using short flags (-t for tags)
mem add "Some info" -t info,note

# Add from clipboard (shortcut -c)
mem add -c --tags snippet,important

# Encrypted storage (shortcut -e)
# You will be prompted for a password. Content will show as *** ENCRYPTED *** in find.
mem add "My super secret API key" -e --tags work,security
```

Finding & Listing

```bash
# Simple search (searches content and tags)
mem find "React"

# Regex/Wildcard search (always use quotes for wildcards!)
mem find "Rea*"

# Table view (shortcut -t)
mem find "*" -t

# Filter by date (-d)
mem find -d today
mem find -d yesterday
mem find -d 14.02.2026
mem find "Meeting" -d 2026-02-10
```

Retrieving & Copying

```bash
# View specific entry (and increment usage counter)
mem get 101

# View and copy to clipboard directly (-c)
mem get 101 -c
```

Management

```bash
# Edit an entry (modifies content and tags)
mem edit 105

# List all tags and their frequency
mem tags

# Show database file locations
mem loc

# Remove an entry
mem rm 101
```

## Configuration

By default, data is stored in `~/.memory-cli-data`.
You can override this by setting the `MEMORY_CLI_SAVE_LOCATION` environment variable:

**Linux/Mac (.bashrc or .zshrc):**

```bash
export MEMORY_CLI_SAVE_LOCATION="/path/to/your/storage"
```

**Windows (Environment Variables):**

Set a new System Variable named `MEMORY_CLI_SAVE_LOCATION` with your desired path.

## Security Note

When using the Encrypted (-e) flag:

- Content is encrypted using AES-256-CBC.
- The vault.json stores the encrypted secret, while db.json only stores the metadata and "Encrypted" status.
- Warning: The password is never stored. If you forget it, the encrypted content is lost forever.
