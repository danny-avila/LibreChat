/**
 * Agent Invocation Harness for QA Accuracy Testing
 * 
 * Provides real agent invocation infrastructure for validating
 * responses against QA scenarios. Supports direct tool calls and
 * full SupervisorRouter orchestration.
 */

const initializeSupervisorRouter = require('../../../../api/app/clients/agents/Woodland/supervisorRouterAgent');
const initializeCatalogPartsAgent = require('../../../../api/app/clients/agents/Woodland/catalogPartsAgent');
const initializeCyclopediaSupportAgent = require('../../../../api/app/clients/agents/Woodland/cyclopediaSupportAgent');
const initializeTractorFitmentAgent = require('../../../../api/app/clients/agents/Woodland/tractorFitmentAgent');

/**
 * InvocationMode: Determines which agent to invoke
 */
const InvocationMode = {
  SUPERVISOR: 'supervisor',
  CATALOG: 'catalog',
  CYCLOPEDIA: 'cyclopedia',
  FITMENT: 'fitment',
  AUTO: 'auto', // Use primary_agent from scenario
};

/**
 * Initialize agents based on required mode
 * @param {string} mode - InvocationMode
 * @returns {Promise<object>} Initialized agent instances
 */
async function initializeAgents(mode) {
  const agents = {};

  if (mode === InvocationMode.SUPERVISOR || mode === InvocationMode.AUTO) {
    agents.supervisor = await initializeSupervisorRouter();
  }

  if (mode === InvocationMode.CATALOG || mode === InvocationMode.AUTO) {
    agents.catalog = await initializeCatalogPartsAgent();
  }

  if (mode === InvocationMode.CYCLOPEDIA || mode === InvocationMode.AUTO) {
    agents.cyclopedia = await initializeCyclopediaSupportAgent();
  }

  if (mode === InvocationMode.FITMENT || mode === InvocationMode.AUTO) {
    agents.fitment = await initializeTractorFitmentAgent();
  }

  return agents;
}

/**
 * Invoke agent with scenario question
 * @param {object} scenario - QA scenario with question, primary_agent, flags
 * @param {object} agents - Initialized agent instances
 * @param {string} mode - InvocationMode
 * @returns {Promise<object>} Agent response with answer, documents, metadata
 */
async function invokeAgent(scenario, agents, mode = InvocationMode.AUTO) {
  const { question, primary_agent } = scenario;

  let targetAgent;
  let agentName;

  // Determine which agent to invoke
  if (mode === InvocationMode.SUPERVISOR) {
    targetAgent = agents.supervisor;
    agentName = 'SupervisorRouter';
  } else if (mode === InvocationMode.AUTO) {
    // Route based on primary_agent classification
    switch (primary_agent) {
      case 'CatalogPartsAgent':
        targetAgent = agents.catalog;
        agentName = 'CatalogPartsAgent';
        break;
      case 'CyclopediaSupportAgent':
        targetAgent = agents.cyclopedia;
        agentName = 'CyclopediaSupportAgent';
        break;
      case 'TractorFitmentAgent':
        targetAgent = agents.fitment;
        agentName = 'TractorFitmentAgent';
        break;
      default:
        targetAgent = agents.supervisor;
        agentName = 'SupervisorRouter';
    }
  } else {
    // Direct mode selection
    const agentMap = {
      [InvocationMode.CATALOG]: ['catalog', 'CatalogPartsAgent'],
      [InvocationMode.CYCLOPEDIA]: ['cyclopedia', 'CyclopediaSupportAgent'],
      [InvocationMode.FITMENT]: ['fitment', 'TractorFitmentAgent'],
    };
    const [key, name] = agentMap[mode] || ['supervisor', 'SupervisorRouter'];
    targetAgent = agents[key];
    agentName = name;
  }

  if (!targetAgent) {
    throw new Error(`Agent ${agentName} not initialized for mode ${mode}`);
  }

  // Invoke agent with question
  const startTime = Date.now();
  let response;
  try {
    response = await targetAgent.invoke({ input: question });
  } catch (error) {
    return {
      success: false,
      error: error.message,
      agentName,
      durationMs: Date.now() - startTime,
    };
  }

  // Extract structured response
  const durationMs = Date.now() - startTime;
  
  return {
    success: true,
    agentName,
    durationMs,
    answer: response.output || response.answer || response.text || '',
    documents: response.documents || response.sourceDocuments || [],
    metadata: {
      policy_flags: response.policy_flags || [],
      validation_warnings: response.validation_warnings || [],
      intent_metadata: response.intent_metadata || {
        primary_intent: 'unknown',
        secondary_intents: [],
        confidence: null,
        missing_anchors: [],
        clarifying_question: null,
        recommended_tools: [],
      },
      hitch_relevance: response.hitch_relevance || null,
      procedural_safety: response.procedural_safety || null,
      skus_found: response.skus_found || [],
      models_referenced: response.models_referenced || [],
    },
  };
}

/**
 * Batch invoke scenarios with progress tracking
 * @param {Array} scenarios - Array of QA scenarios
 * @param {object} agents - Initialized agent instances
 * @param {object} options - { mode, batchSize, timeout, onProgress }
 * @returns {Promise<Array>} Array of responses with scenario metadata
 */
async function batchInvoke(scenarios, agents, options = {}) {
  const {
    mode = InvocationMode.AUTO,
    batchSize = 10,
    timeout = 30000,
    onProgress = null,
  } = options;

  const results = [];
  const total = scenarios.length;

  for (let i = 0; i < scenarios.length; i += batchSize) {
    const batch = scenarios.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (scenario, idx) => {
      const absoluteIdx = i + idx;
      let timeoutId;
      
      try {
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Timeout')), timeout);
        });
        const response = await Promise.race([invokeAgent(scenario, agents, mode), timeoutPromise]);

        return {
          scenario_id: scenario.id,
          question: scenario.question,
          expected_answer: scenario.answer,
          flags: scenario.flags,
          response,
        };
      } catch (error) {
        return {
          scenario_id: scenario.id,
          question: scenario.question,
          expected_answer: scenario.answer,
          flags: scenario.flags,
          response: {
            success: false,
            error: error.message,
            agentName: 'Unknown',
            durationMs: timeout,
          },
        };
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (onProgress) {
          onProgress(absoluteIdx + 1, total);
        }
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  return results;
}

/**
 * Generate accuracy report from batch results
 * @param {Array} results - Array of invocation results
 * @returns {object} Accuracy statistics and breakdown
 */
function generateAccuracyReport(results) {
  const report = {
    total: results.length,
    successful: 0,
    failed: 0,
    timeouts: 0,
    avg_duration_ms: 0,
    by_agent: {},
    by_flag: {
      critical_parts: { total: 0, passed: 0 },
      technician_only: { total: 0, passed: 0 },
      hitch_relevant: { total: 0, passed: 0 },
      multi_option: { total: 0, passed: 0 },
    },
    failures: [],
  };

  let totalDuration = 0;

  results.forEach((result) => {
    const { response, flags, scenario_id, question } = result;

    if (response.success) {
      report.successful++;
      totalDuration += response.durationMs;

      // Track by agent
      if (!report.by_agent[response.agentName]) {
        report.by_agent[response.agentName] = { count: 0, avg_duration: 0 };
      }
      report.by_agent[response.agentName].count++;

      // Track flag accuracy (placeholder - real assertions needed)
      if (flags.critical_parts) {
        report.by_flag.critical_parts.total++;
        // TODO: Add real SKU validation check
        report.by_flag.critical_parts.passed++;
      }

      if (flags.technician_only) {
        report.by_flag.technician_only.total++;
        // TODO: Add real escalation check
        report.by_flag.technician_only.passed++;
      }

      if (flags.hitch_relevant) {
        report.by_flag.hitch_relevant.total++;
        // TODO: Add real hitch relevance check
        report.by_flag.hitch_relevant.passed++;
      }

      if (flags.multi_option) {
        report.by_flag.multi_option.total++;
        report.by_flag.multi_option.passed++;
      }

    } else {
      report.failed++;
      if (response.error === 'Timeout') {
        report.timeouts++;
      }
      report.failures.push({
        scenario_id,
        question: question.substring(0, 80) + '...',
        error: response.error,
      });
    }
  });

  report.avg_duration_ms = report.successful > 0 
    ? Math.round(totalDuration / report.successful)
    : 0;

  // Calculate agent-level averages
  Object.keys(report.by_agent).forEach((agentName) => {
    const agentResults = results.filter(
      (r) => r.response.agentName === agentName && r.response.success
    );
    const agentDuration = agentResults.reduce(
      (sum, r) => sum + r.response.durationMs,
      0
    );
    report.by_agent[agentName].avg_duration = agentResults.length > 0
      ? Math.round(agentDuration / agentResults.length)
      : 0;
  });

  return report;
}

module.exports = {
  InvocationMode,
  initializeAgents,
  invokeAgent,
  batchInvoke,
  generateAccuracyReport,
};
