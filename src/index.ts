// src/index.ts - Fixed Insurance MCP Server (Resolves 500 Error)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";

interface Env {
  NOWCERTS_ACCESS_TOKEN: string;
  NOWCERTS_REFRESH_TOKEN: string;
  CLOSE_API_KEY: string;
}

export class MyMCP extends McpAgent {
  server = new McpServer({ 
    name: "Insurance Agency MCP Server", 
    version: "1.0.0" 
  });

  async init() {
    // ==== BASIC WORKING TOOLS FIRST ====
    
    this.server.tool(
      "test_connection",
      "Test the MCP server connection and environment setup",
      {
        include_env_check: z.boolean().optional().describe("Check if environment variables are configured")
      },
      async ({ include_env_check = true }) => {
        try {
          const status = {
            server_status: "running",
            timestamp: new Date().toISOString(),
            environment_check: null
          };

          if (include_env_check) {
            status.environment_check = {
              nowcerts_token_configured: !!this.props?.env?.NOWCERTS_ACCESS_TOKEN,
              close_api_configured: !!this.props?.env?.CLOSE_API_KEY,
              refresh_token_configured: !!this.props?.env?.NOWCERTS_REFRESH_TOKEN
            };
          }

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
    );

    this.server.tool(
      "get_nowcerts_customers",
      "Get customer details from NowCerts (simplified version)",
      {
        customer_id: z.string().optional().describe("Specific customer ID to retrieve"),
        limit: z.number().optional().describe("Maximum number of customers to return (default: 5, max: 10)")
      },
      async ({ customer_id, limit }) => {
        try {
          // Check if we have the required token
          if (!this.props?.env?.NOWCERTS_ACCESS_TOKEN) {
            return {
              content: [{ 
                type: "text", 
                text: "Error: NOWCERTS_ACCESS_TOKEN not configured. Please add it in Cloudflare Dashboard → Settings → Variables and Secrets." 
              }]
            };
          }

          const result = await this.callNowCertsAPI('customers', {
            customer_id,
            limit: Math.min(limit || 5, 10)
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
    );

    this.server.tool(
      "get_nowcerts_policies",
      "Retrieve policy information from NowCerts (simplified version)",
      {
        customer_id: z.string().optional().describe("Customer ID to filter policies"),
        policy_number: z.string().optional().describe("Specific policy number to retrieve"),
        limit: z.number().optional().describe("Maximum number of policies to return (default: 5, max: 10)")
      },
      async ({ customer_id, policy_number, limit }) => {
        try {
          if (!this.props?.env?.NOWCERTS_ACCESS_TOKEN) {
            return {
              content: [{ 
                type: "text", 
                text: "Error: NOWCERTS_ACCESS_TOKEN not configured. Please add it in Cloudflare Dashboard." 
              }]
            };
          }

          const result = await this.callNowCertsAPI('policies', {
            customer_id,
            policy_number,
            limit: Math.min(limit || 5, 10)
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
    );

    this.server.tool(
      "get_close_leads",
      "Retrieve lead information from Close CRM (simplified version)",
      {
        lead_id: z.string().optional().describe("Specific lead ID to retrieve"),
        limit: z.number().optional().describe("Maximum number of leads to return (default: 5, max: 10)")
      },
      async ({ lead_id, limit }) => {
        try {
          if (!this.props?.env?.CLOSE_API_KEY) {
            return {
              content: [{ 
                type: "text", 
                text: "Error: CLOSE_API_KEY not configured. Please add it in Cloudflare Dashboard → Settings → Variables and Secrets." 
              }]
            };
          }

          if (lead_id) {
            const result = await this.callCloseAPI(`lead/${lead_id}`, {});
            return {
              content: [{ 
                type: "text", 
                text: `Lead details:\n\n${JSON.stringify(result, null, 2)}` 
              }]
            };
          }

          const result = await this.callCloseAPI('lead', {
            _limit: Math.min(limit || 5, 10)
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
    );

    this.server.tool(
      "get_close_contacts",
      "Get contact details from Close CRM (simplified version)",
      {
        contact_id: z.string().optional().describe("Specific contact ID to retrieve"),
        lead_id: z.string().optional().describe("Lead ID to get contacts for"),
        limit: z.number().optional().describe("Maximum number of contacts to return (default: 5, max: 10)")
      },
      async ({ contact_id, lead_id, limit }) => {
        try {
          if (!this.props?.env?.CLOSE_API_KEY) {
            return {
              content: [{ 
                type: "text", 
                text: "Error: CLOSE_API_KEY not configured. Please add it in Cloudflare Dashboard." 
              }]
            };
          }

          if (contact_id) {
            const result = await this.callCloseAPI(`contact/${contact_id}`, {});
            return {
              content: [{ 
                type: "text", 
                text: `Contact details:\n\n${JSON.stringify(result, null, 2)}` 
              }]
            };
          }

          const params: any = {
            _limit: Math.min(limit || 5, 10)
          };
          if (lead_id) params.lead_id = lead_id;

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
    );
  }

  // API Helper Methods with better error handling
  private async callNowCertsAPI(endpoint: string, params: any) {
    if (!this.props?.env?.NOWCERTS_ACCESS_TOKEN) {
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
        'Authorization': `Bearer ${this.props.env.NOWCERTS_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (response.status === 401 && this.props.env.NOWCERTS_REFRESH_TOKEN) {
      console.log('NowCerts access token expired, attempting refresh...');
      
      try {
        const refreshResponse = await fetch('https://api.nowcerts.com/v1/auth/refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            refresh_token: this.props.env.NOWCERTS_REFRESH_TOKEN
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
    if (!this.props?.env?.CLOSE_API_KEY) {
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
        'Authorization': `Basic ${btoa(this.props.env.CLOSE_API_KEY + ':')}`,
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
}

// Simplified ES Module Default Export with better error handling
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
        
        const mcpServer = new MyMCP();
        
        // Properly initialize the MCP server with environment
        if (!mcpServer.props) {
          mcpServer.props = {};
        }
        mcpServer.props.env = env;
        
        console.log('Environment variables configured:', {
          nowcerts: !!env.NOWCERTS_ACCESS_TOKEN,
          close: !!env.CLOSE_API_KEY,
          refresh: !!env.NOWCERTS_REFRESH_TOKEN
        });
        
        return mcpServer.serveSSE('/sse').fetch(request, env, ctx);
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
