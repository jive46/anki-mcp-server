#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { YankiConnect } from "yanki-connect";
const client = new YankiConnect();

interface Card {
  cardId: number;
  question: string;
  answer: string;
  due: number;
}

/**
 * Create an MCP server with capabilities for resources (to get Anki cards),
 * and tools (to answer cards, create new cards and get cards).
 */
const server = new Server(
  {
    name: "anki-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);

/**
 * Handler for listing Anki cards as resources.
 * Cards are exposed as a resource with:
 * - An anki:// URI scheme plus a filter
 * - JSON MIME type
 * - All resources return a list of cards under different filters
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "anki://search/deck:current",
        mimeType: "application/json",
        name: "Current Deck",
        description: "Current Anki deck",
      },
      {
        uri: "anki://search/is:due",
        mimeType: "application/json",
        name: "Due cards",
        description: "Cards in review and learning waiting to be studied",
      },
      {
        uri: "anki://search/is:new",
        mimeType: "application/json", // Fixed typo: was "mimiType"
        name: "New cards",
        description: "All unseen cards",
      },
    ],
  };
});

/**
 * Filters Anki cards based on selected resource
 */
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const url = new URL(request.params.uri);
  let query = url.pathname.split("/").pop();
  if (!query) {
    throw new Error("Invalid resource URI");
  }

  // Decode URI components to handle colons and other special characters
  query = decodeURIComponent(query);

  const cards = await findCardsAndOrder(query);

  return {
    contents: [
      {
        uri: request.params.uri,
        mimeType: "application/json",
        text: JSON.stringify(cards),
      },
    ],
  };
});

// Returns a list of cards ordered by due date
async function findCardsAndOrder(query: string): Promise<Card[]> {
  console.error(`Debug: Searching for cards with query: "${query}"`);
  const cardIds = await client.card.findCards({
    query: query, // Use query directly - no formatting needed
  });

  if (cardIds.length === 0) {
    return [];
  }

  const cards: Card[] = (await client.card.cardsInfo({ cards: cardIds }))
    .map((card) => ({
      cardId: card.cardId,
      question: cleanWithRegex(card.question),
      answer: cleanWithRegex(card.answer),
      due: card.due,
    }))
    .sort((a: Card, b: Card) => a.due - b.due);

  return cards;
}

// Strip away formatting that isn't necessary
function cleanWithRegex(htmlString: string): string {
  return (
    htmlString
      // Remove style tags and their content
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      // Replace divs with newlines
      .replace(/<div[^>]*>/g, "\n")
      // Remove all HTML tags
      .replace(/<[^>]+>/g, " ")
      // Remove anki play tags
      .replace(/\[anki:play:[^\]]+\]/g, "")
      // Convert HTML entities
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      // Clean up whitespace but preserve newlines
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join("\n")
  );
}

/**
 * Handler that lists available tools.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "update_cards",
        description:
          "After the user answers cards you've quizzed them on, use this tool to mark them answered and update their ease",
        inputSchema: {
          type: "object",
          properties: {
            answers: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  cardId: {
                    type: "number",
                    description: "Id of the card to answer",
                  },
                  ease: {
                    type: "number",
                    description:
                      "Ease of the card between 1 (Again) and 4 (Easy)",
                  },
                },
              },
            },
          },
        },
      },
      {
        name: "add_card",
        description:
          'Create a new flashcard in Anki for the user. Must use HTML formatting only. IMPORTANT FORMATTING RULES:\n1. Must use HTML tags for ALL formatting - NO markdown\n2. Use <br> for ALL line breaks\n3. For code blocks, use <pre> with inline CSS styling\n4. Example formatting:\n   - Line breaks: <br>\n   - Code: <pre style="background-color: transparent; padding: 10px; border-radius: 5px;">\n   - Lists: <ol> and <li> tags\n   - Bold: <strong>\n   - Italic: <em>',
        inputSchema: {
          type: "object",
          properties: {
            front: {
              type: "string",
              description:
                "The front of the card. Must use HTML formatting only.",
            },
            back: {
              type: "string",
              description:
                "The back of the card. Must use HTML formatting only.",
            },
          },
          required: ["front", "back"],
        },
      },
      {
        name: "get_due_cards",
        description: "Returns a given number (num) of cards due for review.",
        inputSchema: {
          type: "object",
          properties: {
            num: {
              type: "number",
              description: "Number of due cards to get",
            },
          },
          required: ["num"],
        },
      },
      {
        name: "get_new_cards",
        description: "Returns a given number (num) of new and unseen cards.",
        inputSchema: {
          type: "object",
          properties: {
            num: {
              type: "number",
              description: "Number of new cards to get",
            },
          },
          required: ["num"],
        },
      },
      {
        name: "list_decks",
        description: "Returns a list of all deck names in Anki.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "list_decks_with_ids",
        description: "Returns a dictionary of deck names and their corresponding IDs.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "create_deck",
        description: "Creates a new empty deck in Anki.",
        inputSchema: {
          type: "object",
          properties: {
            deck: {
              type: "string",
              description: "Name of the new deck to create",
            },
          },
          required: ["deck"],
        },
      },
      {
        name: "delete_decks",
        description: "Deletes specified decks and all their cards. This action cannot be undone.",
        inputSchema: {
          type: "object",
          properties: {
            decks: {
              type: "array",
              items: {
                type: "string",
              },
              description: "Array of deck names to delete",
            },
          },
          required: ["decks"],
        },
      },
      {
        name: "get_deck_stats",
        description: "Gets statistics for specified decks including card counts and review information.",
        inputSchema: {
          type: "object",
          properties: {
            decks: {
              type: "array",
              items: {
                type: "string",
              },
              description: "Array of deck names to get stats for",
            },
          },
          required: ["decks"],
        },
      },
      {
        name: "move_cards_to_deck",
        description: "Moves specified cards to a different deck.",
        inputSchema: {
          type: "object",
          properties: {
            cards: {
              type: "array",
              items: {
                type: "number",
              },
              description: "Array of card IDs to move",
            },
            deck: {
              type: "string",
              description: "Name of the destination deck",
            },
          },
          required: ["cards", "deck"],
        },
      },
      {
        name: "get_cards_info",
        description: "Retrieves detailed information about specific cards including question, answer, due date, and more.",
        inputSchema: {
          type: "object",
          properties: {
            cards: {
              type: "array",
              items: {
                type: "number",
              },
              description: "Array of card IDs to get information for",
            },
          },
          required: ["cards"],
        },
      },
      {
        name: "suspend_cards",
        description: "Suspends cards to prevent them from appearing in reviews.",
        inputSchema: {
          type: "object",
          properties: {
            cards: {
              type: "array",
              items: {
                type: "number",
              },
              description: "Array of card IDs to suspend",
            },
          },
          required: ["cards"],
        },
      },
      {
        name: "unsuspend_cards",
        description: "Unsuspends cards to allow them to appear in reviews again.",
        inputSchema: {
          type: "object",
          properties: {
            cards: {
              type: "array",
              items: {
                type: "number",
              },
              description: "Array of card IDs to unsuspend",
            },
          },
          required: ["cards"],
        },
      },
      {
        name: "check_suspended_status",
        description: "Checks if specified cards are currently suspended.",
        inputSchema: {
          type: "object",
          properties: {
            cards: {
              type: "array",
              items: {
                type: "number",
              },
              description: "Array of card IDs to check suspension status for",
            },
          },
          required: ["cards"],
        },
      },
      {
        name: "check_due_status",
        description: "Checks if specified cards are currently due for review.",
        inputSchema: {
          type: "object",
          properties: {
            cards: {
              type: "array",
              items: {
                type: "number",
              },
              description: "Array of card IDs to check due status for",
            },
          },
          required: ["cards"],
        },
      },
      {
        name: "forget_cards",
        description: "Resets cards to 'new' status, removing their review history.",
        inputSchema: {
          type: "object",
          properties: {
            cards: {
              type: "array",
              items: {
                type: "number",
              },
              description: "Array of card IDs to reset to new status",
            },
          },
          required: ["cards"],
        },
      },
      {
        name: "get_ease_factors",
        description: "Retrieves ease factors for specified cards.",
        inputSchema: {
          type: "object",
          properties: {
            cards: {
              type: "array",
              items: {
                type: "number",
              },
              description: "Array of card IDs to get ease factors for",
            },
          },
          required: ["cards"],
        },
      },
      {
        name: "set_ease_factors",
        description: "Sets ease factors for specified cards.",
        inputSchema: {
          type: "object",
          properties: {
            cards: {
              type: "array",
              items: {
                type: "number",
              },
              description: "Array of card IDs to set ease factors for",
            },
            easeFactors: {
              type: "array",
              items: {
                type: "number",
              },
              description: "Array of ease factor values (must match cards array length)",
            },
          },
          required: ["cards", "easeFactors"],
        },
      },
      {
        name: "get_all_cards_in_deck",
        description: "Returns all cards in a specified deck regardless of their review status (new, due, suspended, etc.).",
        inputSchema: {
          type: "object",
          properties: {
            deck: {
              type: "string",
              description: "Name of the deck to get all cards from",
            },
          },
          required: ["deck"],
        },
      },
    ],
  };
});

/**
 * Handler for all available tools including card management and deck management.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    throw new Error(`No arguments provided for tool: ${name}`);
  }

  try {
    switch (name) {
      case "update_cards": {
        const answers = args.answers as { cardId: number; ease: number }[];
        const result = await client.card.answerCards({ answers: answers });

        const successfulCards = answers
          .filter((_, index) => result[index])
          .map((card) => card.cardId);
        const failedCards = answers.filter((_, index) => !result[index]);

        if (failedCards.length > 0) {
          const failedCardIds = failedCards.map((card) => card.cardId);
          throw new Error(
            `Failed to update cards with IDs: ${failedCardIds.join(", ")}`
          );
        }

        return {
          content: [
            {
              type: "text",
              text: `Updated cards ${successfulCards.join(", ")}`,
            },
          ],
        };
      }

      case "add_card": {
        const front = String(args.front);
        const back = String(args.back);

        const note = {
          note: {
            deckName: "Default",
            fields: {
              Back: back,
              Front: front,
            },
            modelName: "Basic",
          },
        };

        const noteId = await client.note.addNote(note);
        const cardId = (
          await client.card.findCards({ query: `nid:${noteId}` })
        )[0];

        return {
          content: [
            {
              type: "text",
              text: `Created card with id ${cardId}`,
            },
          ],
        };
      }

      case "get_due_cards": {
        const num = Number(args.num);
        const cards = await findCardsAndOrder("is:due");

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(cards.slice(0, num)),
            },
          ],
        };
      }

      case "get_new_cards": {
        const num = Number(args.num);
        const cards = await findCardsAndOrder("is:new");

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(cards.slice(0, num)),
            },
          ],
        };
      }

      case "list_decks": {
        const deckNames = await client.deck.deckNames();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(deckNames),
            },
          ],
        };
      }

      case "list_decks_with_ids": {
        const decksWithIds = await client.deck.deckNamesAndIds();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(decksWithIds),
            },
          ],
        };
      }

      case "create_deck": {
        const deckName = String(args.deck);
        const result = await client.deck.createDeck({ deck: deckName });

        return {
          content: [
            {
              type: "text",
              text: `Created deck "${deckName}" with ID: ${result}`,
            },
          ],
        };
      }

      case "delete_decks": {
        const deckNames = args.decks as string[];
        await client.deck.deleteDecks({ decks: deckNames, cardsToo: true });

        return {
          content: [
            {
              type: "text",
              text: `Deleted decks: ${deckNames.join(", ")}`,
            },
          ],
        };
      }

      case "get_deck_stats": {
        const deckNames = args.decks as string[];
        const stats = await client.deck.getDeckStats({ decks: deckNames });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(stats, null, 2),
            },
          ],
        };
      }

      case "move_cards_to_deck": {
        const cardIds = args.cards as number[];
        const targetDeck = String(args.deck);
        await client.deck.changeDeck({ cards: cardIds, deck: targetDeck });

        return {
          content: [
            {
              type: "text",
              text: `Moved ${cardIds.length} cards to deck "${targetDeck}"`,
            },
          ],
        };
      }

      case "get_cards_info": {
        const cardIds = args.cards as number[];
        const cardsInfo = await client.card.cardsInfo({ cards: cardIds });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(cardsInfo, null, 2),
            },
          ],
        };
      }

      case "suspend_cards": {
        const cardIds = args.cards as number[];
        await client.card.suspend({ cards: cardIds });

        return {
          content: [
            {
              type: "text",
              text: `Suspended ${cardIds.length} cards: ${cardIds.join(", ")}`,
            },
          ],
        };
      }

      case "unsuspend_cards": {
        const cardIds = args.cards as number[];
        await client.card.unsuspend({ cards: cardIds });

        return {
          content: [
            {
              type: "text",
              text: `Unsuspended ${cardIds.length} cards: ${cardIds.join(", ")}`,
            },
          ],
        };
      }

      case "check_suspended_status": {
        const cardIds = args.cards as number[];
        const suspendedStatus = await client.card.areSuspended({ cards: cardIds });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(suspendedStatus),
            },
          ],
        };
      }

      case "check_due_status": {
        const cardIds = args.cards as number[];
        const dueStatus = await client.card.areDue({ cards: cardIds });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(dueStatus),
            },
          ],
        };
      }

      case "forget_cards": {
        const cardIds = args.cards as number[];
        await client.card.forgetCards({ cards: cardIds });

        return {
          content: [
            {
              type: "text",
              text: `Reset ${cardIds.length} cards to new status: ${cardIds.join(", ")}`,
            },
          ],
        };
      }

      case "get_ease_factors": {
        const cardIds = args.cards as number[];
        const easeFactors = await client.card.getEaseFactors({ cards: cardIds });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(easeFactors),
            },
          ],
        };
      }

      case "set_ease_factors": {
        const cardIds = args.cards as number[];
        const easeFactors = args.easeFactors as number[];

        if (cardIds.length !== easeFactors.length) {
          throw new Error("Cards and easeFactors arrays must have the same length");
        }

        await client.card.setEaseFactors({ cards: cardIds, easeFactors: easeFactors });

        return {
          content: [
            {
              type: "text",
              text: `Set ease factors for ${cardIds.length} cards`,
            },
          ],
        };
      }

      case "get_all_cards_in_deck": {
        const deckName = String(args.deck);
        const query = `deck:"${deckName}"`;
        const cards = await findCardsAndOrder(query);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(cards),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    throw new Error(
      `Error in tool ${name}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
});

/**
 * Start the server using stdio transport.
 * This allows the server to communicate via standard input/output streams.
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});

