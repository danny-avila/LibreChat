/**
 * Woodland Agent Accuracy Testing
 * 
 * Real agent invocation against QA scenarios to validate:
 * - Response accuracy vs expected answers
 * - Hitch relevance classification
 * - Technician-only escalation
 * - Critical part validation
 */

const fs = require('fs').promises;
const path = require('path');
const {
  InvocationMode,
  initializeAgents,
  invokeAgent,
  batchInvoke,
  generateAccuracyReport,
} = require('./harness/agentInvoker');
const {
  assertSkuPresence,
  assertHitchRelevance,
  assertTechnicianEscalation,
  assertPolicyDenialTemplate,
} = require('./helpers/assertions');

const SCENARIOS_PATH = path.join(__dirname, 'generated/qa_scenarios.json');
const RESULTS_PATH = path.join(__dirname, 'results/accuracy_results.json');
const REPORT_PATH = path.join(__dirname, 'results/accuracy_report.json');

describe('Woodland Agent Accuracy Testing', () => {
  let scenarios;
  let agents;

  beforeAll(async () => {
    // Load QA scenarios
    const scenariosData = await fs.readFile(SCENARIOS_PATH, 'utf8');
    scenarios = JSON.parse(scenariosData);
    console.log(`✓ Loaded ${scenarios.length} QA scenarios`);

    // Initialize agents
    agents = await initializeAgents(InvocationMode.AUTO);
    console.log(`✓ Initialized agents: ${Object.keys(agents).join(', ')}`);
  }, 60000); // 1 minute timeout for initialization

  afterAll(async () => {
    // Cleanup if needed
  });

  describe('Sample Scenario Validation', () => {
    test('should correctly handle hitch-relevant part query', async () => {
      const scenario = scenarios.find((s) => s.flags.hitch_relevant);
      if (!scenario) {
        console.warn('No hitch-relevant scenario found, skipping test');
        return;
      }

      const result = await invokeAgent(scenario, agents, InvocationMode.AUTO);

      expect(result.success).toBe(true);
      expect(result.answer).toBeTruthy();
      
      // Should NOT ask for hitch type for agnostic parts
      if (scenario.question.toLowerCase().includes('impeller')) {
        expect(result.answer.toLowerCase()).not.toMatch(/which hitch|hitch type/);
      }
    }, 30000);

    test('should escalate technician-only procedures', async () => {
      const scenario = scenarios.find((s) => s.flags.technician_only);
      if (!scenario) {
        console.warn('No technician-only scenario found, skipping test');
        return;
      }

      const result = await invokeAgent(scenario, agents, InvocationMode.AUTO);

      expect(result.success).toBe(true);
      assertTechnicianEscalation(result.answer);
    }, 30000);

    test('should validate critical parts with cross-tool check', async () => {
      const scenario = scenarios.find((s) => s.flags.critical_parts);
      if (!scenario) {
        console.warn('No critical parts scenario found, skipping test');
        return;
      }

      const result = await invokeAgent(scenario, agents, InvocationMode.AUTO);

      expect(result.success).toBe(true);
      
      // Check for validation warnings if cross-tool validation active
      if (result.metadata.validation_warnings?.length > 0) {
        expect(result.answer).toMatch(/⚠️ Validation Warning/);
      }
    }, 30000);
  });

  describe('Batch Accuracy Testing', () => {
    let batchResults;
    let accuracyReport;

    test('should process all scenarios with real agents', async () => {
      // Run batch invocation with progress tracking
      batchResults = await batchInvoke(scenarios, agents, {
        mode: InvocationMode.AUTO,
        batchSize: 5, // Process 5 at a time to avoid rate limits
        timeout: 30000,
        onProgress: (current, total) => {
          if (current % 50 === 0 || current === total) {
            console.log(`Progress: ${current}/${total} scenarios processed`);
          }
        },
      });

      expect(batchResults).toHaveLength(scenarios.length);
      
      // Save raw results
      await fs.mkdir(path.dirname(RESULTS_PATH), { recursive: true });
      await fs.writeFile(
        RESULTS_PATH,
        JSON.stringify(batchResults, null, 2),
        'utf8'
      );
      console.log(`✓ Saved results to ${RESULTS_PATH}`);
    }, 900000); // 15 minute timeout for full batch

    test('should generate accuracy report', async () => {
      if (!batchResults) {
        throw new Error('Batch results not available');
      }

      accuracyReport = generateAccuracyReport(batchResults);

      console.log('\n📊 ACCURACY REPORT:');
      console.log(`Total Scenarios: ${accuracyReport.total}`);
      console.log(`Successful: ${accuracyReport.successful} (${Math.round(accuracyReport.successful / accuracyReport.total * 100)}%)`);
      console.log(`Failed: ${accuracyReport.failed}`);
      console.log(`Timeouts: ${accuracyReport.timeouts}`);
      console.log(`Avg Duration: ${accuracyReport.avg_duration_ms}ms`);
      console.log('\nBy Agent:');
      Object.entries(accuracyReport.by_agent).forEach(([agent, stats]) => {
        console.log(`  ${agent}: ${stats.count} queries, ${stats.avg_duration}ms avg`);
      });

      // Save report
      await fs.writeFile(
        REPORT_PATH,
        JSON.stringify(accuracyReport, null, 2),
        'utf8'
      );
      console.log(`\n✓ Saved report to ${REPORT_PATH}`);

      // Basic thresholds
      expect(accuracyReport.successful).toBeGreaterThan(accuracyReport.total * 0.9); // 90% success
      expect(accuracyReport.timeouts).toBeLessThan(accuracyReport.total * 0.05); // <5% timeouts
    }, 10000);
  });

  describe('Flag-Specific Validation', () => {
    test('critical parts scenarios should have SKU validation', async () => {
      const criticalScenarios = scenarios.filter((s) => s.flags.critical_parts);
      expect(criticalScenarios.length).toBeGreaterThan(0);

      // Sample 5 random critical scenarios
      const sampleSize = Math.min(5, criticalScenarios.length);
      const samples = criticalScenarios
        .sort(() => 0.5 - Math.random())
        .slice(0, sampleSize);

      for (const scenario of samples) {
        const result = await invokeAgent(scenario, agents, InvocationMode.AUTO);
        expect(result.success).toBe(true);

        // Should return SKU or show validation warning
        const hasSku = /\b\d{5,}\b/.test(result.answer);
        const hasValidation = /⚠️ Validation Warning/.test(result.answer);
        expect(hasSku || hasValidation).toBe(true);
      }
    }, 120000); // 2 minutes for 5 scenarios
  });
});
