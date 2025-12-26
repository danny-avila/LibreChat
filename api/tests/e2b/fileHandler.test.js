// 模拟 initialize.js 模块，返回期望的对象结构
// 这是为了在测试中隔离文件处理器的依赖，避免实际调用 e2b 客户端
jest.mock('~/server/services/Endpoints/e2bAssistants/initialize', () => ({
  e2bClientManager: {
    uploadFile: jest.fn(),      // 模拟文件上传方法
    downloadFile: jest.fn(),    // 模拟文件下载方法
    executeCode: jest.fn(),     // 模拟代码执行方法
  },
  initializeClient: jest.fn(),  // 模拟客户端初始化方法
}));

// 首先模拟 codeExecutor 模块，防止它加载实际的 initialize.js
// 这是在测试 fileHandler 时隔离其依赖的 codeExecutor
jest.mock('~/server/services/Sandbox/codeExecutor', () => ({
  uploadFile: jest.fn(),    // 模拟上传文件到沙盒的方法
  downloadFile: jest.fn(),  // 模拟从沙盒下载文件的方法
}));

// 导入需要测试的模块和依赖
const fileHandler = require('~/server/services/Sandbox/fileHandler');
const codeExecutor = require('~/server/services/Sandbox/codeExecutor');
const { FileSources } = require('librechat-data-provider'); // 文件来源枚举

// 完全模拟文件策略模块
// 模拟 getStrategyFunctions 函数，用于获取特定文件存储策略的实现
jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(),
}));
const { getStrategyFunctions } = require('~/server/services/Files/strategies');

// 模拟文件策略获取模块
// 模拟 getFileStrategy 函数，使其返回固定的 'local' 策略
jest.mock('~/server/utils/getFileStrategy', () => ({
  getFileStrategy: jest.fn().mockReturnValue('local'),
}));

// 模拟文件模型模块
// 模拟数据库文件操作的函数
jest.mock('~/models/File', () => ({
  findFileById: jest.fn(), // 根据ID查找文件
  createFile: jest.fn(),   // 创建新文件记录
}));
const { findFileById, createFile } = require('~/models/File');

// 模拟日志模块
// 避免测试时产生实际的日志输出
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// 描述测试套件：FileHandler 服务
describe('FileHandler Service', () => {
  // 定义测试中使用的模拟数据
  const mockUserId = 'user123';
  const mockConversationId = 'convo123';
  const mockReq = { config: {} }; // 模拟请求对象

  // 在每个测试用例运行前执行，清理所有模拟函数的调用记录
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 测试分组：syncFilesToSandbox 方法
  // 这个方法负责将本地文件同步到代码执行沙盒中
  describe('syncFilesToSandbox', () => {
    // 测试用例1：验证成功同步文件到沙盒
    it('should sync files successfully', async () => {
      // 准备测试数据
      const fileId = 'file123';
      const fileIds = [fileId];
      
      // 模拟数据库返回的文件文档对象
      const mockFileDoc = {
        file_id: fileId,
        source: FileSources.local, // 文件来源：本地
        filepath: '/path/to/file.txt', // 实际存储路径
        filename: 'file.txt',           // 文件名
      };
      
      // 设置模拟：数据库查找返回文件文档
      findFileById.mockResolvedValue(mockFileDoc);
      
      // 创建模拟的文件流
      // 模拟异步迭代器，返回文件内容的缓冲区
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from('test content'); // 模拟文件内容
        }
      };

      // 模拟文件策略对象
      // 返回模拟的下载流获取方法
      const mockStrategy = {
        getDownloadStream: jest.fn().mockResolvedValue(mockStream),
      };
      getStrategyFunctions.mockReturnValue(mockStrategy);

      // 设置模拟：codeExecutor 上传文件成功
      codeExecutor.uploadFile.mockResolvedValue({ success: true });

      // 执行测试：调用同步文件方法
      const result = await fileHandler.syncFilesToSandbox({
        req: mockReq,
        userId: mockUserId,
        conversationId: mockConversationId,
        fileIds
      });

      // 验证断言：
      // 1. 应该调用数据库查找方法，查找正确的文件ID
      expect(findFileById).toHaveBeenCalledWith(fileId);
      
      // 2. 应该调用文件策略的获取下载流方法
      expect(mockStrategy.getDownloadStream).toHaveBeenCalled();
      
      // 3. 应该调用 codeExecutor 的上传文件方法
      // 验证上传的参数：用户ID、会话ID、文件缓冲区、目标路径
      expect(codeExecutor.uploadFile).toHaveBeenCalledWith(
        mockUserId,
        mockConversationId,
        expect.any(Buffer), // 期望上传的是 Buffer 类型
        '/home/user/file.txt' // 验证沙盒中的目标路径格式
      );
      
      // 4. 返回结果应该是一个长度为1的数组
      expect(result).toHaveLength(1);
      
      // 5. 返回结果中应包含正确的文件ID
      expect(result[0].fileId).toBe(fileId);
    });

    // 测试用例2：验证优雅处理缺失文件的情况
    it('should handle missing files gracefully', async () => {
      // 设置模拟：数据库查找返回 null（文件不存在）
      findFileById.mockResolvedValue(null);

      // 执行测试：尝试同步不存在的文件
      const result = await fileHandler.syncFilesToSandbox({
        req: mockReq,
        userId: mockUserId,
        conversationId: mockConversationId,
        fileIds: ['missing_file'] // 不存在的文件ID
      });

      // 验证断言：应该返回空数组而不是抛出错误
      expect(result).toHaveLength(0);
    });
  });

  // 测试分组：persistArtifacts 方法
  // 这个方法负责将沙盒中生成的文件下载并持久化到本地存储
  describe('persistArtifacts', () => {
    // 测试用例1：验证成功下载并持久化沙盒中的文件
    it('should download and persist artifacts', async () => {
      // 准备测试数据：模拟沙盒中的文件列表
      const artifacts = [{ 
        name: 'plot.png',       // 文件名
        path: '/home/user/plot.png' // 沙盒中的路径
      }];
      
      // 模拟文件内容缓冲区
      const mockBuffer = Buffer.from('image data');
      
      // 设置模拟：codeExecutor 下载文件返回缓冲区
      codeExecutor.downloadFile.mockResolvedValue(mockBuffer);
      
      // 模拟文件策略对象
      // 返回模拟的保存缓冲区方法
      const mockStrategy = {
        saveBuffer: jest.fn().mockResolvedValue('/storage/path/plot.png'),
      };
      getStrategyFunctions.mockReturnValue(mockStrategy);

      // 模拟数据库返回的新文件记录
      const mockFileDoc = { 
        file_id: 'new_file_id', 
        filepath: '/storage/path/plot.png' 
      };
      createFile.mockResolvedValue(mockFileDoc);

      // 执行测试：调用持久化文件方法
      const result = await fileHandler.persistArtifacts({
        req: mockReq,
        userId: mockUserId,
        conversationId: mockConversationId,
        artifacts
      });

      // 验证断言：
      // 1. 应该调用 codeExecutor 的下载文件方法
      // 验证下载的参数：用户ID、会话ID、文件路径、返回格式
      expect(codeExecutor.downloadFile).toHaveBeenCalledWith(
        mockUserId,
        mockConversationId,
        '/home/user/plot.png',
        'buffer' // 指定返回格式为缓冲区
      );
      
      // 2. 应该调用文件策略的保存缓冲区方法
      expect(mockStrategy.saveBuffer).toHaveBeenCalled();
      
      // 3. 应该调用数据库的创建文件方法
      expect(createFile).toHaveBeenCalled();
      
      // 4. 返回结果应该是一个长度为1的数组
      expect(result).toHaveLength(1);
      
      // 5. 返回结果应该与模拟的文件文档一致
      expect(result[0]).toEqual(mockFileDoc);
    });

    // 测试用例2：验证处理下载错误的情况
    it('should handle download errors', async () => {
      // 设置模拟：codeExecutor 下载文件抛出错误
      codeExecutor.downloadFile.mockRejectedValue(new Error('Download failed'));

      // 执行测试：尝试下载文件（预期会失败）
      const result = await fileHandler.persistArtifacts({
        req: mockReq,
        userId: mockUserId,
        conversationId: mockConversationId,
        artifacts: [{ name: 'test.png', path: '/path' }]
      });

      // 验证断言：下载失败时应返回空数组
      expect(result).toHaveLength(0);
    });
  });
});