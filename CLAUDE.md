# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an MCP (Model Context Protocol) server that connects to a locally running Anki desktop application via the Anki-Connect add-on. It provides tools for reviewing, creating, and managing Anki flashcards through MCP-compatible clients like Claude Desktop.

## Architecture

- **Single-file implementation**: All server logic is in `index.ts`
- **MCP SDK**: Uses `@modelcontextprotocol/sdk` for server implementation
- **Anki Integration**: Uses `yanki-connect` library to communicate with Anki-Connect add-on
- **Transport**: Communicates via stdio (standard input/output streams)

### Core Components

- **Resources**: Expose Anki card collections via `anki://` URI scheme with filters (`deck:current`, `is:due`, `is:new`)
- **Tools**: Eighteen main tools for comprehensive Anki management:
  
  **Card Management:**
  - `update_cards`: Mark cards as answered with ease ratings (1-4)
  - `add_card`: Create new flashcards (requires HTML formatting)
  - `get_due_cards`: Retrieve cards due for review
  - `get_new_cards`: Retrieve new/unseen cards
  - `get_cards_info`: Get detailed card information (question, answer, due date, etc.)
  - `suspend_cards`: Suspend cards to prevent them from appearing in reviews
  - `unsuspend_cards`: Unsuspend cards to allow them in reviews again
  - `check_suspended_status`: Check if cards are currently suspended
  - `check_due_status`: Check if cards are currently due for review
  - `forget_cards`: Reset cards to 'new' status, removing review history
  - `get_ease_factors`: Retrieve ease factors for cards
  - `set_ease_factors`: Set ease factors for cards
  
  **Deck Management:**
  - `list_decks`: Get all deck names
  - `list_decks_with_ids`: Get deck names with their IDs
  - `create_deck`: Create new empty deck
  - `delete_decks`: Delete decks and all their cards (irreversible)
  - `get_deck_stats`: Get statistics for specific decks
  - `move_cards_to_deck`: Move cards between decks

### Key Functions

- `findCardsAndOrder()`: Queries Anki and returns sorted card data
- `cleanWithRegex()`: Strips HTML formatting from card content for clean display
- Card data structure includes `cardId`, `question`, `answer`, and `due` fields

## Development Commands

```bash
# Build the server
npm run build

# Development with auto-rebuild
npm run watch

# Debug with MCP Inspector
npm run inspector
```

## Prerequisites

- Anki desktop application must be running
- Anki-Connect add-on must be installed in Anki

## Important Notes

- Cards use HTML formatting only (no markdown) - especially important for `add_card` tool
- All card operations require valid Anki-Connect connection
- Server runs as a binary at `build/index.js` after compilation
- Cards are created in the "Default" deck using "Basic" note type