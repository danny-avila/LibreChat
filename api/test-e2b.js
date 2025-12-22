// 引入 dotenv 以读取 .env 文件中的 API Key
require('dotenv').config({ path: '../.env' }); 

// 引入 Service
const e2bService = require('./server/services/E2BService');

async function runTest() {
  console.log('🚀 Starting E2B Integration Test...');
  console.log('⏳ This might take a minute because we are installing packages inside the sandbox...');

  // 测试用的 Python 代码：先安装依赖，再执行任务
  const pythonCode = `
import os
import sys

print("📦 Installing XGBoost inside sandbox...")
# 使用 pip 安装 xgboost
os.system("pip install xgboost numpy")
print("✅ Installation complete.")

import xgboost as xgb
import numpy as np

print(f"Python Version: {sys.version}")
print(f"XGBoost Version: {xgb.__version__}")

# 简单的训练数据模拟
print("🔄 Running a mock training task...")
data = np.random.rand(5, 10) 
label = np.random.randint(2, size=5)
dtrain = xgb.DMatrix(data, label=label)

print("🎉 XGBoost DMatrix created successfully.")
  `;

  try {
    const result = await e2bService.executeCode(pythonCode);
    
    console.log('\n----------------------------------------');
    console.log('✅ Test Passed! Execution Results:');
    console.log('----------------------------------------');
    
    // 打印标准输出 (stdout)
    if (result.logs.stdout && result.logs.stdout.length > 0) {
        console.log('📜 Standard Output:\n', result.logs.stdout.join('\n'));
    }
    
    // 打印标准错误 (stderr) - pip 安装信息通常会出现在这里，不算真正的错误
    if (result.logs.stderr && result.logs.stderr.length > 0) {
        console.log('⚠️ Standard Error / Logs:\n', result.logs.stderr.join('\n'));
    }

    // 真正的代码执行错误
    if (result.error) {
        console.error('❌ Code Execution Error:', result.error);
    }

  } catch (err) {
    console.error('\n❌ Test Failed:', err);
  }
}

runTest();