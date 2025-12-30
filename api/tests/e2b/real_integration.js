const path = require('path');
// 1. 初始化模块别名 (必须在最前面)
require('module-alias')({ base: path.resolve(__dirname, '../..') });

// 2. 加载环境变量
const envPath = path.join(__dirname, '../../../.env');
require('dotenv').config({ path: envPath });

const mongoose = require('mongoose');
const { connectDb } = require('~/db');
const controller = require('../../server/routes/e2bAssistants/controller');
const { logger } = require('@librechat/data-schemas');

// 简单的 Mock Response 对象，用于捕获 Controller 的输出
const mockRes = () => {
  const res = {};
  res.body = null;
  res.statusCode = 200;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.body = data;
    return res;
  };
  return res;
};

// 检查必要的环境变量
function checkEnv() {
  const openaiKey = process.env.OPENAI_API_KEY;
  const e2bKey = process.env.E2B_API_KEY;

  if (!openaiKey || openaiKey.includes('user_provided')) {
    console.error('❌ Error: Invalid OPENAI_API_KEY in .env. Please provide a real key.');
    return false;
  }
  if (!e2bKey) {
    console.error('❌ Error: Missing E2B_API_KEY in .env.');
    return false;
  }
  return true;
}

async function runRealTest() {
  console.log('🚀 Starting REAL E2B Integration Test...');
  console.log('----------------------------------------');
  console.log('This test will connect to:');
  console.log('1. MongoDB (localhost:27017)');
  console.log('2. OpenAI API (Real inference)');
  console.log('3. E2B Cloud (Real sandbox)');
  console.log('----------------------------------------');

  if (!checkEnv()) return;

  try {
    // 1. 连接数据库
    console.log('🔌 Connecting to MongoDB...');
    await connectDb();
    console.log('✅ MongoDB connected.');

    // 2. 模拟用户和请求
    // Generate a valid MongoDB ObjectId for the user
    const userId = new mongoose.Types.ObjectId();
    const user = { 
      id: userId.toString(), 
      username: 'RealTester',
      name: 'Real Tester'
    };

    // 3. 创建 Assistant
    // 使用 'code-interpreter' 官方模板以确保兼容性
    console.log('\n📝 Creating Assistant...');
    
    const createReq = {
      user,
      body: {
        name: 'Real E2B Analyst',
        instructions: 'You are a python data analyst. Always write and execute python code to solve math or data problems.',
        // Add 'prompt' field explicitly as it is required by the Schema
        prompt: 'You are a python data analyst. Always write and execute python code to solve math or data problems.',
        model: 'gpt-4o', 
        e2b_sandbox_template: 'xed696qfsyzpaei3ulh5', // Custom Template with pre-installed packages
        e2b_config: { timeout_ms: 600000 } // Increased to 10 minutes
      }
    };
    const createRes = mockRes();
    
    await controller.createAssistant(createReq, createRes);
    
    if (createRes.statusCode !== 201) {
      throw new Error(`Failed to create assistant: ${JSON.stringify(createRes.body)}`);
    }
    
    const assistant = createRes.body;
    console.log(`✅ Assistant Created: ${assistant.id} (${assistant.name})`);

    // 4. 发起对话 (Chat)
    // 这是一个真实的端到端调用
    console.log('\n💬 Sending Chat Message (this allows the Agent to think and run code)...');
    console.log('❓ Question: "Load the Iris dataset using scikit-learn. Split it into train/test sets. Train an XGBoost classifier. Print the accuracy score."');
    
    const chatReq = {
      user,
      baseUrl: '/api/e2b-assistants', // Required for version detection in helpers.js
      params: { assistant_id: assistant.id },
      body: {
        text: 'Load the Iris dataset using scikit-learn. Split it into train/test sets. Train an XGBoost classifier. Print the accuracy score.',
        conversationId: `real-test-convo-${Date.now()}`,
        version: 2, // Explicitly set version to bypass config lookup issues
        endpoint: 'e2bAssistants' // Required by getOpenAIClient helper
      }
    };
    const chatRes = mockRes();

    const startTime = Date.now();
    await controller.chat(chatReq, chatRes);
    const duration = (Date.now() - startTime) / 1000;

    // 5. 验证结果
    if (chatRes.body && chatRes.body.text) {
      console.log(`\n✅ Chat Response Received (${duration.toFixed(1)}s):`);
      console.log('===================================================');
      console.log(chatRes.body.text);
      console.log('===================================================');
      
      if (chatRes.body.intermediateSteps && chatRes.body.intermediateSteps.length > 0) {
        console.log(`🛠️  Real Tool Executions (${chatRes.body.intermediateSteps.length}):`);
        chatRes.body.intermediateSteps.forEach((step, index) => {
          console.log(`\n[Step ${index + 1}] Tool: ${step.tool}`);
          console.log(`  Args: ${JSON.stringify(step.arguments)}`);
          if (step.observation) {
            const output = JSON.stringify(step.observation);
            console.log(`  Output: ${output.length > 200 ? output.substring(0, 200) + '...' : output}`);
          
          if (step.tool === 'execute_code' && step.observation && step.observation.success) {  
          console.log(`  ✅ Code executed successfully despite error logs`);
            }
          }
        });
      } else {
        console.warn('⚠️  Warning: No tool executions recorded. The LLM might have answered directly without code.');
      }
    } else {
      console.error('❌ Chat Failed:', chatRes.body);
    }

    // 6. 清理 (删除 Assistant)
    console.log('\n🧹 Cleaning up...');
    await controller.deleteAssistant({ user, params: { assistant_id: assistant.id } }, mockRes());
    console.log('✅ Assistant Deleted');

  } catch (error) {
    console.error('\n❌ Test Failed With Error:');
    console.error(error);
  } finally {
    // 关闭数据库连接
    await mongoose.disconnect();
    process.exit(0);
  }
}

runRealTest();
