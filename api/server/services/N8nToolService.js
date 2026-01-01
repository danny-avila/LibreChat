const axios = require('axios');
const { logger } = require('@librechat/data-schemas');
const { Tools } = require('librechat-data-provider');
const Profile = require('../models/Profile');

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://nadyaputriast-n8n.hf.space';
const N8N_TIMEOUT = parseInt(process.env.N8N_TIMEOUT) || 30000;

class N8nToolService {
  constructor() {
    this.toolCache = new Map();
    this.workflowDefinitions = this.defineWorkflows();
  }

  /**
   * DEFINISI UTAMA WORKFLOW
   * Key menggunakan "wf_" sesuai database kamu.
   */
  defineWorkflows() {
    return {
      // ===== 1. EXECUTIVE / CEO TOOLS =====
      wf_financial_analytics: {
        name: 'get_financial_analytics',
        label: 'Financial Analytics',
        description: 'Get comprehensive financial analytics including revenue, expenses, profit.',
        endpoint: '/webhook/librechat/financial-analytics',
        profileTypes: ['ceo'],
        parameters: {
          type: 'object',
          properties: {
            period: { type: 'string', default: 'Q4 2024' },
            department: {
              type: 'string',
              enum: ['Sales', 'Marketing', 'Engineering', 'Operations', 'all'],
            },
          },
          required: ['period'],
        },
      },
      wf_company_metrics: {
        name: 'get_company_metrics',
        label: 'Company Metrics',
        description: 'Get company-wide KPIs, employee count, and satisfaction scores.',
        endpoint: '/webhook/librechat/company-metrics',
        profileTypes: ['ceo'],
        parameters: {
          type: 'object',
          properties: {
            metricType: { type: 'string', default: 'all' },
          },
        },
      },

      // ===== 2. PROJECT MANAGEMENT =====
      wf_create_project: {
        name: 'create_project',
        label: 'Create Project',
        description: 'Create a new project definition.',
        endpoint: '/webhook/librechat/project-create',
        profileTypes: ['employee', 'customer'],
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            budget: { type: 'number' },
            deadline: { type: 'string' },
          },
          required: ['name', 'description'],
        },
      },
      wf_list_project: {
        name: 'list_project',
        label: 'List Projects',
        description: 'List existing projects and their statuses.',
        endpoint: '/webhook/librechat/project-status',
        profileTypes: ['employee', 'customer'],
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', default: 'list' },
            projectId: { type: 'string' },
          },
          required: ['action'],
        },
      },
      wf_update_project: {
        name: 'update_project',
        label: 'Update Project',
        description: 'Update project details, status, or progress.',
        endpoint: '/webhook/librechat/project-update',
        profileTypes: ['employee', 'customer'],
        parameters: {
          type: 'object',
          properties: {
            projectId: { type: 'string' },
            status: { type: 'string' },
            progress: { type: 'number' },
          },
          required: ['projectId'],
        },
      },

      // ===== 3. TASK MANAGEMENT =====
      wf_task_create: {
        name: 'create_task',
        label: 'Create Task',
        description: 'Create a new task assignment.',
        endpoint: '/webhook/librechat/task-create',
        profileTypes: ['employee'],
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            priority: { type: 'string', enum: ['low', 'medium', 'high'] },
            assignedTo: { type: 'string' },
          },
          required: ['title'],
        },
      },
      wf_task_list: {
        name: 'list_task',
        label: 'List Tasks',
        description: 'View list of tasks.',
        endpoint: '/webhook/librechat/task-management',
        profileTypes: ['employee'],
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', default: 'list' },
            status: { type: 'string' },
          },
          required: ['action'],
        },
      },
      wf_task_update: {
        name: 'update_task',
        label: 'Update Task',
        description: 'Update task status or details.',
        endpoint: '/webhook/librechat/task-update',
        profileTypes: ['employee'],
        parameters: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'in-progress', 'completed'] },
          },
          required: ['_id'],
        },
      },
      wf_task_delete: {
        name: 'delete_task',
        label: 'Delete Task',
        description: 'Remove a task.',
        endpoint: '/webhook/librechat/task-delete',
        profileTypes: ['employee'],
        parameters: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
          },
          required: ['_id'],
        },
      },

      // ===== 4. SUPPORT TICKETS =====
      wf_ticket_create: {
        name: 'create_support_ticket',
        label: 'Create Support Ticket',
        description: 'Submit a new support ticket.',
        endpoint: '/webhook/librechat/support-ticket-create',
        profileTypes: ['customer', 'employee'],
        parameters: {
          type: 'object',
          properties: {
            subject: { type: 'string' },
            description: { type: 'string' },
            priority: { type: 'string' },
            userId: { type: 'string' },
          },
          required: ['subject', 'description', 'userId'],
        },
      },
      wf_ticket_list: {
        name: 'list_support_ticket',
        label: 'List Support Tickets',
        description: 'View support tickets.',
        endpoint: '/webhook/librechat/support-ticket-list',
        profileTypes: ['customer', 'employee'],
        parameters: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            role: { type: 'string' },
          },
          required: ['userId'],
        },
      },
      wf_ticket_update: {
        name: 'update_support_ticket',
        label: 'Update Support Ticket',
        description: 'Update ticket status (claim, resolve, etc).',
        endpoint: '/webhook/librechat/support-ticket-update',
        profileTypes: ['customer', 'employee'],
        parameters: {
          type: 'object',
          properties: {
            ticketId: { type: 'string' },
            status: { type: 'string' },
            assignedTo: { type: 'string' },
          },
          required: ['ticketId'],
        },
      },
      wf_ticket_reply: {
        name: 'support_ticket_reply',
        label: 'Reply Support Ticket',
        description: 'Add a message/reply to a ticket.',
        endpoint: '/webhook/librechat/support-ticket-reply',
        profileTypes: ['customer', 'employee'],
        parameters: {
          type: 'object',
          properties: {
            ticketId: { type: 'string' },
            message: { type: 'string' },
            userId: { type: 'string' },
          },
          required: ['ticketId', 'message'],
        },
      },
      wf_ticket_delete: {
        name: 'delete_support_ticket',
        label: 'Delete Support Ticket',
        description: 'Delete a ticket.',
        endpoint: '/webhook/librechat/support-ticket-delete',
        profileTypes: ['customer', 'employee'],
        parameters: {
          type: 'object',
          properties: {
            ticketId: { type: 'string' },
          },
          required: ['ticketId'],
        },
      },

      // ===== 5. GENERAL =====
      wf_doc_search: {
        name: 'search_documents',
        label: 'Document Search',
        description: 'Search company documents and knowledge base.',
        endpoint: '/webhook/librechat/document-search',
        profileTypes: ['ceo', 'employee', 'customer'],
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
          required: ['query'],
        },
      },
    };
  }

  getWorkflowsForRole(role) {
    const allWorkflows = this.workflowDefinitions;
    const allowed = [];
    for (const [key, def] of Object.entries(allWorkflows)) {
      if (def.profileTypes.includes(role)) {
        allowed.push({ workflowId: key, workflowName: def.label || def.name });
      }
    }
    return allowed;
  }

  async getToolsForProfile(profileType) {
    const cacheKey = `tools_${profileType}`;
    if (this.toolCache.has(cacheKey)) return this.toolCache.get(cacheKey);

    const profile = await Profile.findOne({ profileType });
    if (!profile) return [];

    const tools = [];
    for (const workflow of profile.allowedWorkflows) {
      const workflowDef = this.workflowDefinitions[workflow.workflowId];
      if (workflowDef && workflowDef.profileTypes.includes(profileType)) {
        tools.push({
          type: Tools.function,
          function: {
            name: workflowDef.name,
            description: workflowDef.description,
            parameters: workflowDef.parameters,
          },
          _metadata: {
            workflowId: workflow.workflowId,
            endpoint: workflowDef.endpoint,
            workflowName: workflow.workflowName,
            profileTypes: workflowDef.profileTypes,
          },
        });
      }
    }
    this.toolCache.set(cacheKey, tools);
    return tools;
  }

  getToolByName(functionName) {
    for (const [workflowId, definition] of Object.entries(this.workflowDefinitions)) {
      if (definition.name === functionName) return { ...definition, workflowId };
    }
    return null;
  }

  /**
   * REVISI PENTING: Pengiriman Payload ke n8n
   * Kita taruh 'role' dan 'profileType' di root object agar n8n mudah membacanya.
   */
  async executeWorkflow(functionName, parameters, context) {
    try {
      logger.info(`[N8nToolService] Executing workflow: ${functionName}`);
      const tool = this.getToolByName(functionName);

      if (!tool) throw new Error(`Function not found: ${functionName}`);
      if (!tool.profileTypes.includes(context.profileType)) {
        throw new Error(`Profile ${context.profileType} not authorized for ${functionName}`);
      }

      // === PERBAIKAN DI SINI ===
      // Kita kirim profileType langsung di luar, bukan cuma di dalam _context
      // Supaya node "If" di n8n bisa langsung baca: {{ $json.role }}
      const payload = {
        ...parameters,
        role: context.profileType, // <--- INI KUNCINYA
        profileType: context.profileType, // Cadangan kalau n8n bacanya profileType
        userId: context.userId,

        // Tetap kirim _context untuk data lengkap
        _context: {
          profileType: context.profileType,
          userId: context.userId,
          username: context.username,
          timestamp: new Date().toISOString(),
          functionName: functionName,
        },
      };

      const url = `${N8N_WEBHOOK_URL}${tool.endpoint}`;
      logger.info(`[N8nToolService] Calling n8n: ${url}`);

      const response = await axios.post(url, payload, {
        timeout: N8N_TIMEOUT,
        headers: { 'Content-Type': 'application/json' },
      });

      return {
        success: true,
        functionName,
        data: response.data,
      };
    } catch (error) {
      logger.error(`[N8nToolService] Error: ${error.message}`);
      return {
        success: false,
        functionName,
        error: { message: error.message, details: error.response?.data },
      };
    }
  }

  clearCache() {
    this.toolCache.clear();
  }
  getAllWorkflows() {
    return this.workflowDefinitions;
  }
  isAuthorized(profileType, functionName) {
    const tool = this.getToolByName(functionName);
    return tool ? tool.profileTypes.includes(profileType) : false;
  }
}

const n8nToolService = new N8nToolService();
module.exports = n8nToolService;
