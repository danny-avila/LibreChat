// 导入代码执行服务和相关依赖
const codeExecutor = require('~/server/services/Sandbox/codeExecutor');
const { e2bClientManager } = require('~/server/services/Endpoints/e2bAssistants/initialize');

// 模拟外部 SDK，防止 ESM 加载问题
// 使用 jest.mock 创建模拟模块，避免测试时加载实际的 E2B SDK
jest.mock('@e2b/code-interpreter', () => ({
  Sandbox: {
    create: jest.fn(),
  },
}));

// 模拟 e2b 客户端管理器模块
// 为 e2bClientManager 的所有方法创建 jest mock 函数，便于在测试中控制其行为
jest.mock('~/server/services/Endpoints/e2bAssistants/initialize', () => ({
  e2bClientManager: {
    executeCode: jest.fn(),
    uploadFile: jest.fn(),
    downloadFile: jest.fn(),
    listFiles: jest.fn(),
  },
  initializeClient: jest.fn(),
}));

// 模拟日志记录模块
// 创建 logger 的模拟对象，避免在测试中产生真实的日志输出
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// 描述测试套件：代码执行服务
describe('CodeExecutor Service', () => {
  // 定义测试中使用的模拟用户ID和对话ID
  const mockUserId = 'user123';
  const mockConversationId = 'convo123';

  // 在每个测试用例运行前执行，清理所有模拟函数的调用记录
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 测试用例1：验证代码执行功能并正确格式化标准输出
  test('should execute code and format stdout correctly', async () => {
    // 模拟 e2bClientManager.executeCode 的响应
    // 返回一个成功的执行结果，其中 stdout 包含数组格式的输出
    e2bClientManager.executeCode.mockResolvedValue({
      success: true,
      results: [],
      stdout: ['Hello', 'World'], // 模拟多行输出，每行作为数组元素
      stderr: [],
      error: null,
    });

    const code = 'print("Hello\nWorld")';
    // 调用代码执行服务
    const response = await codeExecutor.execute(mockUserId, mockConversationId, code);

    // 验证：确保 executeCode 被正确调用，带有正确的参数
    expect(e2bClientManager.executeCode).toHaveBeenCalledWith(mockUserId, mockConversationId, code, {});
    // 验证：响应应表示成功
    expect(response.success).toBe(true);
    // 验证：_formatOutput 方法应将数组元素用换行符连接
    // 期望 ['Hello', 'World'] 转换为 'Hello\nWorld'
    expect(response.stdout).toBe('Hello\nWorld');
    // 验证：没有可视化内容时的标记
    expect(response.hasVisualization).toBe(false);
  });

  // 测试用例2：验证从执行结果中检测和提取图像的功能
  test('should detect and extract images from results', async () => {
    const mockPngData = 'base64pngdata';
    
    // 模拟包含图像数据和文本数据的执行结果
    e2bClientManager.executeCode.mockResolvedValue({
      success: true,
      results: [
        { png: mockPngData },      // 图像数据（应被提取）
        { text: 'some text result' } // 文本数据（应被忽略）
      ],
      stdout: [],
      stderr: [],
      error: null,
    });

    const code = 'plt.show()'; // 典型的绘图代码
    const response = await codeExecutor.execute(mockUserId, mockConversationId, code);

    // 验证：执行成功
    expect(response.success).toBe(true);
    // 验证：hasVisualization 标记应为 true（表示检测到可视化内容）
    expect(response.hasVisualization).toBe(true);
    // 验证：images 数组应包含一个元素
    expect(response.images).toHaveLength(1);
    // 验证：图像数据格式正确，包含所有必要的元数据
    expect(response.images[0]).toEqual({
      format: 'png',
      base64: mockPngData,
      mime: 'image/png',
      name: 'plot-0.png', // 自动生成的图像文件名
    });
  });

  // 测试用例3：验证对禁止代码的安全验证功能
  test('should fail validation for forbidden code', async () => {
    // 危险代码示例：尝试执行系统命令
    const code = 'import os; os.system("rm -rf /")';
    
    // 验证：执行危险代码应抛出安全验证错误
    await expect(codeExecutor.execute(mockUserId, mockConversationId, code))
      .rejects
      .toThrow(/Security validation failed/);
      
    // 验证：安全验证失败后不应调用实际的代码执行
    expect(e2bClientManager.executeCode).not.toHaveBeenCalled();
  });

  // 测试用例4：验证对执行错误的处理
  test('should handle execution errors', async () => {
    // 模拟执行错误的情况
    e2bClientManager.executeCode.mockResolvedValue({
      success: false,
      results: [],
      stdout: [],
      stderr: ['NameError: name "x" is not defined'], // 错误信息
      error: 'NameError: name "x" is not defined',    // 错误对象
    });

    const code = 'print(x)'; // 引用未定义变量的代码
    const response = await codeExecutor.execute(mockUserId, mockConversationId, code);

    // 验证：执行应标记为失败
    expect(response.success).toBe(false);
    // 验证：错误信息应正确传递
    expect(response.error).toBe('NameError: name "x" is not defined');
    // 验证：stderr 应包含错误信息
    expect(response.stderr).toContain('NameError');
  });
});