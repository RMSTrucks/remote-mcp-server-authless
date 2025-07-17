// src/index.ts - Raw MCP Server (No Durable Objects)
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

interface Env {
  NOWCERTS_ACCESS_TOKEN: string;
  NOWCERTS_REFRESH_TOKEN: string;
  CLOSE_API_KEY: string;
}

class InsuranceMCPServer {
  private server: Server;
  private env: Env;

  constructor(env: Env) {
    this.env = env;
    this.server = new Server(
      {
        name: "Insurance Agency MCP Server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "test_connection",
            description: "Test the MCP server connection and environment setup",
            inputSchema: {
              type: "object",
              properties: {
                include_env_check: {
                  type: "boolean",
                  description: "Check if environment variables are configured"
                }
              }
            }
          },
          {
            name: "get_nowcerts_customers",
            description: "Get customer details from NowCerts",
            inputSchema: {
              type: "object",
              properties: {
                customer_id: {
                  type: "string",
                  description: "Specific customer ID to retrieve"
                },
                limit: {
                  type: "number",
                  description: "Maximum number of customers to return (default: 5, max: 10)"
                }
              }
            }
          },
          {
            name: "get_nowcerts_policies",
            description: "Retrieve policy information from NowCerts",
            inputSchema: {
              type: "object",
              properties: {
                customer_id: {
                  type: "string",
                  description: "Customer ID to filter policies"
                },
                policy_number: {
                  type: "string",
                  description: "Specific policy number to retrieve"
                },
                limit: {
                  type: "number",
                  description: "Maximum number of policies to return (default: 5, max: 10)"
                }
              }
            }
          },
          {
            name: "get_close_leads",
            description: "Retrieve lead information from Close CRM",
            inputSchema: {
              type: "object",
              properties: {
                lead_id: {
                  type: "string",
                  description: "Specific lead ID to retrieve"
                },
                limit: {
                  type: "number",
                  description: "Maximum number of leads to return (default: 5, max: 10)"
                }
              }
            }
          },
          {
            name: "get_close_contacts",
            description: "Get contact details from Close CRM",
            inputSchema: {
              type: "object",
              properties: {
                contact_id: {
                  type: "string",
                  description: "Specific contact ID to retrieve"
                },
                lead_id: {
                  type: "string",
                  description: "Lead ID to get contacts for"
                },
                limit: {
                  type: "number",
                  description: "Maximum number of contacts to return (default: 5, max: 10)"
                }
              }
            }
          }
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "test_connection":
            return await this.handleTestConnection(args);
          case "get_nowcerts_customers":
            return await this.handleGetNowCertsCustomers(args);
          case "get_nowcerts_policies":
            return await this.handleGetNowCertsPolicies(args);
          case "get_close_leads":
            return await this.handleGetCloseLeads(args);
          case "get_close_contacts":
            return await this.handleGetCloseContacts(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error(`Error handling tool ${name}:`, error);
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`
            }
          ],
          isError: true
        };
      }
    });
  }

  private async handleTestConnection(args: any) {
    try {
      const status = {
        server_status: "running",
        timestamp: new Date().toISOString(),
        environment_check: {
          nowcerts_token_configured: !!this.env.NOWCERTS_ACCESS_TOKEN,
          close_api_configured: !!this.env.CLOSE_API_KEY,
          refresh_token_configured: !!this.env.NOWCERTS_REFRESH_TOKEN
        }
      };

      return {
        content: [{ 
          type: "text", 
          text: `MCP Server Connection Test:\n\n${JSON.stringify(status, null, 2)}` 
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Connection test failed: ${error.message}` 
        }]
      };
    }
  }

  private async handleGetNowCertsCustomers(args: any) {
    try {
      if (!this.env.NOWCERTS_ACCESS_TOKEN) {
        return {
          content: [{ 
            type: "text", 
            text: "Error: NOWCERTS_ACCESS_TOKEN not configured. Please add it in Cloudflare Dashboard → Settings → Variables and Secrets." 
          }]
        };
      }

      const result = await this.callNowCertsAPI('customers', {
        customer_id: args.customer_id,
        limit: Math.min(args.limit || 5, 10)
      });
      
      return {
        content: [{ 
          type: "text", 
          text: `Found ${result.data?.length || 0} customers:\n\n${JSON.stringify(result.data || [], null, 2)}` 
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error retrieving customers: ${error.message}` 
        }]
      };
    }
  }

  private async handleGetNowCertsPolicies(args: any) {
    try {
      if (!this.env.NOWCERTS_ACCESS_TOKEN) {
        return {
          content: [{ 
            type: "text", 
            text: "Error: NOWCERTS_ACCESS_TOKEN not configured. Please add it in Cloudflare Dashboard." 
          }]
        };
      }

      const result = await this.callNowCertsAPI('policies', {
        customer_id: args.customer_id,
        policy_number: args.policy_number,
        limit: Math.min(args.limit || 5, 10)
      });
      
      return {
        content: [{ 
          type: "text", 
          text: `Found ${result.data?.length || 0} policies:\n\n${JSON.stringify(result.data || [], null, 2)}` 
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error retrieving policies: ${error.message}` 
        }]
      };
    }
  }

  private async handleGetCloseLeads(args: any) {
    try {
      if (!this.env.CLOSE_API_KEY) {
        return {
          content: [{ 
            type: "text", 
            text: "Error: CLOSE_API_KEY not configured. Please add it in Cloudflare Dashboard → Settings → Variables and Secrets." 
          }]
        };
      }

      if (args.lead_id) {
        const result = await this.callCloseAPI(`lead/${args.lead_id}`, {});
        return {
          content: [{ 
            type: "text", 
            text: `Lead details:\n\n${JSON.stringify(result, null, 2)}` 
          }]
        };
      }

      const result = await this.callCloseAPI('lead', {
        _limit: Math.min(args.limit || 5, 10)
      });
      
      return {
        content: [{ 
          type: "text", 
          text: `Found ${result.data?.length || 0} leads:\n\n${JSON.stringify(result.data || [], null, 2)}` 
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error retrieving leads: ${error.message}` 
        }]
      };
    }
  }

  private async handleGetCloseContacts(args: any) {
    try {
      if (!this.env.CLOSE_API_KEY) {
        return {
          content: [{ 
            type: "text", 
            text: "Error: CLOSE_API_KEY not configured. Please add it in Cloudflare Dashboard." 
          }]
        };
      }

      if (args.contact_id) {
        const result = await this.callCloseAPI(`contact/${args.contact_id}`, {});
        return {
          content: [{ 
            type: "text", 
            text: `Contact details:\n\n${JSON.stringify(result, null, 2)}` 
          }]
        };
      }

      const params: any = {
        _limit: Math.min(args.limit || 5, 10)
      };
      if (args.lead_id) params.lead_id = args.lead_id;

      const result = await this.callCloseAPI('contact', params);
      
      return {
        content: [{ 
          type: "text", 
          text: `Found ${result.data?.length || 0} contacts:\n\n${JSON.stringify(result.data || [], null, 2)}` 
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error retrieving contacts: ${error.message}` 
        }]
      };
    }
  }

  // API Helper Methods
  private async callNowCertsAPI(endpoint: string, params: any) {
    if (!this.env.NOWCERTS_ACCESS_TOKEN) {
      throw new Error("NOWCERTS_ACCESS_TOKEN not configured");
    }

    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });

    const url = `https://api.nowcerts.com/v1/${endpoint}${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    
    console.log(`Making NowCerts API call to: ${endpoint}`);

    let response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.env.NOWCERTS_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (response.status === 401 && this.env.NOWCERTS_REFRESH_TOKEN) {
      console.log('NowCerts access token expired, attempting refresh...');
      
      try {
        const refreshResponse = await fetch('https://api.nowcerts.com/v1/auth/refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            refresh_token: this.env.NOWCERTS_REFRESH_TOKEN
          })
        });

        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json();
          
          response = await fetch(url, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${refreshData.access_token}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          });
          
          console.log('⚠️  NowCerts tokens refreshed! Please update in Cloudflare dashboard.');
        } else {
          throw new Error(`Refresh failed: ${refreshResponse.statusText}`);
        }
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        throw new Error(`NowCerts token expired and refresh failed: ${refreshError.message}`);
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`NowCerts API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  }

  private async callCloseAPI(endpoint: string, params: any) {
    if (!this.env.CLOSE_API_KEY) {
      throw new Error("CLOSE_API_KEY not configured");
    }

    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });

    const url = `https://api.close.com/api/v1/${endpoint}${queryParams.toString() ? (endpoint.includes('?') ? '&' : '?') + queryParams.toString() : ''}`;
    
    console.log(`Making Close API call to: ${endpoint}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${btoa(this.env.CLOSE_API_KEY + ':')}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Close CRM API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  }

  getServer() {
    return this.server;
  }
}

// ES Module Default Export
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Accept',
        },
      });
    }

    // Handle SSE endpoint for MCP
    if (url.pathname === '/sse' || url.pathname.startsWith('/sse/')) {
      try {
        console.log('Setting up MCP server for SSE connection...');
        
        const mcpServer = new InsuranceMCPServer(env);
        const transport = new SSEServerTransport("/sse", request);
        
        await mcpServer.getServer().connect(transport);
        
        return transport.response;
      } catch (error) {
        console.error("Error handling SSE request:", error);
        return new Response(JSON.stringify({
          error: "Internal Server Error",
          message: error.message,
          stack: error.stack
        }), { 
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        });
      }
    }

    // Handle health check endpoint
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({
        name: "Insurance MCP Server",
        version: "1.0.0",
        status: "healthy",
        mcp_endpoint: "/sse",
        tools: [
          "test_connection",
          "get_nowcerts_customers",
          "get_nowcerts_policies",
          "get_close_leads",
          "get_close_contacts"
        ],
        environment_status: {
          nowcerts_configured: !!env.NOWCERTS_ACCESS_TOKEN,
          close_configured: !!env.CLOSE_API_KEY,
          refresh_token_configured: !!env.NOWCERTS_REFRESH_TOKEN
        },
        usage: "Connect MCP clients to: /sse endpoint"
      }), {
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    return new Response("Not Found - Use /sse for MCP connections", { 
      status: 404,
      headers: {
        'Access-Control-Allow-Origin': '*',
      }
    });
  },
};
