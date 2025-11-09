#!/usr/bin/env node
/**
 * Woodland Agent Integration Tests
 * 
 * Tests real Woodland agents with knowledge base queries
 * Validates response quality, accuracy, and knowledge retrieval
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const LIBRECHAT_URL = process.env.LIBRECHAT_URL || 'http://localhost:3080';
const AUTH_TOKEN = process.env.WOODLAND_TEST_TOKEN || process.env.LIBRECHAT_TOKEN;
const TEST_USER_ID = process.env.TEST_USER_ID || '68f299dcabf87e83bd2dcbf7';

// Load test fixtures (prefer CSV under data/qa if present)
let testQuestions;
const csvPath = path.resolve(__dirname, '../../../data/qa/testquestions_results.csv');
console.log(`[DEBUG] Checking for CSV at: ${csvPath}`);
console.log(`[DEBUG] CSV exists: ${fs.existsSync(csvPath)}`);
if (fs.existsSync(csvPath)) {
  try {
    const { loadQAFromCSV } = require('../helpers/loadQAFromCSV');
    testQuestions = loadQAFromCSV(csvPath);
    console.log(`Loaded ${testQuestions.length} test cases from CSV: ${csvPath}`);
  } catch (err) {
    console.error(`[ERROR] Failed to load CSV: ${err.message}`);
    testQuestions = [];
  }
} else {
  testQuestions = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../fixtures/test-questions.json'), 'utf8')
  );
  console.log(`Loaded ${testQuestions.length} test cases from JSON: ../fixtures/test-questions.json`);
}

class AgentTester {
  constructor() {
    this.results = [];
    this.startTime = Date.now();
  }

  /**
   * Query Woodland agent via LibreChat API
   */
  async queryAgent(question, conversationId = null, agentId = null) {
    const requestBody = {
      text: question,
      conversationId: conversationId || null,
      parentMessageId: '00000000-0000-0000-0000-000000000000',
      model: 'gpt-4o',
      endpoint: 'azureOpenAI',
    };
    if (agentId) {
      requestBody.agent_id = agentId;
    }
    let token = process.env.WOODLAND_TEST_TOKEN || AUTH_TOKEN;
    let triedRefresh = false;
    while (true) {
      try {
        const response = await axios.post(
          `${LIBRECHAT_URL}/api/ask`,
          requestBody,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            timeout: 60000,
            responseType: 'text',
          }
        );
        // Parse SSE (Server-Sent Events) response
        const responseText = typeof response.data === 'string' ? response.data : '';
        let finalText = '';
        let responseData = {};
        const lines = responseText.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.substring(6);
              if (jsonStr.trim() === '[DONE]') continue;
              const data = JSON.parse(jsonStr);
              if (data.text) finalText = data.text;
              if (data.conversationId) responseData = data;
            } catch (e) {}
          }
        }
        return {
          success: true,
          text: finalText || responseData.text || '',
          conversationId: responseData.conversationId,
          messageId: responseData.messageId,
          citations: responseData.citations || [],
          responseTime: responseData.responseTime || null,
          rawResponse: responseData,
        };
      } catch (error) {
        if (error.response?.status === 401 && !triedRefresh && process.env.WOODLAND_REFRESH_TOKEN) {
          // Try to refresh token and retry once
          const { refreshAuthToken } = require('../helpers/getAuthToken');
          const newToken = await refreshAuthToken(process.env.WOODLAND_REFRESH_TOKEN);
          if (newToken) {
            token = newToken;
            process.env.WOODLAND_TEST_TOKEN = newToken;
            triedRefresh = true;
            continue;
          }
        }
        console.error(`   ❌ Agent query failed: ${error.response?.status} ${error.response?.statusText || error.message}`);
        if (error.response?.data) {
          const preview = typeof error.response.data === 'string' 
            ? error.response.data.substring(0, 200)
            : JSON.stringify(error.response.data).substring(0, 200);
          console.error(`   Error details:`, preview);
        }
        return {
          success: false,
          error: error.message,
          status: error.response?.status,
          text: '',
        };
      }
      break;
    }
  }

  /**
   * Check if response contains expected keywords
   */
  checkKeywords(response, expectedKeywords) {
    if (!response || !expectedKeywords) return { score: 0, found: [], missing: [] };

    const responseText = response.toLowerCase();
    const found = [];
    const missing = [];

    expectedKeywords.forEach(keyword => {
      const keywordLower = keyword.toLowerCase();
      if (responseText.includes(keywordLower)) {
        found.push(keyword);
      } else {
        missing.push(keyword);
      }
    });

    const score = (found.length / expectedKeywords.length) * 100;
    return { score, found, missing };
  }

  /**
   * Analyze response quality
   */
  analyzeQuality(response) {
    if (!response) return { score: 0, metrics: {} };

    const wordCount = response.split(/\s+/).length;
    const sentenceCount = response.split(/[.!?]+/).filter(s => s.trim()).length;
    const avgSentenceLength = wordCount / (sentenceCount || 1);
    const hasGreeting = /\b(hi|hello|thanks|thank you)\b/i.test(response);
    const hasClosing = /\b(help|assist|let me know|reach out|contact)\b/i.test(response);

    // Quality scoring
    let score = 0;
    if (wordCount > 50) score += 25;        // Sufficient length
    if (wordCount > 100) score += 15;       // Detailed response
    if (sentenceCount >= 3) score += 20;    // Multiple sentences
    if (avgSentenceLength > 10 && avgSentenceLength < 30) score += 20;  // Good readability
    if (hasGreeting) score += 10;           // Professional greeting
    if (hasClosing) score += 10;            // Helpful closing

    return {
      score: Math.min(100, score),
      metrics: {
        wordCount,
        sentenceCount,
        avgSentenceLength,
        hasGreeting,
        hasClosing,
      }
    };
  }

  /**
   * Run single test
   */
  async runTest(testCase) {
    console.log(`\n🔍 Testing: ${testCase.id}`);
    console.log(`   Question: "${testCase.question}"`);

    const startTime = Date.now();
    const response = await this.queryAgent(testCase.question);
    const responseTime = Date.now() - startTime;

    if (!response.success) {
      console.log(`   ❌ FAILED: ${response.error}`);
      return {
        testId: testCase.id,
        question: testCase.question,
        category: testCase.category,
        success: false,
        error: response.error,
        responseTime,
      };
    }

    // Debug: Show raw response structure on first test
    if (testCase.id === 'test_qa_001' && response.rawResponse) {
      console.log(`\n   🔍 Debug - Response keys:`, Object.keys(response.rawResponse));
      if (response.rawResponse.text) {
        console.log(`   📝 Response.text:`, response.rawResponse.text.substring(0, 150));
      }
      if (response.rawResponse.message) {
        console.log(`   💬 Response.message:`, JSON.stringify(response.rawResponse.message).substring(0, 150));
      }
      console.log('');
    }

    const keywordAnalysis = this.checkKeywords(response.text, testCase.expected_keywords);
    const qualityAnalysis = this.analyzeQuality(response.text);

    const passed = keywordAnalysis.score >= 50 && qualityAnalysis.score >= 60;

    console.log(`   ${passed ? '✅ PASSED' : '⚠️  WARNING'}`);
    console.log(`   Keyword match: ${keywordAnalysis.score.toFixed(1)}%`);
    console.log(`   Quality score: ${qualityAnalysis.score.toFixed(1)}%`);
    console.log(`   Response time: ${responseTime}ms`);
    console.log(`   Response preview: ${response.text.substring(0, 100)}...`);

    return {
      testId: testCase.id,
      question: testCase.question,
      category: testCase.category,
      success: true,
      passed,
      response: response.text,
      responseTime,
      keywordAnalysis,
      qualityAnalysis,
      citations: response.citations,
    };
  }

  /**
   * Get available agents from LibreChat
   */
  async getAvailableAgents() {
    let token = process.env.WOODLAND_TEST_TOKEN || AUTH_TOKEN;
    let triedRefresh = false;
    while (true) {
      try {
        // Some backends may require a POST with requiredPermission in the payload
        const payload = { requiredPermission: 'agent:read' };
        let response;
        try {
          response = await axios.post(
            `${LIBRECHAT_URL}/api/agents`,
            payload,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
              },
              timeout: 10000,
            }
          );
        } catch (postError) {
          // Fallback to GET if POST fails
          response = await axios.get(
            `${LIBRECHAT_URL}/api/agents`,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
              },
              timeout: 10000,
            }
          );
        }
        // Debug: Show raw agent response
        if (typeof response.data === 'string' && response.data.includes('event: error')) {
          console.error('🔍 Debug - /api/agents SSE error response:', response.data);
          return [];
        }
        console.log('🔍 Debug - /api/agents response:', JSON.stringify(response.data, null, 2));
        const agents = Array.isArray(response.data)
          ? response.data
          : (response.data?.data || response.data?.agents || []);
        return agents;
      } catch (error) {
        if (error.response?.status === 401 && !triedRefresh && process.env.WOODLAND_REFRESH_TOKEN) {
          const { refreshAuthToken } = require('../helpers/getAuthToken');
          const newToken = await refreshAuthToken(process.env.WOODLAND_REFRESH_TOKEN);
          if (newToken) {
            token = newToken;
            process.env.WOODLAND_TEST_TOKEN = newToken;
            triedRefresh = true;
            continue;
          }
        }
        if (error.response?.data && typeof error.response.data === 'string' && error.response.data.includes('event: error')) {
          console.error('🔍 Debug - /api/agents SSE error response:', error.response.data);
        }
        console.warn('⚠️  Could not fetch agents:', error.message);
        return [];
      }
      break;
    }
  }

  /**
   * Run all tests
   */
  async runAllTests(agentIdsToTest = []) {
    console.log('🚀 Starting Woodland Agent Integration Tests\n');
    console.log(`Target: ${LIBRECHAT_URL}`);
    console.log(`Test Cases: ${testQuestions.length}\n`);

    let allResults = [];
    if (agentIdsToTest.length > 0) {
      for (const agentId of agentIdsToTest) {
        console.log(`\n--- Testing agent: ${agentId} ---`);
        this.agentId = agentId;
        for (const testCase of testQuestions) {
          const result = await this.runTest({ ...testCase, agentId });
          allResults.push({ ...result, agentId });
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      this.generateReport(allResults, agentIdsToTest);
    } else {
      // Get available agents
      const agents = await this.getAvailableAgents();
      console.log(`Found ${agents.length} agent(s)`);
      // Use the first Woodland agent if available
      const woodlandAgent = agents.find(a => 
        a.name?.toLowerCase().includes('woodland') || 
        a.description?.toLowerCase().includes('woodland')
      );
      if (woodlandAgent) {
        console.log(`Using agent: ${woodlandAgent.name} (${woodlandAgent.id})`);
        this.agentId = woodlandAgent.id;
      } else if (agents.length > 0) {
        console.log(`Using default agent: ${agents[0].name} (${agents[0].id})`);
        this.agentId = agents[0].id;
      } else {
        console.log('⚠️  No agents found, testing without specific agent');
      }
      console.log('');
      for (const testCase of testQuestions) {
        const result = await this.runTest(testCase);
        this.results.push(result);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      this.generateReport();
    }
  }

  /**
   * Generate test report
   */
  generateReport(allResults = this.results, agentIdsToTest = []) {
    const totalTime = Date.now() - this.startTime;
    const successful = allResults.filter(r => r.success);
    const passed = allResults.filter(r => r.passed);
    const failed = allResults.filter(r => !r.success || !r.passed);

    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST REPORT SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${allResults.length}`);
    console.log(`Successful: ${successful.length} (${((successful.length / allResults.length) * 100).toFixed(1)}%)`);
    console.log(`Passed: ${passed.length} (${((passed.length / allResults.length) * 100).toFixed(1)}%)`);
    console.log(`Failed/Warning: ${failed.length} (${((failed.length / allResults.length) * 100).toFixed(1)}%)`);
    console.log(`Total Time: ${(totalTime / 1000).toFixed(2)}s`);

    // Average scores
    const avgKeywordScore = successful.reduce((sum, r) => sum + (r.keywordAnalysis?.score || 0), 0) / (successful.length || 1);
    const avgQualityScore = successful.reduce((sum, r) => sum + (r.qualityAnalysis?.score || 0), 0) / (successful.length || 1);
    const avgResponseTime = successful.reduce((sum, r) => sum + r.responseTime, 0) / (successful.length || 1);

    console.log(`\nAverage Keyword Match: ${avgKeywordScore.toFixed(1)}%`);
    console.log(`Average Quality Score: ${avgQualityScore.toFixed(1)}%`);
    console.log(`Average Response Time: ${avgResponseTime.toFixed(0)}ms`);

    // Per-agent summary
    if (agentIdsToTest.length > 1) {
      console.log('\n📋 Per-Agent Summary:');
      agentIdsToTest.forEach(agentId => {
        const agentResults = allResults.filter(r => r.agentId === agentId);
        const agentPassed = agentResults.filter(r => r.passed);
        const agentSuccess = agentResults.filter(r => r.success);
        const passRate = (agentPassed.length / (agentResults.length || 1)) * 100;
        console.log(`   Agent ${agentId}: ${agentPassed.length}/${agentResults.length} (${passRate.toFixed(1)}%)`);

        // Write per-agent summary JSON
        const agentSummaryPath = path.join(__dirname, `../reports/integration-summary-${agentId}.json`);
        fs.mkdirSync(path.dirname(agentSummaryPath), { recursive: true });
        fs.writeFileSync(
          agentSummaryPath,
          JSON.stringify({
            timestamp: new Date().toISOString(),
            agentId,
            total: agentResults.length,
            passed: agentPassed.length,
            failed: agentResults.length - agentPassed.length,
            passRate,
            avgKeywordScore: agentSuccess.reduce((sum, r) => sum + (r.keywordAnalysis?.score || 0), 0) / (agentSuccess.length || 1),
            avgQualityScore: agentSuccess.reduce((sum, r) => sum + (r.qualityAnalysis?.score || 0), 0) / (agentSuccess.length || 1),
            avgResponseTime: agentSuccess.reduce((sum, r) => sum + r.responseTime, 0) / (agentSuccess.length || 1),
            results: agentResults,
          }, null, 2)
        );
        console.log(`   📄 Agent summary saved to: ${agentSummaryPath}`);
      });
      // Write multi-agent summary JSON
      const multiSummaryPath = path.join(__dirname, '../reports/integration-multi-agent-summary.json');
      fs.mkdirSync(path.dirname(multiSummaryPath), { recursive: true });
      fs.writeFileSync(
        multiSummaryPath,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          agentIds: agentIdsToTest,
          total: allResults.length,
          passed: passed.length,
          failed: failed.length,
          avgKeywordScore,
          avgQualityScore,
          avgResponseTime,
          results: allResults,
        }, null, 2)
      );
      console.log(`   📄 Multi-agent summary saved to: ${multiSummaryPath}`);
    }

    // Category breakdown
    const byCategory = {};
    successful.forEach(r => {
      if (!byCategory[r.category]) {
        byCategory[r.category] = { total: 0, passed: 0 };
      }
      byCategory[r.category].total++;
      if (r.passed) byCategory[r.category].passed++;
    });

    console.log('\n📈 Results by Category:');
    Object.entries(byCategory).forEach(([category, stats]) => {
      const passRate = (stats.passed / stats.total) * 100;
      console.log(`   ${category}: ${stats.passed}/${stats.total} (${passRate.toFixed(1)}%)`);
    });

    // Failed tests
    if (failed.length > 0) {
      console.log('\n⚠️  Failed/Warning Tests:');
      failed.forEach(r => {
        console.log(`   - ${r.testId}: ${r.question}`);
        if (r.error) {
          console.log(`     Error: ${r.error}`);
        } else if (r.keywordAnalysis) {
          console.log(`     Missing keywords: ${r.keywordAnalysis.missing.join(', ')}`);
        }
        if (r.agentId) {
          console.log(`     Agent: ${r.agentId}`);
        }
      });
    }

    console.log('\n' + '='.repeat(60));

    // Save JSON report
    const reportPath = path.join(__dirname, '../reports/integration-test-report.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(
      reportPath,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        summary: {
          total: allResults.length,
          successful: successful.length,
          passed: passed.length,
          failed: failed.length,
          avgKeywordScore,
          avgQualityScore,
          avgResponseTime,
          totalTime,
        },
        byCategory,
        agentIds: agentIdsToTest,
        results: allResults,
      }, null, 2)
    );

    console.log(`\n📄 Full report saved to: ${reportPath}`);

    // Exit code based on pass rate
    const passRate = (passed.length / (allResults.length || 1)) * 100;
    process.exit(passRate >= 80 ? 0 : 1);
  }
}

// Run tests
async function main() {
  let token = AUTH_TOKEN;
  // Auto-acquire token if missing
  if (!token) {
    console.warn('WOODLAND_TEST_TOKEN not set. Attempting to acquire token...');
    const { getAuthToken, refreshAuthToken } = require('../helpers/getAuthToken');
    const email = process.env.TEST_EMAIL || process.env.LIBRECHAT_EMAIL;
    const password = process.env.TEST_PASSWORD || process.env.LIBRECHAT_PASSWORD;
    if (email && password) {
      const result = await getAuthToken(email, password);
      if (result && result.token) {
        token = result.token;
        process.env.WOODLAND_TEST_TOKEN = token;
        if (result.refreshToken) {
          process.env.WOODLAND_REFRESH_TOKEN = result.refreshToken;
        }
      } else {
        console.error('❌ Could not acquire token.');
        process.exit(1);
      }
    } else {
      // Interactive prompt fallback
      console.warn('TEST_EMAIL and TEST_PASSWORD not set. Prompting for credentials...');
      const { promptForCredentials, getAuthToken } = require('../helpers/getAuthToken');
      const creds = await promptForCredentials();
      const result = await getAuthToken(creds.email, creds.password);
      if (result && result.token) {
        token = result.token;
        process.env.WOODLAND_TEST_TOKEN = token;
        if (result.refreshToken) {
          process.env.WOODLAND_REFRESH_TOKEN = result.refreshToken;
        }
      } else {
        console.error('❌ Could not acquire token interactively.');
        process.exit(1);
      }
    }
  }

  // Optionally refresh token if expired (simple retry logic)
  async function ensureValidToken() {
    // This is a placeholder for actual expiry detection
    // If API returns 401, refresh and retry
    if (process.env.WOODLAND_REFRESH_TOKEN) {
      const { refreshAuthToken } = require('../helpers/getAuthToken');
      const newToken = await refreshAuthToken(process.env.WOODLAND_REFRESH_TOKEN);
      if (newToken) {
        process.env.WOODLAND_TEST_TOKEN = newToken;
        return newToken;
      }
    }
    return process.env.WOODLAND_TEST_TOKEN;
  }

  // Accept agent IDs from config/env
  let agentIdsToTest = [];
  if (process.env.WOODLAND_AGENT_IDS) {
    agentIdsToTest = process.env.WOODLAND_AGENT_IDS.split(',').map(id => id.trim()).filter(Boolean);
  }
  // Optionally load from config file
  const configPath = path.join(__dirname, '../fixtures/agent-ids.json');
  if (fs.existsSync(configPath)) {
    try {
      const idsFromFile = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (Array.isArray(idsFromFile)) {
        agentIdsToTest = agentIdsToTest.concat(idsFromFile.map(id => id.trim()).filter(Boolean));
      }
    } catch {}
  }
  // Remove duplicates
  agentIdsToTest = [...new Set(agentIdsToTest)];

  const tester = new AgentTester();
  tester.token = process.env.WOODLAND_TEST_TOKEN;

  let allResults = [];
  if (agentIdsToTest.length > 0) {
    console.log(`Testing with agent IDs: ${agentIdsToTest.join(', ')}`);
    for (const agentId of agentIdsToTest) {
      tester.agentId = agentId;
      for (const testCase of testQuestions) {
        // Attach agentId to result for summary
        const result = await tester.runTest({ ...testCase, agentId });
        allResults.push({ ...result, agentId });
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    tester.generateReport(allResults, agentIdsToTest);
  } else {
    await tester.runAllTests();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = { AgentTester };
