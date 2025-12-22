class E2BService {
  constructor() {
    this.apiKey = process.env.E2B_API_KEY;
    if (!this.apiKey) {
      console.warn('⚠️ WARNING: E2B_API_KEY is missing in .env file!');
    }
  }

  async executeCode(code) {
    console.log('[E2B] Initializing sandbox...');
    let sandbox;
    
    try {
      // 动态导入 Sandbox
      const { Sandbox } = await import('@e2b/code-interpreter');

      // 创建沙箱
      sandbox = await Sandbox.create({
        apiKey: this.apiKey,
      });

      console.log(`[E2B] Sandbox created with ID: ${sandbox.id}`);
      console.log('[E2B] Running code...');

      // 执行代码
      const execution = await sandbox.runCode(code);

      console.log('[E2B] Execution finished.');
      
      // 返回结果
      return {
        logs: execution.logs,
        error: execution.error,
        results: execution.results,
        sandboxId: sandbox.id
      };

    } catch (error) {
      console.error('[E2B] Fatal Error:', error);
      throw error;
    } finally {
      if (sandbox) {
        // 关闭沙箱以释放资源
        await sandbox.kill(); 
        console.log(`[E2B] Sandbox closed.`);
      }
    }
  }
}

module.exports = new E2BService();