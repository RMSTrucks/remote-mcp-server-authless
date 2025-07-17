// src/index.ts - Insurance MCP Server
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";

interface Env {
  NOWCERTS_ACCESS_TOKEN: string;
  NOWCERTS_REFRESH_TOKEN: string;
  CLOSE_API_KEY: string;
}

export class InsuranceMCP extends McpAgent {
  server = new McpServer({ 
    name: "Insurance Agency MCP Server", 
    version: "1.0.0" 
  });

  private env: Env;

  constructor(env: Env) {
    super();
    this.env = env;
  }

  async init() {
    // NowCerts Policy Lookup Tool
    this.server.tool(
      "get_nowcerts_policies",
      "Retrieve policy information from NowCerts",
      {
        customer_id: z.string().optional().describe("Customer ID to filter policies"),
        policy_number: z.string().optional().describe("Specific policy number to retrieve"),
        status: z.enum(["active", "inactive", "pending", "cancelled"]).optional().describe("Policy status filter"),
        limit: z.number().optional().describe("Maximum number of policies to return (default: 10, max: 100)")
      },
      async ({ customer_id, policy_number, status, limit }) => {
        try {
          const result = await this.callNowCertsAPI('policies', {
            customer_id,
            policy_number,
            status,
            limit: Math.min(limit || 10, 100)
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

    // NowCerts Customer Lookup Tool  
    this.server.tool(
      "get_nowcerts_customers",
      "Get customer details from NowCerts",
      {
        customer_id: z.string().optional().describe("Specific customer ID to retrieve"),
        email: z.string().optional().describe("Customer email to search by"),
        phone: z.string().optional().describe("Customer phone to search by"),
        limit: z.number().optional().describe("Maximum number of customers to return (default: 10, max: 50)")
      },
      async ({ customer_id, email, phone, limit }) => {
        try {
          const result = await this.callNowCertsAPI('customers', {
            customer_id,
            email,
            phone,
            limit: Math.min(limit || 10, 50)
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

    // NowCerts Quote Lookup Tool
    this.server.tool(
      "get_nowcerts_quotes",
      "Fetch quote data from NowCerts",
      {
        customer_id: z.string().optional().describe("Customer ID to filter quotes"),
        quote_id: z.string().optional().describe("Specific quote ID to retrieve"),
        status: z.enum(["pending", "quoted", "bound", "declined"]).optional().describe("Quote status filter"),
        date_from: z.string().optional().describe("Start date for quote search (YYYY-MM-DD)"),
        date_to: z.string().optional().describe("End date for quote search (YYYY-MM-DD)"),
        limit: z.number().optional().describe("Maximum number of quotes to return (default: 10, max: 100)")
      },
      async ({ customer_id, quote_id, status, date_from, date_to, limit }) => {
        try {
          const result = await this.callNowCertsAPI('quotes', {
            customer_id,
            quote_id,
            status,
            date_from,
            date_to,
            limit: Math.min(limit || 10, 100)
          });
          
          return {
            content: [{ 
              type: "text", 
              text: `Found ${result.data?.length || 0} quotes:\n\n${JSON.stringify(result.data || [], null, 2)}` 
            }]
          };
        } catch (error) {
          return {
            content: [{ 
              type: "text", 
              text: `Error retrieving quotes: ${error.message}` 
            }]
          };
        }
      }
    );

    // Close CRM Lead Lookup Tool
    this.server.tool(
      "get_close_leads",
      "Retrieve lead information from Close CRM",
      {
        lead_id: z.string().optional().describe("Specific lead ID to retrieve"),
        status: z.enum(["active", "inactive"]).optional().describe("Lead status filter"),
        created_by: z.string().optional().describe("User ID who created the lead"),
        date_created_from: z.string().optional().describe("Lead creation date from (YYYY-MM-DD)"),
        date_created_to: z.string().optional().describe("Lead creation date to (YYYY-MM-DD)"),
        limit: z.number().optional().describe("Maximum number of leads to return (default: 25, max: 100)")
      },
      async ({ lead_id, status, created_by, date_created_from, date_created_to, limit }) => {
        try {
          const result = await this.callCloseAPI('lead', {
            lead_id,
            status_label: status,
            created_by,
            date_created__gte: date_created_from,
            date_created__lte: date_created_to,
            _limit: Math.min(limit || 25, 100)
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

    // Close CRM Contact Lookup Tool
    this.server.tool(
      "get_close_contacts",
      "Get contact details from Close CRM",
      {
        contact_id: z.string().optional().describe("Specific contact ID to retrieve"),
        lead_id: z.string().optional().describe("Lead ID to get contacts for"),
        email: z.string().optional().describe("Contact email to search by"),
        phone: z.string().optional().describe("Contact phone to search by"),
        limit: z.number().optional().describe("Maximum number of contacts to return (default: 25, max: 100)")
      },
      async ({ contact_id, lead_id, email, phone, limit }) => {
        try {
          const result = await this.callCloseAPI('contact', {
            contact_id,
            lead_id,
            email,
            phone,
            _limit: Math.min(limit || 25, 100)
          });
          
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

    // Search Tool for NowCerts Policies
    this.server.tool(
      "search_nowcerts_policies",
      "Search policies by various criteria in NowCerts",
      {
        search_term: z.string().describe("General search term (customer name, policy number, etc.)"),
        policy_type: z.enum(["auto", "home", "commercial", "life", "health"]).optional().describe("Type of insurance policy"),
        carrier: z.string().optional().describe("Insurance carrier name"),
        limit: z.number().optional().describe("Maximum number of results (default: 25, max: 100)")
      },
      async ({ search_term, policy_type, carrier, limit }) => {
        try {
          const result = await this.callNowCertsAPI('policies/search', {
            q: search_term,
            policy_type,
            carrier,
            limit: Math.min(limit || 25, 100)
          });
          
          return {
            content: [{ 
              type: "text", 
              text: `Found ${result.data?.length || 0} policies matching "${search_term}":\n\n${JSON.stringify(result.data || [], null, 2)}` 
            }]
          };
        } catch (error) {
          return {
            content: [{ 
              type: "text", 
              text: `Error searching policies: ${error.message}` 
            }]
          };
        }
      }
    );
  }

  // Helper method to call NowCerts API with token management
  private async callNowCertsAPI(endpoint: string, params: any) {
    if (!this.env.NOWCERTS_ACCESS_TOKEN) {
      throw new Error("NOWCERTS_ACCESS_TOKEN not configured");
    }

    // Build query string
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });

    const url = `https://api.nowcerts.com/v1/${endpoint}?${queryParams.toString()}`;
    
    let response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.env.NOWCERTS_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    // If token is expired (401), try to refresh it
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
          
          // Retry the original request with the new token
          response = await fetch(url, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${refreshData.access_token}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          });
          
          // Log the new tokens for manual update
          console.log('⚠️  NowCerts tokens refreshed! Please update in Cloudflare dashboard:');
          console.log(`New Access Token: ${refreshData.access_token}`);
          console.log(`New Refresh Token: ${refreshData.refresh_token || 'Same as before'}`);
        } else {
          throw new Error(`Refresh failed: ${refreshResponse.statusText}`);
        }
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        throw new Error(`NowCerts token expired and refresh failed. Please check token expiration dates:
        - Access Token expires: 16-Aug-25
        - Refresh Token expires: 15-Sep-25
        
        If both are expired, please log into NowCerts to get new tokens.`);
      }
    }

    if (!response.ok) {
      throw new Error(`NowCerts API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  // Helper method to call Close CRM API
  private async callCloseAPI(endpoint: string, params: any) {
    if (!this.env.CLOSE_API_KEY) {
      throw new Error("CLOSE_API_KEY not configured");
    }

    // Build query string
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });

    const url = `https://api.close.com/api/v1/${endpoint}/?${queryParams.toString()}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${btoa(this.env.CLOSE_API_KEY + ':')}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Close CRM API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }
}

// Export the default handler for Cloudflare Workers
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    const { pathname } = new URL(request.url);
    
    // Create instance with environment variables
    const insuranceMCP = new InsuranceMCP(env);
    
    if (pathname.startsWith('/sse')) {
      return insuranceMCP.serveSSE('/sse').fetch(request, env, ctx);
    }
    
    if (pathname.startsWith('/mcp')) {
      return insuranceMCP.serve('/mcp').fetch(request, env, ctx);
    }
    
    // Health check endpoint
    if (pathname === '/' || pathname === '/health') {
      return new Response(JSON.stringify({
        name: "Insurance MCP Server",
        version: "1.0.0", 
        status: "healthy",
        endpoints: {
          sse: "/sse",
          mcp: "/mcp"
        },
        tools: [
          "get_nowcerts_policies",
          "get_nowcerts_customers",
          "get_nowcerts_quotes", 
          "get_close_leads",
          "get_close_contacts",
          "search_nowcerts_policies"
        ]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('Insurance MCP Server - Use /sse endpoint for MCP connections', { 
      status: 404,
      headers: { 'Content-Type': 'text/plain' }
    });
  },
};
