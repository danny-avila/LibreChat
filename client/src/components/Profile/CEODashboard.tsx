import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useToastContext } from '@librechat/client';
import CEOKpiStats from './CEO/CEOKpiStats';
import CEOProjectsTable from './CEO/CEOProjectsTable';
import CEOStrategicTools from './CEO/CEOStrategicTools';
import CEOReportView from './CEO/CEOReportView';
import CEOUserManagement from './CEO/CEOUserManagement';

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
  const [loading, setLoading] = useState(false);

  // Workflow Execution State
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [activeReport, setActiveReport] = useState<AnalysisReport | null>(null);

  // CONFIGURATION
  // 1. URL N8N Hardcoded (Agar stabil & tidak 404)
  const n8nBaseUrl = 'https://nadyaputriast-n8n.hf.space';

  // 2. OpenAI Key (Pastikan di .env namanya VITE_OPENAI_API_KEY)
  const openAiKey = import.meta.env.VITE_OPENAI_API_KEY;

  // --- HELPER: SAFE FETCH ---
  const safeFetch = async (url: string, options: any) => {
    try {
      console.log('🌐 [safeFetch] Making request to:', url);
      const response = await fetch(url, options);
      console.log('📡 [safeFetch] Response status:', response.status, response.statusText);
      console.log('📡 [safeFetch] Response headers:', Object.fromEntries(response.headers.entries()));
      
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
  }, []);

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
    
    setExecutingId(wf.workflowId);

    try {
      // A. MAPPING URL N8N
      const id = (wf.workflowId || '').toLowerCase();
      const name = (wf.workflowName || '').toLowerCase();
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

      // B. AMBIL DATA DARI N8N
      const payload = { userId: profile?.userId, profileType: 'ceo', workflowId: wf.workflowId };
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

  return (
    <div className="w-full space-y-8 pb-20">
      {/* HEADER */}
      <div className="flex flex-col items-end justify-between border-b border-gray-200 pb-6 md:flex-row">
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
            onClick={fetchDashboardData}
            className="rounded-lg px-3 py-1 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* KPI CARDS */}
      <CEOKpiStats kpiStats={kpiStats} />

      {/* DYNAMIC REPORT SECTION */}
      <CEOReportView
        activeReport={activeReport}
        onClose={() => setActiveReport(null)}
        reportSectionRef={reportSectionRef}
      />

      {/* MAIN GRID: PROJECTS & TOOLS */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* LEFT: ACTIVE PROJECTS */}
        <div className="space-y-6 lg:col-span-2">
          <CEOProjectsTable projects={projects} />
        </div>
        {/* RIGHT: STRATEGIC TOOLS */}
        <div className="space-y-6">
          <CEOStrategicTools
            profile={profile}
            executingId={executingId}
            activeReport={activeReport}
            handleExecuteWorkflow={handleExecuteWorkflow}
          />
        </div>
      </div>

      {/* USER MANAGEMENT SECTION */}
      <CEOUserManagement />
    </div>
  );
}
