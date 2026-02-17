import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useToastContext } from '@librechat/client';
import CEOKpiStats from './CEO/CEOKpiStats';
import CEOProjectsTable from './CEO/CEOProjectsTable';
import CEOStrategicTools from './CEO/CEOStrategicTools';
import CEOReportView from './CEO/CEOReportView';
import CEOUserManagement from './CEO/CEOUserManagement';
import { AuditManagementPage } from '~/components/Audit';
import { useFeatureFlag } from '~/hooks/useFeatureFlag';
import { FEATURES } from '~/constants/businesses';

// --- TYPES ---
interface Project {
  projectId: string;
  name: string;
  status: string;
  progress: number;
  budget: number;
  spent: number;
  startDate: string;
  deadline: string;
}

interface AnalysisReport {
  title: string;
  summary: string;
  insights: string[];
  metrics: any;
  timestamp: string;
}

export default function CEODashboard({ profile }: { profile: any }) {
  console.log('🎯 [CEODashboard] Component mounted/rendered');
  console.log('👤 [CEODashboard] Profile data:', profile);
  console.log('🔑 [CEODashboard] Profile type:', profile?.profileType);
  console.log('📋 [CEODashboard] Allowed workflows:', profile?.allowedWorkflows);

  const { showToast } = useToastContext();
  const reportSectionRef = useRef<HTMLDivElement>(null); // Ref untuk auto-scroll

  // --- STATE ---
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Workflow Execution State
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [activeReport, setActiveReport] = useState<AnalysisReport | null>(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [creating, setCreating] = useState(false);

  // Edit modals
  const [editingTask, setEditingTask] = useState<any | null>(null);
  const [editingProject, setEditingProject] = useState<any | null>(null);
  const [editingTicket, setEditingTicket] = useState<any | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<
    'overview' | 'projects' | 'tasks' | 'tickets' | 'analytics' | 'users' | 'audit'
  >('overview');

  // Feature flags
  const { isEnabled: isAuditEnabled } = useFeatureFlag(FEATURES.AUDIT);

  // Form states
  const [projectForm, setProjectForm] = useState({
    name: '',
    description: '',
    status: 'active',
    progress: 0,
    budget: 0,
    spent: 0,
    startDate: '',
    deadline: '',
    managerId: '',
  });
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    assignedTo: '',
    priority: 'medium',
    status: 'pending',
    dueDate: '',
  });
  const [ticketForm, setTicketForm] = useState({
    subject: '',
    description: '',
    priority: 'medium',
    userId: '',
  });

  // Users list for dropdowns
  const [users, setUsers] = useState<any[]>([]);

  // CONFIGURATION
  // 1. URL N8N from environment variable with fallback
  const n8nBaseUrl = import.meta.env.VITE_N8N_WEBHOOK_URL || 'https://nadyaputriast-n8n.hf.space';

  // 2. OpenAI Key (Pastikan di .env namanya VITE_OPENAI_API_KEY)
  const openAiKey = import.meta.env.VITE_OPENAI_API_KEY;

  // --- HELPER: SAFE FETCH ---
  const safeFetch = async (url: string, options: any) => {
    try {
      console.log('🌐 [safeFetch] Making request to:', url);
      const response = await fetch(url, options);
      console.log('📡 [safeFetch] Response status:', response.status, response.statusText);
      console.log(
        '📡 [safeFetch] Response headers:',
        Object.fromEntries(response.headers.entries()),
      );

      if (!response.ok) {
        const errText = await response.text();
        console.error('❌ [safeFetch] Error response body (full):', errText);
        console.error('❌ [safeFetch] Status:', response.status);
        throw new Error(`Server Error (${response.status}): ${errText.substring(0, 200)}`);
      }

      const contentType = response.headers.get('content-type');
      console.log('📄 [safeFetch] Content-Type:', contentType);

      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        console.log('✅ [safeFetch] JSON parsed successfully');
        return data;
      }

      const textResponse = await response.text();
      console.error('❌ [safeFetch] Non-JSON response:', textResponse);
      throw new Error('Invalid response format (Not JSON)');
    } catch (error) {
      console.error('❌ [safeFetch] Fetch error:', error);
      throw error;
    }
  };

  // --- 1. FETCH PROJECT DATA (INITIAL LOAD) ---
  const fetchDashboardData = async () => {
    console.log('🔄 [CEODashboard] Fetching project data...');
    console.log('📍 [CEODashboard] N8N URL:', `${n8nBaseUrl}/webhook/librechat/project-status`);
    setLoading(true);
    try {
      const payload = { profileType: 'ceo', action: 'list' };
      console.log('📤 [CEODashboard] Request payload:', payload);

      const result = await safeFetch(`${n8nBaseUrl}/webhook/librechat/project-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      console.log('📥 [CEODashboard] Raw API response:', result);
      console.log('📊 [CEODashboard] Response type:', typeof result);
      console.log('📊 [CEODashboard] Is Array?:', Array.isArray(result));

      let data = [];
      if (result?.data?.projects) {
        data = result.data.projects;
        console.log('✅ [CEODashboard] Extracted from result.data.projects');
      } else if (Array.isArray(result)) {
        data = result;
        console.log('✅ [CEODashboard] Used result directly (array)');
      } else if (result?.data && Array.isArray(result.data)) {
        data = result.data;
        console.log('✅ [CEODashboard] Extracted from result.data');
      } else {
        console.warn('⚠️ [CEODashboard] Unknown response structure');
      }

      console.log('📊 [CEODashboard] Final projects data:', data);
      console.log('📊 [CEODashboard] Projects count:', data.length);
      setProjects(data);
    } catch (error) {
      console.error('❌ [CEODashboard] Fetch failed:', error);
      console.error('❌ [CEODashboard] Error details:', {
        message: error.message,
        stack: error.stack,
      });
    } finally {
      setLoading(false);
      console.log('✅ [CEODashboard] Loading complete');
    }
  };

  useEffect(() => {
    console.log('🔄 [CEODashboard] useEffect triggered - fetching dashboard data');
    fetchDashboardData();
    fetchUsers(); // Load users for dropdowns
    fetchTasks(); // Load tasks
    fetchTickets(); // Load tickets
  }, []);

  // Fetch users for dropdowns
  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/admin/users', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  // Fetch tasks using the task-management endpoint
  const fetchTasks = async () => {
    try {
      const response = await fetch(`${n8nBaseUrl}/webhook/librechat/task-management`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}), // Empty = all tasks
      });
      if (response.ok) {
        const data = await response.json();
        setTasks(data.tasks || []);
      } else {
        console.warn('Task management endpoint error:', response.status);
        setTasks([]);
      }
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
      setTasks([]);
    }
  };

  // Fetch tickets
  const fetchTickets = async () => {
    try {
      const response = await fetch(`${n8nBaseUrl}/webhook/librechat/support-ticket-list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'admin' }),
      });
      if (response.ok) {
        const data = await response.json();
        setTickets(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch tickets:', error);
    }
  };

  // --- 2. FUNGSI DIRECT OPENAI (Client-Side) ---
  const generateAIAnalysis = async (dataContext: any, reportTitle: string) => {
    if (!openAiKey) {
      console.warn('Missing VITE_OPENAI_API_KEY in .env');
      return {
        summary: 'OpenAI Key missing. Displaying raw data only.',
        insights: ['Please configure VITE_OPENAI_API_KEY in your .env file.'],
      };
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini', // Model cepat & hemat
          messages: [
            {
              role: 'system',
              content: `You are a Senior Executive Assistant analyzing dashboard data for a CEO.
              Output MUST be valid JSON with this structure:
              {
                "summary": "A 2-3 sentence executive summary highlighting performance and risks.",
                "insights": ["Strategic Point 1", "Strategic Point 2", "Strategic Point 3"]
              }`,
            },
            {
              role: 'user',
              content: `Analyze this ${reportTitle} data: ${JSON.stringify(dataContext)}`,
            },
          ],
          response_format: { type: 'json_object' },
        }),
      });

      const json = await response.json();
      return JSON.parse(json.choices[0].message.content);
    } catch (error) {
      console.error('OpenAI Error:', error);
      return {
        summary: 'AI Analysis unavailable due to connection error.',
        insights: ['Check console for details.'],
      };
    }
  };

  // --- 3. LOGIC UTAMA: EXEUCTE WORKFLOW ---
  const handleExecuteWorkflow = async (wf: any) => {
    console.log('🚀 [Workflow] Executing workflow:', wf);
    console.log('📋 [Workflow] Workflow ID:', wf.workflowId);
    console.log('📋 [Workflow] Workflow Name:', wf.workflowName);

    const id = (wf.workflowId || '').toLowerCase();
    const name = (wf.workflowName || '').toLowerCase();

    // Check if this is a Create operation - open the appropriate modal
    if (id.includes('create') || name.includes('create')) {
      if (id.includes('project') || name.includes('project')) {
        setShowProjectModal(true);
        return;
      } else if (id.includes('task') || name.includes('task')) {
        setShowTaskModal(true);
        return;
      } else if (id.includes('ticket') || name.includes('ticket')) {
        setShowTicketModal(true);
        return;
      }
    }

    // Check if this is Update/Delete operation (not implemented yet)
    if (
      id.includes('update') ||
      id.includes('delete') ||
      name.includes('update') ||
      name.includes('delete')
    ) {
      alert(`"${wf.workflowName}" is not yet implemented in the dashboard.`);
      return;
    }

    setExecutingId(wf.workflowId);

    try {
      // A. MAPPING URL N8N
      let endpoint = '';

      if (
        id.includes('financ') ||
        name.includes('financ') ||
        name.includes('revenue') ||
        name.includes('budget')
      ) {
        endpoint = `${n8nBaseUrl}/webhook/librechat/financial-analytics`;
        console.log('💰 [Workflow] Detected financial workflow');
      } else {
        endpoint = `${n8nBaseUrl}/webhook/librechat/company-metrics`;
        console.log('📊 [Workflow] Detected company metrics workflow');
      }

      console.log('📍 [Workflow] Endpoint URL:', endpoint);

      // B. AMBIL DATA DARI N8N - Match actual n8n API requirements
      let payload;
      if (id.includes('financ') || name.includes('financ')) {
        // Financial Analytics expects specific format
        payload = {
          period: 'last_30_days',
          _context: {
            profile: {
              profileType: 'ceo',
            },
          },
        };
      } else {
        // Company Metrics expects simple format
        payload = { profileType: 'ceo' };
      }
      console.log('📤 [Workflow] Request payload:', payload);

      const n8nResult = await safeFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      console.log('📥 [Workflow] Raw N8N response:', n8nResult);
      console.log('📊 [Workflow] Response type:', typeof n8nResult);
      console.log('📊 [Workflow] Is Array?:', Array.isArray(n8nResult));

      // Handle variasi struktur response N8N
      const rawData = Array.isArray(n8nResult) ? n8nResult[0] : n8nResult.data || n8nResult;
      console.log('🔍 [Workflow] Raw data extracted:', rawData);

      const metricsData = rawData.data || rawData.json || rawData;
      console.log('📊 [Workflow] Final metrics data:', metricsData);
      console.log('📊 [Workflow] Metrics keys:', metricsData ? Object.keys(metricsData) : 'null');

      if (!metricsData) {
        console.error('❌ [Workflow] No metrics data received!');
        throw new Error('No data received from N8N');
      }

      // C. KIRIM DATA KE OPENAI (Untuk Narasi)
      console.log('🤖 [Workflow] Sending to OpenAI for analysis...');
      showToast({ message: 'Generating AI Insights...', status: 'info' });
      const aiResult = await generateAIAnalysis(metricsData, wf.workflowName);
      console.log('🤖 [Workflow] AI analysis result:', aiResult);

      // D. GABUNGKAN & TAMPILKAN
      const report: AnalysisReport = {
        title: wf.workflowName,
        summary: aiResult.summary, // Dari OpenAI
        insights: aiResult.insights, // Dari OpenAI
        metrics: metricsData, // Dari N8N (Angka Asli)
        timestamp: new Date().toLocaleString(),
      };

      console.log('✅ [Workflow] Report generated:', report);
      setActiveReport(report);
      showToast({ message: 'Report Ready', status: 'success' });

      // Auto-scroll ke report section
      setTimeout(() => {
        reportSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 200);
    } catch (e: any) {
      console.error('❌ [Workflow] Execution failed:', e);
      console.error('❌ [Workflow] Error message:', e.message);
      console.error('❌ [Workflow] Error stack:', e.stack);
      showToast({ message: `Failed: ${e.message}`, status: 'error' });
    } finally {
      setExecutingId(null);
      console.log('🏁 [Workflow] Execution complete');
    }
  };

  // --- CREATE HANDLERS ---
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const response = await fetch(`${n8nBaseUrl}/webhook/librechat/project-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...projectForm, profileType: profile?.profileType }),
      });
      if (!response.ok) throw new Error('Failed to create project');
      const result = await response.json();
      showToast({ message: `Project created: ${result.projectId}`, status: 'success' });
      setShowProjectModal(false);
      setProjectForm({
        name: '',
        description: '',
        status: 'active',
        progress: 0,
        budget: 0,
        spent: 0,
        startDate: '',
        deadline: '',
        managerId: '',
      });
      fetchDashboardData(); // Refresh projects
    } catch (error: any) {
      showToast({ message: error.message, status: 'error' });
    } finally {
      setCreating(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const response = await fetch(`${n8nBaseUrl}/webhook/librechat/task-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskForm),
      });
      if (!response.ok) throw new Error('Failed to create task');
      const result = await response.json();
      showToast({ message: `Task created: ${result.taskId}`, status: 'success' });
      setShowTaskModal(false);
      setTaskForm({
        title: '',
        description: '',
        assignedTo: '',
        priority: 'medium',
        status: 'pending',
        dueDate: '',
      });
      fetchTasks(); // Refresh tasks list
    } catch (error: any) {
      showToast({ message: error.message, status: 'error' });
    } finally {
      setCreating(false);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const response = await fetch(`${n8nBaseUrl}/webhook/librechat/support-ticket-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ticketForm),
      });
      if (!response.ok) throw new Error('Failed to create ticket');
      const result = await response.json();
      showToast({ message: `Ticket created: ${result.data.ticketId}`, status: 'success' });
      setShowTicketModal(false);
      setTicketForm({ subject: '', description: '', priority: 'medium', userId: '' });
      fetchTickets(); // Refresh tickets list
    } catch (error: any) {
      showToast({ message: error.message, status: 'error' });
    } finally {
      setCreating(false);
    }
  };

  // --- UPDATE HANDLERS ---
  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;
    setCreating(true);
    try {
      const response = await fetch(`${n8nBaseUrl}/webhook/librechat/project-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: editingProject.projectId,
          ...projectForm,
        }),
      });
      if (!response.ok) throw new Error('Failed to update project');
      showToast({ message: 'Project updated successfully', status: 'success' });
      setEditingProject(null);
      setProjectForm({
        name: '',
        description: '',
        status: 'active',
        progress: 0,
        budget: 0,
        spent: 0,
        startDate: '',
        deadline: '',
        managerId: '',
      });
      fetchDashboardData(); // Refresh projects
    } catch (error: any) {
      showToast({ message: error.message, status: 'error' });
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;
    setCreating(true);
    try {
      const response = await fetch(`${n8nBaseUrl}/webhook/librechat/task-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: editingTask._id,
          ...taskForm,
        }),
      });
      if (!response.ok) throw new Error('Failed to update task');
      showToast({ message: 'Task updated successfully', status: 'success' });
      setEditingTask(null);
      setTaskForm({
        title: '',
        description: '',
        assignedTo: '',
        priority: 'medium',
        status: 'pending',
        dueDate: '',
      });
      fetchTasks(); // Refresh tasks
    } catch (error: any) {
      showToast({ message: error.message, status: 'error' });
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTicket) return;
    setCreating(true);
    try {
      const response = await fetch(`${n8nBaseUrl}/webhook/librechat/support-ticket-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: editingTicket.ticketId,
          status: ticketForm.subject, // Using subject field as status
          priority: ticketForm.priority,
        }),
      });
      if (!response.ok) throw new Error('Failed to update ticket');
      showToast({ message: 'Ticket updated successfully', status: 'success' });
      setEditingTicket(null);
      setTicketForm({ subject: '', description: '', priority: 'medium', userId: '' });
      fetchTickets(); // Refresh tickets
    } catch (error: any) {
      showToast({ message: error.message, status: 'error' });
    } finally {
      setCreating(false);
    }
  };

  // --- 4. KPI STATS CALCULATION ---
  const kpiStats = useMemo(() => {
    console.log('📊 [KPI] Calculating KPI stats...');
    console.log('📊 [KPI] Projects data:', projects);
    console.log('📊 [KPI] Number of projects:', projects.length);

    const totalBudget = projects.reduce((acc, p) => acc + (p.budget || 0), 0);
    const totalSpent = projects.reduce((acc, p) => acc + (p.spent || 0), 0);
    const activeCount = projects.filter((p) => p.status === 'active').length;

    console.log('💰 [KPI] Total Budget:', totalBudget);
    console.log('💸 [KPI] Total Spent:', totalSpent);
    console.log('🚀 [KPI] Active Projects:', activeCount);

    // Simulasi Margin (karena data project biasanya cuma cost)
    const estimatedRevenue = totalBudget * 1.2;
    const margin =
      totalBudget > 0
        ? (((estimatedRevenue - totalSpent) / estimatedRevenue) * 100).toFixed(1)
        : '0';

    console.log('📈 [KPI] Estimated Revenue:', estimatedRevenue);
    console.log('📊 [KPI] Margin:', margin + '%');

    const stats = [
      {
        title: 'Total Budget',
        value: `$${(totalBudget / 1000).toFixed(1)}K`,
        icon: (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        ),
        color: 'text-blue-600',
        bg: 'bg-blue-50',
      },
      {
        title: 'Actual Spent',
        value: `$${(totalSpent / 1000).toFixed(1)}K`,
        icon: (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
          />
        ),
        color: 'text-orange-600',
        bg: 'bg-orange-50',
      },
      {
        title: 'Active Projects',
        value: activeCount.toString(),
        icon: (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        ),
        color: 'text-purple-600',
        bg: 'bg-purple-50',
      },
      {
        title: 'Est. Margin',
        value: `${margin}%`,
        icon: (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        ),
        color: parseFloat(margin) > 20 ? 'text-green-600' : 'text-yellow-600',
        bg: parseFloat(margin) > 20 ? 'bg-green-50' : 'bg-yellow-50',
      },
    ];

    console.log('✅ [KPI] Stats calculated:', stats);
    return stats;
  }, [projects]);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'projects', label: 'Projects', icon: '🗂️', count: projects.length },
    { id: 'tasks', label: 'Tasks', icon: '✅', count: tasks.length },
    { id: 'tickets', label: 'Tickets', icon: '🎫', count: tickets.length },
    { id: 'analytics', label: 'Analytics', icon: '📈' },
    { id: 'users', label: 'Users', icon: '👥', count: users.length },
    ...(isAuditEnabled ? [{ id: 'audit', label: 'Audit', icon: '🔍' }] : []),
  ];

  return (
    <div className="w-full space-y-6 pb-20">
      {/* HEADER */}
      <div className="flex flex-col items-end justify-between border-b border-gray-200 pb-4 md:flex-row">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">
            Executive Command Center
          </h1>
          <p className="mt-1 text-gray-500">
            Real-time oversight of strategic initiatives & financial health.
          </p>
        </div>
        <div className="mt-4 flex gap-2 md:mt-0">
          <span className="flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600">
            🟢 Live Data
          </span>
          <button
            onClick={() => {
              fetchDashboardData();
              fetchTasks();
              fetchTickets();
              fetchUsers();
            }}
            className="rounded-lg px-3 py-1 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* TABS */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-2 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`ml-1 rounded-full px-2 py-0.5 text-xs ${
                    activeTab === tab.id ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* TAB CONTENT */}
      {activeTab === 'overview' && (
        <>
          <CEOKpiStats kpiStats={kpiStats} />
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <CEOProjectsTable projects={projects} />
            </div>
            <div className="space-y-6">
              <CEOStrategicTools
                profile={profile}
                executingId={executingId}
                activeReport={activeReport}
                handleExecuteWorkflow={handleExecuteWorkflow}
              />
            </div>
          </div>
          <CEOReportView
            activeReport={activeReport}
            onClose={() => setActiveReport(null)}
            reportSectionRef={reportSectionRef}
          />
        </>
      )}

      {activeTab === 'projects' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">All Projects</h2>
            <button
              onClick={() => setShowProjectModal(true)}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <span>+</span> New Project
            </button>
          </div>
          <CEOProjectsTable projects={projects} />
        </div>
      )}

      {activeTab === 'tasks' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">All Tasks</h2>
            <button
              onClick={() => setShowTaskModal(true)}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              <span>+</span> New Task
            </button>
          </div>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-600 border-t-transparent"></div>
              </div>
            ) : tasks.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-gray-500">
                <span className="mb-2 text-4xl">✅</span>
                <p className="mb-2">No tasks found</p>
                <button
                  onClick={() => setShowTaskModal(true)}
                  className="mt-4 text-sm text-blue-600 hover:underline"
                >
                  Create your first task
                </button>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Task
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Assigned To
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Priority
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Due Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {tasks.map((task, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{task.title}</div>
                        <div className="text-sm text-gray-500">{task.description}</div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {task.assignedName || task.assignedTo}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2 text-xs font-semibold ${
                            task.priority === 'high'
                              ? 'bg-red-100 text-red-800'
                              : task.priority === 'medium'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {task.priority}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {task.status}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {task.dueDate || '-'}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm">
                        <button
                          onClick={() => {
                            setEditingTask(task);
                            setTaskForm({
                              title: task.title,
                              description: task.description,
                              assignedTo: task.assignedTo,
                              priority: task.priority,
                              status: task.status,
                              dueDate: task.dueDate || '',
                            });
                          }}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'tickets' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Support Tickets</h2>
            <button
              onClick={() => setShowTicketModal(true)}
              className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700"
            >
              <span>+</span> New Ticket
            </button>
          </div>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-600 border-t-transparent"></div>
              </div>
            ) : tickets.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-gray-500">
                <span className="mb-2 text-4xl">🎫</span>
                <p>No tickets found</p>
                <button
                  onClick={() => setShowTicketModal(true)}
                  className="mt-4 text-sm text-blue-600 hover:underline"
                >
                  Create your first ticket
                </button>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Ticket ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Subject
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Priority
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {tickets.map((ticket, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                        {ticket.ticketId}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{ticket.subject}</div>
                        <div className="text-sm text-gray-500">{ticket.description}</div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {ticket.userId}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2 text-xs font-semibold ${
                            ticket.priority === 'high'
                              ? 'bg-red-100 text-red-800'
                              : ticket.priority === 'medium'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {ticket.priority}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {ticket.status}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm">
                        <button
                          onClick={() => {
                            setEditingTicket(ticket);
                            setTicketForm({
                              subject: ticket.status, // Store current status in subject field
                              description: ticket.description,
                              priority: ticket.priority,
                              userId: ticket.userId,
                            });
                          }}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <CEOReportView
            activeReport={activeReport}
            onClose={() => setActiveReport(null)}
            reportSectionRef={reportSectionRef}
          />
          <div className="space-y-6">
            <CEOStrategicTools
              profile={profile}
              executingId={executingId}
              activeReport={activeReport}
              handleExecuteWorkflow={handleExecuteWorkflow}
            />
          </div>
        </div>
      )}

      {activeTab === 'users' && <CEOUserManagement />}

      {activeTab === 'audit' && isAuditEnabled && (
        <div className="space-y-4">
          <AuditManagementPage />
        </div>
      )}

      {/* CREATE PROJECT MODAL - Rendered from CEOQuickActions forms */}
      {showProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-xl font-bold text-gray-900">Create New Project</h3>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Project Name *
                  </label>
                  <input
                    type="text"
                    value={projectForm.name}
                    onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Description
                  </label>
                  <textarea
                    value={projectForm.description}
                    onChange={(e) =>
                      setProjectForm({ ...projectForm, description: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
                  <select
                    value={projectForm.status}
                    onChange={(e) => setProjectForm({ ...projectForm, status: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="active">Active</option>
                    <option value="pending">Pending</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Progress (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={projectForm.progress}
                    onChange={(e) =>
                      setProjectForm({ ...projectForm, progress: parseInt(e.target.value) || 0 })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Budget</label>
                  <input
                    type="number"
                    value={projectForm.budget}
                    onChange={(e) =>
                      setProjectForm({ ...projectForm, budget: parseInt(e.target.value) || 0 })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Spent</label>
                  <input
                    type="number"
                    value={projectForm.spent}
                    onChange={(e) =>
                      setProjectForm({ ...projectForm, spent: parseInt(e.target.value) || 0 })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Start Date</label>
                  <input
                    type="date"
                    value={projectForm.startDate}
                    onChange={(e) => setProjectForm({ ...projectForm, startDate: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Deadline</label>
                  <input
                    type="date"
                    value={projectForm.deadline}
                    onChange={(e) => setProjectForm({ ...projectForm, deadline: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Project Manager
                  </label>
                  <select
                    value={projectForm.managerId}
                    onChange={(e) => setProjectForm({ ...projectForm, managerId: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">No manager assigned</option>
                    {users
                      .filter((u) => u.profileType !== 'customer')
                      .map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name} ({user.email}) - {user.profileType}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowProjectModal(false)}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE TASK MODAL */}
      {showTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-xl font-bold text-gray-900">Create New Task</h3>
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Title *</label>
                <input
                  type="text"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  rows={3}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Assigned To *
                </label>
                <select
                  value={taskForm.assignedTo}
                  onChange={(e) => setTaskForm({ ...taskForm, assignedTo: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  required
                >
                  <option value="">Select a user...</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.email}) - {user.profileType}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Priority</label>
                <select
                  value={taskForm.priority}
                  onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Due Date</label>
                <input
                  type="date"
                  value={taskForm.dueDate}
                  onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowTaskModal(false)}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT TASK MODAL */}
      {editingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-xl font-bold text-gray-900">Edit Task</h3>
            <form onSubmit={handleUpdateTask} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Title *</label>
                <input
                  type="text"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  rows={3}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Assigned To *
                </label>
                <select
                  value={taskForm.assignedTo}
                  onChange={(e) => setTaskForm({ ...taskForm, assignedTo: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  required
                >
                  <option value="">Select a user...</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.email}) - {user.profileType}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Priority</label>
                <select
                  value={taskForm.priority}
                  onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
                <select
                  value={taskForm.status}
                  onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="pending">Pending</option>
                  <option value="in-progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Due Date</label>
                <input
                  type="date"
                  value={taskForm.dueDate}
                  onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setEditingTask(null);
                    setTaskForm({
                      title: '',
                      description: '',
                      assignedTo: '',
                      priority: 'medium',
                      status: 'pending',
                      dueDate: '',
                    });
                  }}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                >
                  {creating ? 'Updating...' : 'Update Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE TICKET MODAL */}
      {showTicketModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-xl font-bold text-gray-900">Create Support Ticket</h3>
            <form onSubmit={handleCreateTicket} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Subject *</label>
                <input
                  type="text"
                  value={ticketForm.subject}
                  onChange={(e) => setTicketForm({ ...ticketForm, subject: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Description *
                </label>
                <textarea
                  value={ticketForm.description}
                  onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  rows={4}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Priority</label>
                <select
                  value={ticketForm.priority}
                  onChange={(e) => setTicketForm({ ...ticketForm, priority: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">User *</label>
                <select
                  value={ticketForm.userId}
                  onChange={(e) => setTicketForm({ ...ticketForm, userId: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  required
                >
                  <option value="">Select a user...</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.email}) - {user.profileType}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowTicketModal(false)}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT TICKET MODAL */}
      {editingTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-xl font-bold text-gray-900">Edit Support Ticket</h3>
            <form onSubmit={handleUpdateTicket} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Ticket ID</label>
                <input
                  type="text"
                  value={editingTicket.ticketId}
                  disabled
                  className="w-full rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Status *</label>
                <select
                  value={ticketForm.subject}
                  onChange={(e) => setTicketForm({ ...ticketForm, subject: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  required
                >
                  <option value="open">Open</option>
                  <option value="in-progress">In Progress</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Priority</label>
                <select
                  value={ticketForm.priority}
                  onChange={(e) => setTicketForm({ ...ticketForm, priority: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setEditingTicket(null);
                    setTicketForm({ subject: '', description: '', priority: 'medium', userId: '' });
                  }}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700 disabled:opacity-50"
                >
                  {creating ? 'Updating...' : 'Update Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
