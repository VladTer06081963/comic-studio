import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";

const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:3000";

class ComicStudioMcpServer {
  constructor() {
    this.server = new Server({
      name: "comic-studio-mcp",
      version: "1.0.0"
    }, {
      capabilities: {
        tools: {}
      }
    });

    this.setupHandlers();
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "list_scenarios",
            description: "Get a list of comic scenarios",
            inputSchema: {
              type: "object",
              properties: {
                status: {
                  type: "string",
                  description: "Status filter (draft, approved, rejected, rendered, published, all)",
                  enum: ["draft", "approved", "rejected", "rendered", "published", "all"]
                }
              }
            }
          },
          {
            name: "get_scenario",
            description: "Get full details of a specific comic scenario by ID",
            inputSchema: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Scenario ID (8 chars hex)"
                }
              },
              required: ["id"]
            }
          },
          {
            name: "create_comic",
            description: "Create a new comic scenario draft from a text prompt",
            inputSchema: {
              type: "object",
              properties: {
                content: {
                  type: "string",
                  description: "The text context/story for the comic"
                },
                image_style: {
                  type: "string",
                  description: "Visual style of the comic (e.g. comic, manga, realistic)"
                },
                caption_style: {
                  type: "string",
                  description: "Caption style (e.g. bubble, star, gothic, boom, memo, bar)"
                }
              },
              required: ["content"]
            }
          },
          {
            name: "approve_scenario",
            description: "Approve a draft scenario for rendering",
            inputSchema: {
              type: "object",
              properties: {
                id: { type: "string" }
              },
              required: ["id"]
            }
          },
          {
            name: "render_comic",
            description: "Start rendering an approved or rendered scenario",
            inputSchema: {
              type: "object",
              properties: {
                id: { type: "string" },
                mode: { type: "string", enum: ["initial", "rerender"] }
              },
              required: ["id"]
            }
          },
          {
            name: "revise_scenario",
            description: "Revise a scenario based on text feedback",
            inputSchema: {
              type: "object",
              properties: {
                id: { type: "string" },
                feedback: { type: "string" }
              },
              required: ["id", "feedback"]
            }
          },
          {
            name: "restyle_comic",
            description: "Change the caption/bubble style of a rendered comic (bubble, star, gothic, boom, memo, bar)",
            inputSchema: {
              type: "object",
              properties: {
                id: { type: "string" },
                style: { type: "string", enum: ["bubble", "star", "gothic", "boom", "memo", "bar"] }
              },
              required: ["id", "style"]
            }
          },
          {
            name: "resolve_intent",
            description: "Resolve a natural language phrase into a scenario ID (fuzzy search using AiPULT)",
            inputSchema: {
              type: "object",
              properties: {
                phrase: { type: "string" },
                limit: { type: "number", description: "Max number of candidates (default 5)" }
              },
              required: ["phrase"]
            }
          },
          {
            name: "read_comic_image",
            description: "Read a comic image (composite or individual panel) to analyze it visually",
            inputSchema: {
              type: "object",
              properties: {
                id: { type: "string", description: "Scenario ID" },
                panel: { type: "number", description: "Panel number (e.g. 1, 2, 3). If omitted, returns the composite image." }
              },
              required: ["id"]
            }
          },
          {
            name: "update_comic_text",
            description: "Fast-update the text (captions) or bubble style of a rendered comic WITHOUT re-rendering images. Use this to fix typos, change dialogues, or restyle bubbles instantly.",
            inputSchema: {
              type: "object",
              properties: {
                id: { type: "string", description: "Scenario ID" },
                style: { type: "string", description: "Optional new bubble style (e.g. bubble, gothic, boom)" },
                captions: {
                  type: "array",
                  items: { type: "string" },
                  description: "Optional array of new text strings for all panels in order"
                }
              },
              required: ["id"]
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const name = request.params.name;
      const args = request.params.arguments || {};

      try {
        if (name === "list_scenarios") {
          const status = args.status || "all";
          const res = await this.apiFetch(`/api/scenarios?status=${status}`);
          return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
        }
        
        if (name === "get_scenario") {
          const res = await this.apiFetch(`/api/scenarios/${args.id}`);
          return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
        }

        if (name === "create_comic") {
          const res = await this.apiFetch(`/api/scenarios`, "POST", {
            content: args.content,
            image_style: args.image_style,
            caption_style: args.caption_style
          });
          return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
        }

        if (name === "approve_scenario") {
          const res = await this.apiFetch(`/api/scenarios/${args.id}/approve`, "POST");
          return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
        }

        if (name === "render_comic") {
          const res = await this.apiFetch(`/api/scenarios/${args.id}/render`, "POST", {
            mode: args.mode || "initial"
          });
          return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
        }

        if (name === "revise_scenario") {
          const res = await this.apiFetch(`/api/scenarios/${args.id}/revise`, "POST", {
            feedback: [{ text: args.feedback }]
          });
          return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
        }

        if (name === "restyle_comic") {
          const res = await this.apiFetch(`/api/scenarios/${args.id}/restyle`, "POST", {
            style: args.style
          });
          return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
        }

        if (name === "resolve_intent") {
          const res = await this.apiFetch(`/api/aipult/resolve`, "POST", {
            phrase: args.phrase,
            limit: args.limit || 5
          });
          return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
        }

        if (name === "read_comic_image") {
          const imagePath = args.panel ? `/comics/${args.id}/panel_${args.panel}.png` : `/comics/${args.id}.png`;
          const url = `${API_BASE_URL}${imagePath}`;
          const res = await fetch(url);
          if (!res.ok) throw new McpError(ErrorCode.InvalidParams, `Image not found or not generated yet: ${imagePath}`);
          const buffer = await res.arrayBuffer();
          const base64 = Buffer.from(buffer).toString("base64");
          return {
            content: [
              {
                type: "image",
                data: base64,
                mimeType: "image/png"
              },
              {
                type: "text",
                text: `Successfully loaded image: ${imagePath}`
              }
            ]
          };
        }

        if (name === "update_comic_text") {
          const res = await this.apiFetch(`/api/scenarios/${args.id}/restyle`, "POST", {
            style: args.style,
            captions: args.captions
          });
          return { content: [{ type: "text", text: `Success! Comic updated instantly. View at ${API_BASE_URL}/comics/${args.id}.html` }] };
        }

        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      } catch (err) {
        if (err instanceof McpError) throw err;
        return {
          content: [{ type: "text", text: `API Error: ${err.message}` }],
          isError: true
        };
      }
    });
  }

  async apiFetch(path, method = "GET", body = null) {
    const url = `${API_BASE_URL}${path}`;
    const init = { method, headers: {} };
    
    if (body) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    
    // Auth token integration can be added here if the server starts enforcing it
    // process.env.API_TOKEN

    try {
      const res = await fetch(url, init);
      const data = await res.json().catch(() => ({}));
      
      if (!res.ok) {
        throw new Error(data.error?.message || data.error || `HTTP ${res.status}`);
      }
      return data;
    } catch (err) {
      throw err;
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Comic Studio MCP server running on stdio");
  }
}

const mcp = new ComicStudioMcpServer();
mcp.run().catch(console.error);
