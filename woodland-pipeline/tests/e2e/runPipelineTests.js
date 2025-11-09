#!/usr/bin/env node
/**
 * End-to-End Pipeline Tests
 * 
 * Tests complete pipeline workflow:
 * 1. Build datasets from sources
 * 2. Validate dataset quality
 * 3. Index to RAG/Azure
 * 4. Query agents to verify knowledge retrieval
 * 5. Generate comprehensive HTML report
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { AgentTester } = require('../integration/testAgentIntegration');

class PipelineE2ETester {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      stages: {},
      overallSuccess: true,
    };
    this.startTime = Date.now();
  }

  /**
   * Execute command and capture output
   */
  executeCommand(command, description) {
    console.log(`\n📦 ${description}...`);
    try {
      const output = execSync(command, {
        cwd: path.join(__dirname, '../..'),
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      console.log(`✅ ${description} completed`);
      return { success: true, output };
    } catch (error) {
      console.log(`❌ ${description} failed`);
      return { success: false, error: error.message, output: error.stdout };
    }
  }

  /**
   * Test Stage 1: Build Datasets
   */
  async testBuild() {
    console.log('\n' + '='.repeat(60));
    console.log('STAGE 1: BUILD DATASETS');
    console.log('='.repeat(60));

    const result = this.executeCommand(
      'npm run build',
      'Building datasets from all sources'
    );

    // Parse build output for item counts
    const itemMatch = result.output?.match(/Total items: (\d+)/);
    const qaMatch = result.output?.match(/QA: (\d+)/);
    const trainingMatch = result.output?.match(/Training: (\d+)/);
    const salesMatch = result.output?.match(/Sales: (\d+)/);
    const documentsMatch = result.output?.match(/Documents: (\d+)/);

    this.results.stages.build = {
      success: result.success,
      totalItems: itemMatch ? parseInt(itemMatch[1]) : 0,
      itemsBySource: {
        qa: qaMatch ? parseInt(qaMatch[1]) : 0,
        training: trainingMatch ? parseInt(trainingMatch[1]) : 0,
        sales: salesMatch ? parseInt(salesMatch[1]) : 0,
        documents: documentsMatch ? parseInt(documentsMatch[1]) : 0,
      },
      outputFiles: this.checkBuildOutputs(),
    };

    if (!result.success) {
      this.results.overallSuccess = false;
    }

    return result.success;
  }

  /**
   * Check build output files
   */
  checkBuildOutputs() {
    const expectedFiles = [
      'build/datasets/qa/langfuse_dataset_variables.csv',
      'build/datasets/training/langfuse_dataset_variables.csv',
      'build/datasets/sales/langfuse_dataset_variables.csv',
      'build/datasets/unified/all_knowledge.csv',
      'build/markdown/QA_Knowledge_Base.md',
    ];

    const basePath = path.join(__dirname, '../..');
    return expectedFiles.map(file => ({
      file,
      exists: fs.existsSync(path.join(basePath, file)),
      size: fs.existsSync(path.join(basePath, file))
        ? fs.statSync(path.join(basePath, file)).size
        : 0,
    }));
  }

  /**
   * Test Stage 2: Validate Datasets
   */
  async testValidate() {
    console.log('\n' + '='.repeat(60));
    console.log('STAGE 2: VALIDATE DATASETS');
    console.log('='.repeat(60));

    const result = this.executeCommand(
      'npm run validate',
      'Validating dataset quality'
    );

    // Load validation report
    const reportPath = path.join(__dirname, '../../build/validation_report.json');
    let validationReport = null;

    if (fs.existsSync(reportPath)) {
      validationReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    }

    this.results.stages.validation = {
      success: result.success,
      report: validationReport,
      errors: validationReport?.issues?.filter(i => i.level === 'error').length || 0,
      warnings: validationReport?.issues?.filter(i => i.level === 'warning').length || 0,
    };

    if (!result.success || (validationReport && validationReport.issues?.some(i => i.level === 'error'))) {
      this.results.overallSuccess = false;
    }

    return result.success;
  }

  /**
   * Test Stage 3: Index to RAG (optional - requires RAG API)
   */
  async testIndexRAG() {
    console.log('\n' + '='.repeat(60));
    console.log('STAGE 3: INDEX TO RAG (Optional)');
    console.log('='.repeat(60));

    if (!process.env.RAG_API_URL) {
      console.log('⏭️  Skipping RAG indexing (RAG_API_URL not set)');
      this.results.stages.indexRAG = { skipped: true };
      return true;
    }

    const result = this.executeCommand(
      'npm run index:rag',
      'Indexing to LibreChat RAG'
    );

    this.results.stages.indexRAG = {
      success: result.success,
      output: result.output,
    };

    // Don't fail overall if indexing fails (optional stage)
    return true;
  }

  /**
   * Test Stage 4: Index to Azure (optional - requires Azure credentials)
   */
  async testIndexAzure() {
    console.log('\n' + '='.repeat(60));
    console.log('STAGE 4: INDEX TO AZURE AI SEARCH (Optional)');
    console.log('='.repeat(60));

    if (!process.env.AZURE_AI_SEARCH_ENDPOINT) {
      console.log('⏭️  Skipping Azure indexing (AZURE_AI_SEARCH_ENDPOINT not set)');
      this.results.stages.indexAzure = { skipped: true };
      return true;
    }

    const result = this.executeCommand(
      'npm run index:azure',
      'Indexing to Azure AI Search'
    );

    this.results.stages.indexAzure = {
      success: result.success,
      output: result.output,
    };

    // Don't fail overall if indexing fails (optional stage)
    return true;
  }

  /**
   * Test Stage 5: Agent Integration Tests
   */
  async testAgentQueries() {
    console.log('\n' + '='.repeat(60));
    console.log('STAGE 5: AGENT INTEGRATION TESTS');
    console.log('='.repeat(60));

    const librechatUrl = process.env.LIBRECHAT_URL || 'http://localhost:3080';
    const authToken = process.env.WOODLAND_TEST_TOKEN || process.env.LIBRECHAT_TOKEN;

    if (!authToken) {
      console.log('⏭️  Skipping agent tests (WOODLAND_TEST_TOKEN not set)');
      this.results.stages.agentTests = { skipped: true, reason: 'No auth token' };
      return true;
    }

    try {
      // Set env vars for the agent tester
      process.env.LIBRECHAT_URL = librechatUrl;
      
      const tester = new AgentTester();
      await tester.runAllTests();

      // Load agent test results
      const agentReportPath = path.join(__dirname, '../reports/integration-test-report.json');
      if (fs.existsSync(agentReportPath)) {
        const agentReport = JSON.parse(fs.readFileSync(agentReportPath, 'utf8'));
        this.results.stages.agentTests = agentReport.summary;
      }

      return true;
    } catch (error) {
      console.error('⚠️  Agent tests failed:', error.message);
      this.results.stages.agentTests = {
        success: false,
        error: error.message,
      };
      // Don't fail overall if agent tests fail (optional stage)
      return true;
    }
  }

  /**
   * Generate HTML Report
   */
  generateHTMLReport() {
    const totalTime = Date.now() - this.startTime;
    this.results.totalTime = totalTime;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Woodland Pipeline E2E Test Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f7fa;
            padding: 20px;
            line-height: 1.6;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
            border-radius: 10px;
            margin-bottom: 30px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        h1 { font-size: 32px; margin-bottom: 10px; }
        .subtitle { opacity: 0.9; font-size: 16px; }
        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .card {
            background: white;
            padding: 25px;
            border-radius: 10px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .card h3 {
            font-size: 14px;
            text-transform: uppercase;
            color: #666;
            margin-bottom: 10px;
        }
        .card .value {
            font-size: 36px;
            font-weight: bold;
            color: #333;
        }
        .success { color: #10b981; }
        .warning { color: #f59e0b; }
        .error { color: #ef4444; }
        .stage {
            background: white;
            padding: 25px;
            border-radius: 10px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .stage-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid #e5e7eb;
        }
        .stage-header h2 { font-size: 20px; color: #333; }
        .badge {
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
        }
        .badge-success { background: #d1fae5; color: #065f46; }
        .badge-error { background: #fee2e2; color: #991b1b; }
        .badge-skipped { background: #e5e7eb; color: #6b7280; }
        .metric-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        .metric {
            padding: 15px;
            background: #f9fafb;
            border-radius: 8px;
            border-left: 4px solid #667eea;
        }
        .metric-label {
            font-size: 12px;
            color: #666;
            margin-bottom: 5px;
        }
        .metric-value {
            font-size: 24px;
            font-weight: bold;
            color: #333;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
        }
        th, td {
            text-align: left;
            padding: 12px;
            border-bottom: 1px solid #e5e7eb;
        }
        th {
            background: #f9fafb;
            font-weight: 600;
            color: #666;
            font-size: 14px;
        }
        .file-check { color: #10b981; }
        .file-missing { color: #ef4444; }
        footer {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 14px;
        }
        .progress-bar {
            background: #e5e7eb;
            height: 8px;
            border-radius: 4px;
            overflow: hidden;
            margin-top: 10px;
        }
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #10b981, #059669);
            transition: width 0.3s ease;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>🌲 Woodland Knowledge Pipeline</h1>
            <div class="subtitle">End-to-End Test Report - ${new Date(this.results.timestamp).toLocaleString()}</div>
        </header>

        <div class="summary">
            <div class="card">
                <h3>Overall Status</h3>
                <div class="value ${this.results.overallSuccess ? 'success' : 'error'}">
                    ${this.results.overallSuccess ? '✓ PASS' : '✗ FAIL'}
                </div>
            </div>
            <div class="card">
                <h3>Total Time</h3>
                <div class="value">${(totalTime / 1000).toFixed(2)}s</div>
            </div>
            <div class="card">
                <h3>Items Processed</h3>
                <div class="value">${this.results.stages.build?.totalItems || 0}</div>
            </div>
            <div class="card">
                <h3>Validation Errors</h3>
                <div class="value ${this.results.stages.validation?.errors > 0 ? 'error' : 'success'}">
                    ${this.results.stages.validation?.errors || 0}
                </div>
            </div>
        </div>

        ${this.generateStageHTML('build', 'Stage 1: Build Datasets')}
        ${this.generateStageHTML('validation', 'Stage 2: Dataset Validation')}
        ${this.generateStageHTML('indexRAG', 'Stage 3: RAG Indexing')}
        ${this.generateStageHTML('indexAzure', 'Stage 4: Azure Indexing')}
        ${this.generateStageHTML('agentTests', 'Stage 5: Agent Tests')}

        <footer>
            Generated by Woodland Knowledge Pipeline Test Suite
        </footer>
    </div>
</body>
</html>
    `;

    const reportPath = path.join(__dirname, '../reports/pipeline-e2e-report.html');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, html.trim());

    // Also save JSON
    const jsonPath = path.join(__dirname, '../reports/pipeline-e2e-report.json');
    fs.writeFileSync(jsonPath, JSON.stringify(this.results, null, 2));

    return reportPath;
  }

  /**
   * Generate HTML for a stage
   */
  generateStageHTML(stageKey, stageTitle) {
    const stage = this.results.stages[stageKey];
    if (!stage) return '';

    let statusBadge = '';
    if (stage.skipped) {
      statusBadge = '<span class="badge badge-skipped">Skipped</span>';
    } else if (stage.success) {
      statusBadge = '<span class="badge badge-success">✓ Success</span>';
    } else {
      statusBadge = '<span class="badge badge-error">✗ Failed</span>';
    }

    let content = '';

    // Build stage
    if (stageKey === 'build' && !stage.skipped) {
      content = `
        <div class="metric-grid">
          <div class="metric">
            <div class="metric-label">QA Items</div>
            <div class="metric-value">${stage.itemsBySource?.qa || 0}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Training Items</div>
            <div class="metric-value">${stage.itemsBySource?.training || 0}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Sales Items</div>
            <div class="metric-value">${stage.itemsBySource?.sales || 0}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Document Items</div>
            <div class="metric-value">${stage.itemsBySource?.documents || 0}</div>
          </div>
        </div>
        <table>
          <thead>
            <tr><th>Output File</th><th>Status</th><th>Size</th></tr>
          </thead>
          <tbody>
            ${stage.outputFiles?.map(f => `
              <tr>
                <td>${f.file}</td>
                <td class="${f.exists ? 'file-check' : 'file-missing'}">${f.exists ? '✓' : '✗'}</td>
                <td>${(f.size / 1024).toFixed(2)} KB</td>
              </tr>
            `).join('') || ''}
          </tbody>
        </table>
      `;
    }

    // Validation stage
    if (stageKey === 'validation' && !stage.skipped) {
      content = `
        <div class="metric-grid">
          <div class="metric">
            <div class="metric-label">Errors</div>
            <div class="metric-value ${stage.errors > 0 ? 'error' : 'success'}">${stage.errors}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Warnings</div>
            <div class="metric-value ${stage.warnings > 0 ? 'warning' : 'success'}">${stage.warnings}</div>
          </div>
        </div>
      `;
    }

    // Agent tests stage
    if (stageKey === 'agentTests' && !stage.skipped && stage.total) {
      const passRate = (stage.passed / stage.total) * 100;
      content = `
        <div class="metric-grid">
          <div class="metric">
            <div class="metric-label">Total Tests</div>
            <div class="metric-value">${stage.total}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Passed</div>
            <div class="metric-value success">${stage.passed}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Failed</div>
            <div class="metric-value ${stage.failed > 0 ? 'error' : 'success'}">${stage.failed}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Pass Rate</div>
            <div class="metric-value">${passRate.toFixed(1)}%</div>
          </div>
        </div>
        <div class="metric-grid">
          <div class="metric">
            <div class="metric-label">Avg Keyword Match</div>
            <div class="metric-value">${stage.avgKeywordScore?.toFixed(1)}%</div>
          </div>
          <div class="metric">
            <div class="metric-label">Avg Quality Score</div>
            <div class="metric-value">${stage.avgQualityScore?.toFixed(1)}%</div>
          </div>
          <div class="metric">
            <div class="metric-label">Avg Response Time</div>
            <div class="metric-value">${stage.avgResponseTime?.toFixed(0)}ms</div>
          </div>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${passRate}%"></div>
        </div>
      `;
    }

    return `
      <div class="stage">
        <div class="stage-header">
          <h2>${stageTitle}</h2>
          ${statusBadge}
        </div>
        ${content || (stage.skipped ? '<p>Stage skipped - required configuration not provided</p>' : '')}
      </div>
    `;
  }

  /**
   * Run all pipeline tests
   */
  async runAll() {
    console.log('🚀 Starting Woodland Pipeline End-to-End Tests\n');

    await this.testBuild();
    await this.testValidate();
    await this.testIndexRAG();
    await this.testIndexAzure();
    await this.testAgentQueries();

    const reportPath = this.generateHTMLReport();

    console.log('\n' + '='.repeat(60));
    console.log('📊 E2E TEST COMPLETE');
    console.log('='.repeat(60));
    console.log(`Overall Status: ${this.results.overallSuccess ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Total Time: ${(this.results.totalTime / 1000).toFixed(2)}s`);
    console.log(`\n📄 HTML Report: ${reportPath}`);
    console.log(`📄 JSON Report: ${reportPath.replace('.html', '.json')}`);
    console.log('='.repeat(60));

    return this.results.overallSuccess;
  }
}

// Main execution
async function main() {
  const tester = new PipelineE2ETester();
  const success = await tester.runAll();
  process.exit(success ? 0 : 1);
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ E2E test execution failed:', error);
    process.exit(1);
  });
}

module.exports = { PipelineE2ETester };
