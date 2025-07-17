// Final MCP Server - HTTP Transport for Relevance AI Compatibility
// Converted from SSE to modern JSON-RPC 2.0 over HTTP

export interface Env {
  NOWCERTS_CLIENT_ID: string;
  NOWCERTS_CLIENT_SECRET: string;
  CLOSE_API_KEY: string;
}

// Keep all your existing API integration code - NowCerts token management
let nowCertsAccessToken: string | null = null;
let tokenExpiresAt: number = 0;

async function getNowCertsAccessToken(env: Env): Promise<string> {
  if (nowCertsAccessToken && Date.now() < tokenExpiresAt) {
    return nowCertsAccessToken;
  }

  const response = await fetch('https://api.nowcerts.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.NOWCERTS_CLIENT_ID,
      client_secret: env.NOWCERTS_CLIENT_SECRET,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get access token: ${response.statusText}`);
  }

  const data = await response.json() as any;
  nowCertsAccessToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in * 1000) - 60000; // Refresh 1 minute early

  return nowCertsAccessToken;
}

// Keep all your existing tool functions - just preserve them exactly as they are

async function getCustomerProfile(customerId: string, env: Env) {
  try {
    const response = await fetch(`https://api.close.com/api/v1/contact/${customerId}/`, {
      headers: {
        'Authorization': `Bearer ${env.CLOSE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch customer profile: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Error fetching customer profile: ${error}`);
  }
}

async function searchCustomersAdvanced(query: string, limit: number = 10, env: Env) {
  try {
    const searchParams = new URLSearchParams({
      '_search': query,
      '_limit': limit.toString(),
    });

    const response = await fetch(`https://api.close.com/api/v1/contact/?${searchParams}`, {
      headers: {
        'Authorization': `Bearer ${env.CLOSE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to search customers: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Error searching customers: ${error}`);
  }
}

async function getPolicyDetails(policyId: string, env: Env) {
  try {
    const accessToken = await getNowCertsAccessToken(env);
    
    const response = await fetch(`https://api.nowcerts.com/v1/policies/${policyId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch policy details: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Error fetching policy details: ${error}`);
  }
}

async function getNowCertsPolicies(customerId?: string, env?: Env) {
  try {
    const accessToken = await getNowCertsAccessToken(env!);
    
    let url = 'https://api.nowcerts.com/v1/policies';
    if (customerId) {
      url += `?customer_id=${customerId}`;
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch policies: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Error fetching NowCerts policies: ${error}`);
  }
}

async function getNowCertsCustomers(limit: number = 20, env: Env) {
  try {
    const accessToken = await getNowCertsAccessToken(env);
    
    const response = await fetch(`https://api.nowcerts.com/v1/customers?limit=${limit}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch customers: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Error fetching NowCerts customers: ${error}`);
  }
}

async function getCloseLeads(status?: string, env?: Env) {
  try {
    let url = 'https://api.close.com/api/v1/lead/';
    if (status) {
      url += `?status=${encodeURIComponent(status)}`;
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${env!.CLOSE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch leads: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Error fetching Close leads: ${error}`);
  }
}

async function getCloseContacts(limit: number = 25, env: Env) {
  try {
    const response = await fetch(`https://api.close.com/api/v1/contact/?_limit=${limit}`, {
      headers: {
        'Authorization': `Bearer ${env.CLOSE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch contacts: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Error fetching Close contacts: ${error}`);
  }
}

// NEW: JSON-RPC 2.0 Handler for HTTP Transport
async function handleJsonRpcRequest(request: any, env: Env) {
  const { jsonrpc, id, method, params } = request;

  // Validate JSON-RPC format
  if (jsonrpc !== "2.0") {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32600,
        message: "Invalid Request - must be JSON-RPC 2.0"
      }
    };
  }

  try {
    switch (method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: "Insurance MCP Server",
              version: "1.0.0"
            }
          }
        };

      case "tools/list":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            tools: [
              {
                name: "get_customer_profile",
                description: "Get customer profile information from Close CRM",
                inputSchema: {
                  type: "object",
                  properties: {
                    customer_id: { type: "string", description: "Customer ID from Close CRM" }
                  },
                  required: ["customer_id"]
                }
              },
              {
                name: "search_customers_advanced",
                description: "Advanced search for customers in Close CRM",
                inputSchema: {
                  type: "object",
                  properties: {
                    query: { type: "string", description: "Search query" },
                    limit: { type: "number", description: "Number of results to return", default: 10 }
                  },
                  required: ["query"]
                }
              },
              {
                name: "get_policy_details",
                description: "Get specific policy details from NowCerts",
                inputSchema: {
                  type: "object",
                  properties: {
                    policy_id: { type: "string", description: "Policy ID from NowCerts" }
                  },
                  required: ["policy_id"]
                }
              },
              {
                name: "get_nowcerts_policies",
                description: "Get policies from NowCerts system",
                inputSchema: {
                  type: "object",
                  properties: {
                    customer_id: { type: "string", description: "Customer ID to filter policies" }
                  }
                }
              },
              {
                name: "get_nowcerts_customers",
                description: "Get customers from NowCerts system",
                inputSchema: {
                  type: "object",
                  properties: {
                    limit: { type: "number", description: "Number of results to return", default: 20 }
                  }
                }
              },
              {
                name: "get_close_leads",
                description: "Get leads from Close CRM",
                inputSchema: {
                  type: "object",
                  properties: {
                    status: { type: "string", description: "Lead status filter (optional)" }
                  }
                }
              },
              {
                name: "get_close_contacts",
                description: "Get contacts from Close CRM", 
                inputSchema: {
                  type: "object",
                  properties: {
                    limit: { type: "number", description: "Number of results to return", default: 25 }
                  }
                }
              }
            ]
          }
        };

      case "tools/call":
        const toolName = params.name;
        const toolArgs = params.arguments || {};
        
        // Call your existing tool functions
        let toolResult;
        switch (toolName) {
          case "get_customer_profile":
            toolResult = await getCustomerProfile(toolArgs.customer_id, env);
            break;
          case "search_customers_advanced":
            toolResult = await searchCustomersAdvanced(toolArgs.query, toolArgs.limit || 10, env);
            break;
          case "get_policy_details":
            toolResult = await getPolicyDetails(toolArgs.policy_id, env);
            break;
          case "get_nowcerts_policies":
            toolResult = await getNowCertsPolicies(toolArgs.customer_id, env);
            break;
          case "get_nowcerts_customers":
            toolResult = await getNowCertsCustomers(toolArgs.limit || 20, env);
            break;
          case "get_close_leads":
            toolResult = await getCloseLeads(toolArgs.status, env);
            break;
          case "get_close_contacts":
            toolResult = await getCloseContacts(toolArgs.limit || 25, env);
            break;
          default:
            throw new Error(`Unknown tool: ${toolName}`);
        }

        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2)
              }
            ]
          }
        };

      case "ping":
        return {
          jsonrpc: "2.0",
          id,
          result: {}
        };

      default:
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`
          }
        };
    }
  } catch (error: any) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: "Internal error",
        data: error.message
      }
    };
  }
}

// MAIN CLOUDFLARE WORKERS HANDLER - Updated for HTTP Transport
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // CORS headers for all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, Mcp-Session-Id',
      'Access-Control-Expose-Headers': 'Content-Type, Mcp-Session-Id',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // Info endpoint - shows server status and available tools
    if (url.pathname === "/" && request.method === "GET") {
      return Response.json({
        name: "Insurance MCP Server",
        version: "1.0.0",
        status: "healthy",
        protocol: "mcp-http",
        mcp_endpoint: "/mcp",
        tools: [
          "get_customer_profile",
          "search_customers_advanced", 
          "get_policy_details",
          "get_nowcerts_policies",
          "get_nowcerts_customers",
          "get_close_leads",
          "get_close_contacts"
        ],
        usage: "Send JSON-RPC 2.0 requests to: /mcp endpoint"
      }, {
        headers: corsHeaders
      });
    }

    // Main MCP endpoint - handles JSON-RPC 2.0 requests
    if (url.pathname === "/mcp" && request.method === "POST") {
      try {
        const jsonRpcRequest = await request.json();
        
        // Handle JSON-RPC request
        const response = await handleJsonRpcRequest(jsonRpcRequest, env);
        
        return Response.json(response, {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          }
        });
      } catch (error: any) {
        return Response.json({
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32700,
            message: "Parse error",
            data: error.message
          }
        }, {
          status: 400,
          headers: corsHeaders
        });
      }
    }

    // Legacy SSE endpoint - redirect to new info
    if (url.pathname === "/sse") {
      return Response.json({
        message: "SSE endpoint deprecated. Use /mcp endpoint instead.",
        new_endpoint: "/mcp",
        protocol: "JSON-RPC 2.0 over HTTP",
        info_endpoint: "/"
      }, {
        status: 410, // Gone
        headers: corsHeaders
      });
    }

    return new Response("Not Found", { 
      status: 404,
      headers: corsHeaders 
    });
  }
};
