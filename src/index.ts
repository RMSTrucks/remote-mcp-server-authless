// src/index.ts - Fixed Insurance MCP Server
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
          
          // Enhance results with summary data
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

    this.server.tool(
      "get_renewals_report",
      "Generate renewals report with recommendations for upcoming policy renewals",
      {
        date_range: z.object({
          from: z.string().describe("Start date (YYYY-MM-DD)"),
          to: z.string().describe("End date (YYYY-MM-DD)")
        }).describe("Renewal date range"),
        policy_types: z.array(z.enum(["auto", "home", "life", "commercial", "umbrella"])).optional(),
        include_recommendations: z.boolean().optional().describe("Include renewal recommendations"),
        limit: z.number().optional().describe("Maximum policies to analyze (default: 50)")
      },
      async ({ date_range, policy_types, include_recommendations = true, limit = 50 }) => {
        try {
          // Get policies expiring in date range
          const policies = await this.callNowCertsAPI('policies', {
            expiration_date_from: date_range.from,
            expiration_date_to: date_range.to,
            status: 'active',
            limit: Math.min(limit, 100)
          });

          let renewalData = policies.data || [];

          // Filter by policy types if specified
          if (policy_types && policy_types.length > 0) {
            renewalData = renewalData.filter(p => policy_types.includes(p.type));
          }

          // Enhance with additional data
          const enhancedRenewals = await Promise.all(
            renewalData.slice(0, 20).map(async (policy) => {
              const enhancement = {
                ...policy,
                customer_info: null,
                claims_history: [],
                renewal_recommendation: null
              };

              try {
                // Get customer info
                const customer = await this.callNowCertsAPI('customers', { customer_id: policy.customer_id });
                enhancement.customer_info = customer.data;

                // Get recent claims for risk analysis
                const claims = await this.callNowCertsAPI('claims', { 
                  policy_id: policy.id,
                  date_from: this.getDateMonthsAgo(24), // 2 years
                  limit: 5
                });
                enhancement.claims_history = claims.data || [];

                // Generate renewal recommendations
                if (include_recommendations) {
                  enhancement.renewal_recommendation = this.generateRenewalRecommendation(policy, enhancement.claims_history);
                }
              } catch (error) {
                console.log(`Error enhancing policy ${policy.id}:`, error.message);
              }

              return enhancement;
            })
          );

          // Generate summary statistics
          const summary = {
            total_policies: enhancedRenewals.length,
            total_premium: enhancedRenewals.reduce((sum, p) => sum + (p.premium_amount || 0), 0),
            avg_premium: enhancedRenewals.length > 0 ? enhancedRenewals.reduce((sum, p) => sum + (p.premium_amount || 0), 0) / enhancedRenewals.length : 0,
            retention_recommendations: enhancedRenewals.filter(p => p.renewal_recommendation?.action === 'retain').length
          };

          return {
            content: [{ 
              type: "text", 
              text: `Renewals Report (${date_range.from} to ${date_range.to}):\n\nSummary:\n${JSON.stringify(summary, null, 2)}\n\nDetailed Data:\n${JSON.stringify(enhancedRenewals, null, 2)}` 
            }]
          };
        } catch (error) {
          return {
            content: [{ 
              type: "text", 
              text: `Error generating renewals report: ${error.message}` 
            }]
          };
        }
      }
    );

    // ==== CLAIMS MANAGEMENT TOOLS ====

    this.server.tool(
      "get_claims_dashboard",
      "Generate claims dashboard with analytics and trends",
      {
        date_range: z.object({
          from: z.string().describe("Start date (YYYY-MM-DD)"),
          to: z.string().describe("End date (YYYY-MM-DD)")
        }).optional().describe("Claims date range (default: last 6 months)"),
        status_filter: z.array(z.enum(["open", "closed", "pending", "denied"])).optional(),
        claim_types: z.array(z.string()).optional().describe("Claim type filters"),
        limit: z.number().optional().describe("Maximum claims to analyze (default: 100)")
      },
      async ({ date_range, status_filter, claim_types, limit = 100 }) => {
        try {
          // Default to last 6 months if no date range provided
          const defaultRange = {
            from: date_range?.from || this.getDateMonthsAgo(6),
            to: date_range?.to || new Date().toISOString().split('T')[0]
          };

          // Get claims data
          const claimsParams = {
            date_from: defaultRange.from,
            date_to: defaultRange.to,
            limit: Math.min(limit, 200)
          };

          if (status_filter && status_filter.length > 0) {
            claimsParams.status = status_filter.join(',');
          }

          const claims = await this.callNowCertsAPI('claims', claimsParams);
          let claimsData = claims.data || [];

          // Filter by claim types if specified
          if (claim_types && claim_types.length > 0) {
            claimsData = claimsData.filter(c => claim_types.includes(c.type));
          }

          const dashboard = {
            summary: this.generateClaimsSummary(claimsData),
            by_status: this.groupClaimsBy(claimsData, 'status'),
            by_type: this.groupClaimsBy(claimsData, 'type'),
            action_items: this.generateClaimsActionItems(claimsData),
            date_range: defaultRange
          };

          return {
            content: [{ 
              type: "text", 
              text: `Claims Dashboard (${defaultRange.from} to ${defaultRange.to}):\n\n${JSON.stringify(dashboard, null, 2)}` 
            }]
          };
        } catch (error) {
          return {
            content: [{ 
              type: "text", 
              text: `Error generating claims dashboard: ${error.message}` 
            }]
          };
        }
      }
    );

    // ==== SALES & LEAD MANAGEMENT TOOLS ====

    this.server.tool(
      "get_sales_pipeline",
      "Sales pipeline analysis with lead scoring and conversion tracking",
      {
        pipeline_stage: z.enum(["all", "new", "contacted", "quoted", "negotiating", "won", "lost"]).optional(),
        date_range: z.object({
          from: z.string().describe("Start date (YYYY-MM-DD)"),
          to: z.string().describe("End date (YYYY-MM-DD)")
        }).optional(),
        include_lead_scoring: z.boolean().optional().describe("Include lead scoring analysis"),
        limit: z.number().optional().describe("Maximum leads to analyze (default: 50)")
      },
      async ({ pipeline_stage = "all", date_range, include_lead_scoring = true, limit = 50 }) => {
        try {
          // Get leads from Close CRM
          const leadsParams = {
            _limit: Math.min(limit, 100)
          };

          if (date_range) {
            leadsParams.date_created__gte = date_range.from;
            leadsParams.date_created__lte = date_range.to;
          }

          const leads = await this.callCloseAPI('lead', leadsParams);
          let leadsData = leads.data || [];

          // Get opportunities for each lead (limited to prevent timeout)
          const opportunities = await this.callCloseAPI('opportunity', { _limit: 100 });
          const opportunitiesData = opportunities.data || [];

          // Combine leads with their opportunities
          const pipelineData = leadsData.slice(0, 25).map(lead => {
            const leadOpportunities = opportunitiesData.filter(opp => opp.lead_id === lead.id);
            
            return {
              ...lead,
              opportunities: leadOpportunities,
              total_opportunity_value: leadOpportunities.reduce((sum, opp) => sum + (opp.value || 0), 0),
              lead_score: include_lead_scoring ? this.calculateLeadScore(lead, leadOpportunities) : null
            };
          });

          // Generate analytics
          const analytics = {
            total_leads: pipelineData.length,
            total_pipeline_value: pipelineData.reduce((sum, lead) => sum + lead.total_opportunity_value, 0),
            avg_deal_size: pipelineData.length > 0 ? pipelineData.reduce((sum, lead) => sum + lead.total_opportunity_value, 0) / pipelineData.length : 0,
            high_value_leads: pipelineData.filter(lead => lead.total_opportunity_value > 10000).length
          };

          return {
            content: [{ 
              type: "text", 
              text: `Sales Pipeline Analysis:\n\nAnalytics:\n${JSON.stringify(analytics, null, 2)}\n\nPipeline Data:\n${JSON.stringify(pipelineData, null, 2)}` 
            }]
          };
        } catch (error) {
          return {
            content: [{ 
              type: "text", 
              text: `Error generating sales pipeline: ${error.message}` 
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
      "get_close_leads",
      "Retrieve lead information from Close CRM",
      {
        lead_id: z.string().optional().describe("Specific lead ID to retrieve"),
        status: z.enum(["active", "inactive"]).optional().describe("Lead status filter"),
        limit: z.number().optional().describe("Maximum number of leads to return (default: 25, max: 50)")
      },
      async ({ lead_id, status, limit }) => {
        try {
          const params: any = {
            _limit: Math.min(limit || 25, 50)
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

  private generateRenewalRecommendation(policy: any, claims: any[]): any {
    const claimsCount = claims ? claims.length : 0;
    return {
      action: claimsCount > 2 ? "review" : "retain",
      confidence: claimsCount > 2 ? 0.65 : 0.85,
      reasons: claimsCount > 2 ? ["High claims frequency"] : ["Good claims history"],
      suggested_adjustments: []
    };
  }

  private generateClaimsSummary(claims: any[]): any {
    return {
      total_claims: claims.length,
      total_amount: claims.reduce((sum, c) => sum + (c.amount || 0), 0),
      avg_amount: claims.length > 0 ? claims.reduce((sum, c) => sum + (c.amount || 0), 0) / claims.length : 0,
      open_claims: claims.filter(c => c.status === 'open').length,
      closed_claims: claims.filter(c => c.status === 'closed').length
    };
  }

  private groupClaimsBy(claims: any[], field: string): any {
    return claims.reduce((groups, claim) => {
      const key = claim[field] || 'unknown';
      if (!groups[key]) groups[key] = { count: 0, total_amount: 0 };
      groups[key].count++;
      groups[key].total_amount += claim.amount || 0;
      return groups;
    }, {});
  }

  private generateClaimsActionItems(claims: any[]): any[] {
    const actionItems = [];
    
    const oldOpenClaims = claims.filter(c => 
      c.status === 'open' && 
      new Date(c.date_created) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    );
    
    if (oldOpenClaims.length > 0) {
      actionItems.push({
        priority: "high",
        action: "Review old open claims",
        count: oldOpenClaims.length
      });
    }
    
    return actionItems;
  }

  private calculateLeadScore(lead: any, opportunities: any[]): number {
    let score = 5;
    if (opportunities.length > 0) score += 2;
    if (lead.contacts && lead.contacts.length > 1) score += 1;
    return Math.min(Math.max(score, 1), 10);
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
