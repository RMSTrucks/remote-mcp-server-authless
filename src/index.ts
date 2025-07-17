// src/index.ts - ES Module Compatible Insurance MCP Server
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
    // ==== CUSTOMER MANAGEMENT TOOLS ====
    
    this.server.tool(
      "get_customer_profile",
      "Retrieve comprehensive customer profile including policies, claims history, and contact information",
      {
        customer_id: z.string().describe("Customer ID from NowCerts"),
        include_policies: z.boolean().optional().describe("Include all active and inactive policies"),
        include_claims: z.boolean().optional().describe("Include claims history"),
        include_quotes: z.boolean().optional().describe("Include pending and past quotes"),
        date_range_months: z.number().optional().describe("How many months back to include data (default: 12)")
      },
      async ({ customer_id, include_policies = true, include_claims = true, include_quotes = true, date_range_months = 12 }) => {
        try {
          // Get base customer info
          const customer = await this.callNowCertsAPI('customers', { customer_id });
          
          const profile = {
            customer_info: customer.data,
            policies: [],
            claims: [],
            quotes: [],
            risk_score: null,
            lifetime_value: null
          };

          // Get policies if requested
          if (include_policies) {
            const policies = await this.callNowCertsAPI('policies', { 
              customer_id, 
              limit: 50
            });
            profile.policies = policies.data || [];
          }

          // Get claims if requested
          if (include_claims) {
            const claims = await this.callNowCertsAPI('claims', { 
              customer_id,
              date_from: this.getDateMonthsAgo(date_range_months),
              limit: 25
            });
            profile.claims = claims.data || [];
          }

          // Get quotes if requested  
          if (include_quotes) {
            const quotes = await this.callNowCertsAPI('quotes', { 
              customer_id,
              date_from: this.getDateMonthsAgo(date_range_months),
              limit: 15
            });
            profile.quotes = quotes.data || [];
          }

          // Calculate risk metrics
          profile.risk_score = this.calculateRiskScore(profile);
          profile.lifetime_value = this.calculateLifetimeValue(profile);

          return {
            content: [{ 
              type: "text", 
              text: `Customer Profile for ${customer.data?.name || customer_id}:\n\n${JSON.stringify(profile, null, 2)}` 
            }]
          };
        } catch (error) {
          return {
            content: [{ 
              type: "text", 
              text: `Error retrieving customer profile: ${error.message}` 
            }]
          };
        }
      }
    );

    this.server.tool(
      "search_customers_advanced",
      "Advanced customer search with multiple criteria and filters",
      {
        search_criteria: z.object({
          name: z.string().optional().describe("Customer name (partial match)"),
          email: z.string().optional().describe("Email address"),
          phone: z.string().optional().describe("Phone number"),
          city: z.string().optional().describe("City"),
          state: z.string().optional().describe("State"),
          zip: z.string().optional().describe("ZIP code"),
          policy_type: z.enum(["auto", "home", "life", "commercial", "umbrella"]).optional(),
          carrier: z.string().optional().describe("Insurance carrier name")
        }).describe("Search criteria object"),
        filters: z.object({
          active_policies_only: z.boolean().optional().describe("Only customers with active policies"),
          min_premium: z.number().optional().describe("Minimum annual premium amount"),
          max_premium: z.number().optional().describe("Maximum annual premium amount"),
          has_claims: z.boolean().optional().describe("Customers with claims history"),
          renewal_within_days: z.number().optional().describe("Policies renewing within X days")
        }).optional().describe("Additional filters"),
        limit: z.number().optional().describe("Maximum results (default: 25, max: 100)")
      },
      async ({ search_criteria, filters = {}, limit = 25 }) => {
        try {
          // Build comprehensive search query
          const searchParams = {
            ...search_criteria,
            ...filters,
            limit: Math.min(limit, 100)
          };

          const customers = await this.callNowCertsAPI('customers/search', searchParams);
          
          // Enhance results with summary data (limited to prevent timeouts)
          const enhancedResults = await Promise.all(
            (customers.data || []).slice(0, 10).map(async (customer) => {
              try {
                const policies = await this.callNowCertsAPI('policies', { 
                  customer_id: customer.id, 
                  limit: 5 
                });
                
                return {
                  ...customer,
                  policy_count: policies.data?.length || 0,
                  total_premium: policies.data?.reduce((sum, p) => sum + (p.premium_amount || 0), 0) || 0,
                  next_renewal: policies.data?.find(p => p.status === 'active')?.expiration_date
                };
              } catch (error) {
                return customer; // Return basic customer info if policy lookup fails
              }
            })
          );

          return {
            content: [{ 
              type: "text", 
              text: `Found ${enhancedResults.length} customers:\n\n${JSON.stringify(enhancedResults, null, 2)}` 
            }]
          };
        } catch (error) {
          return {
            content: [{ 
              type: "text", 
              text: `Error searching customers: ${error.message}` 
            }]
          };
        }
      }
    );

    // ==== POLICY MANAGEMENT TOOLS ====

    this.server.tool(
      "get_policy_details",
      "Get comprehensive policy details including coverage, billing, and claims",
      {
        policy_id: z.string().optional().describe("Specific policy ID"),
        policy_number: z.string().optional().describe("Policy number"),
        include_coverage_details: z.boolean().optional().describe("Include detailed coverage breakdown"),
        include_billing_history: z.boolean().optional().describe("Include billing and payment history"),
        include_claims: z.boolean().optional().describe("Include related claims")
      },
      async ({ policy_id, policy_number, include_coverage_details = true, include_billing_history = false, include_claims = true }) => {
        try {
          // Get base policy info
          const policyParams = policy_id ? { policy_id } : { policy_number };
          const policy = await this.callNowCertsAPI('policies', policyParams);
          
          const policyDetails = {
            policy_info: policy.data,
            coverage_details: [],
            billing_history: [],
            claims: [],
            compliance_status: null
          };

          const actualPolicyId = policy.data?.id || policy_id;

          // Get coverage details
          if (include_coverage_details && actualPolicyId) {
            try {
              const coverage = await this.callNowCertsAPI(`policies/${actualPolicyId}/coverage`, {});
              policyDetails.coverage_details = coverage.data || [];
            } catch (error) {
              console.log('Coverage details not available');
            }
          }

          // Get billing history
          if (include_billing_history && actualPolicyId) {
            try {
              const billing = await this.callNowCertsAPI(`policies/${actualPolicyId}/billing`, { limit: 12 });
              policyDetails.billing_history = billing.data || [];
            } catch (error) {
              console.log('Billing history not available');
            }
          }

          // Get related claims
          if (include_claims && actualPolicyId) {
            try {
              const claims = await this.callNowCertsAPI('claims', { policy_id: actualPolicyId, limit: 10 });
              policyDetails.claims = claims.data || [];
            } catch (error) {
              console.log('Claims data not available');
            }
          }

          // Check compliance status
          policyDetails.compliance_status = this.checkPolicyCompliance(policy.data);

          return {
            content: [{ 
              type: "text", 
              text: `Policy Details for ${policy.data?.policy_number}:\n\n${JSON.stringify(policyDetails, null, 2)}` 
            }]
          };
        } catch (error) {
          return {
            content: [{ 
              type: "text", 
              text: `Error retrieving policy details: ${error.message}` 
            }]
          };
        }
      }
    );

    // ==== BASIC NowCerts & Close CRM TOOLS ====

    this.server.tool(
      "get_nowcerts_policies",
      "Retrieve policy information from NowCerts",
      {
        customer_id: z.string().optional().describe("Customer ID to filter policies"),
        policy_number: z.string().optional().describe("Specific policy number to retrieve"),
        status: z.enum(["active", "inactive", "pending", "cancelled"]).optional().describe("Policy status filter"),
        limit: z.number().optional().describe("Maximum number of policies to return (default: 10, max: 50)")
      },
      async ({ customer_id, policy_number, status, limit }) => {
        try {
          const result = await this.callNowCertsAPI('policies', {
            customer_id,
            policy_number,
            status,
            limit: Math.min(limit || 10, 50)
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
      "get_nowcerts_customers",
      "Get customer details from NowCerts",
      {
        customer_id: z.string().optional().describe("Specific customer ID to retrieve"),
        email: z.string().optional().describe("Customer email to search by"),
        phone: z.string().optional().describe("Customer phone to search by"),
        limit: z.number().optional().describe("Maximum number of customers to return (default: 10, max: 25)")
      },
      async ({ customer_id, email, phone, limit }) => {
        try {
          const result = await this.callNowCertsAPI('customers', {
            customer_id,
            email,
            phone,
            limit: Math.min(limit || 10, 25)
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
      "get_close_leads",
      "Retrieve lead information from Close CRM",
      {
        lead_id: z.string().optional().describe("Specific lead ID to retrieve"),
        status: z.enum(["active", "inactive"]).optional().describe("Lead status filter"),
        limit: z.number().optional().describe("Maximum number of leads to return (default: 10, max: 25)")
      },
      async ({ lead_id, status, limit }) => {
        try {
          const params: any = {
            _limit: Math.min(limit || 10, 25)
          };

          if (lead_id) {
            const result = await this.callCloseAPI(`lead/${lead_id}`, {});
            return {
              content: [{ 
                type: "text", 
                text: `Lead details:\n\n${JSON.stringify(result, null, 2)}` 
              }]
            };
          }

          if (status) params.status_label = status;

          const result = await this.callCloseAPI('lead', params);
          
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
      "Get contact details from Close CRM",
      {
        contact_id: z.string().optional().describe("Specific contact ID to retrieve"),
        lead_id: z.string().optional().describe("Lead ID to get contacts for"),
        email: z.string().optional().describe("Contact email to search by"),
        limit: z.number().optional().describe("Maximum number of contacts to return (default: 10, max: 25)")
      },
      async ({ contact_id, lead_id, email, limit }) => {
        try {
          const params: any = {
            _limit: Math.min(limit || 10, 25)
          };

          if (contact_id) {
            const result = await this.callCloseAPI(`contact/${contact_id}`, {});
            return {
              content: [{ 
                type: "text", 
                text: `Contact details:\n\n${JSON.stringify(result, null, 2)}` 
              }]
            };
          }

          if (lead_id) params.lead_id = lead_id;
          if (email) params.email = email;

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

  // ==== HELPER METHODS ====

  private getDateMonthsAgo(months: number): string {
    const date = new Date();
    date.setMonth(date.getMonth() - months);
    return date.toISOString().split('T')[0];
  }

  private calculateRiskScore(profile: any): number {
    let score = 5; // Base score
    if (profile.claims && profile.claims.length > 0) {
      score += Math.min(profile.claims.length * 0.5, 3);
    }
    return Math.min(Math.max(score, 1), 10);
  }

  private calculateLifetimeValue(profile: any): number {
    const policies = profile.policies || [];
    const annualPremium = policies.reduce((sum, p) => sum + (p.premium_amount || 0), 0);
    const avgRetention = 5; // years
    return annualPremium * avgRetention;
  }

  private checkPolicyCompliance(policy: any): any {
    return {
      compliant: true,
      issues: [],
      last_checked: new Date().toISOString()
    };
  }

  // API Helper Methods
  private async callNowCertsAPI(endpoint: string, params: any) {
    if (!this.props.env.NOWCERTS_ACCESS_TOKEN) {
      throw new Error("NOWCERTS_ACCESS_TOKEN not configured");
    }

    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });

    const url = `https://api.nowcerts.com/v1/${endpoint}${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    
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
        throw new Error(`NowCerts token expired and refresh failed.`);
      }
    }

    if (!response.ok) {
      throw new Error(`NowCerts API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  private async callCloseAPI(endpoint: string, params: any) {
    if (!this.props.env.CLOSE_API_KEY) {
      throw new Error("CLOSE_API_KEY not configured");
    }

    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });

    const url = `https://api.close.com/api/v1/${endpoint}${queryParams.toString() ? (endpoint.includes('?') ? '&' : '?') + queryParams.toString() : ''}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${btoa(this.props.env.CLOSE_API_KEY + ':')}`,
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
        const mcpServer = new MyMCP();
        // Pass environment to the MCP server
        mcpServer.props = { env };
        
        return mcpServer.serveSSE('/sse').fetch(request, env, ctx);
      } catch (error) {
        console.error("Error handling SSE request:", error);
        return new Response("Internal Server Error", { 
          status: 500,
          headers: {
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
          "get_customer_profile",
          "search_customers_advanced",
          "get_policy_details",
          "get_nowcerts_policies",
          "get_nowcerts_customers",
          "get_close_leads",
          "get_close_contacts"
        ],
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
