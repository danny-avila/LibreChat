// E2B Assistant类型定义
export interface IE2BAssistant {
  id: string;
  name: string;
  description?: string;
  instructions: string;
  avatar?: {
    filepath: string;
    source: string;
  };
  author: string;  
  // E2B配置
  e2b_sandbox_template: string;
  e2b_config: {
    timeout_ms: number;
    max_memory_mb: number;
    max_cpu_percent: number;
  };
  
  // 代码执行
  code_execution_mode: 'interactive' | 'batch';
  allowed_libraries: string[];
  
  // LLM配置
  model: string;
  
  // 文件和工具
  file_ids?: string[];
  conversation_starters?: string[];
  
  // 访问控制（协作部分）
  is_public: boolean;
  access_level: number;
  
  createdAt?: string;
  updatedAt?: string;
  
  // E2B特有字段 - 根据用户要求
  env_vars: Map<string, string>;
  has_internet_access: boolean;
  is_persistent: boolean;
  metadata: Record<string, unknown>;
}
