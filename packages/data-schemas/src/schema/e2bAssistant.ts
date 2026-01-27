import { Schema, Types } from 'mongoose';

// E2B Assistant类型定义（内联定义，避免循环导入）
interface IE2BAssistantData {
  id: string;
  name: string;
  description?: string;
  prompt: string;
  avatar?: {
    filepath: string;
    source: string;
  };
  author: Types.ObjectId;
  
  // E2B特定配置
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
  tools?: any[];
  tool_resources?: any;
  conversation_starters?: string[];
  append_current_datetime?: boolean;
  
  // 访问控制 - 由协作人员实现
  is_public: boolean;
  access_level: number;
  
  createdAt?: string;
  updatedAt?: string;
  
  // E2B特有字段 - 根据用户要求
  env_vars: Map<string, string>;
  has_internet_access: boolean;
  is_persistent: boolean;
  metadata: Record<string, unknown>;
  
  // 数据源配置
  data_sources?: Array<{
    id: string;
    type: 'mysql' | 'postgresql';
    name: string;
    config: Record<string, unknown>;
  }>;
}

const e2bAssistantSchema = new Schema<IE2BAssistantData>(
  {
    id: {
      type: String,
      index: true,
      unique: true,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    prompt: {
      type: String,
      required: true,
    },
    avatar: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    
    // E2B特定配置
    e2b_sandbox_template: {
      type: String,
      default: 'python3-data-analysis',
    },
    e2b_config: {
      type: Object,
      default: {
        timeout_ms: 300000,
        max_memory_mb: 2048,
        max_cpu_percent: 80,
      },
    },
    
    // 代码执行设置
    code_execution_mode: {
      type: String,
      enum: ['interactive', 'batch'],
      default: 'interactive',
    },
    allowed_libraries: {
      type: [String],
      default: ['pandas', 'numpy', 'matplotlib', 'seaborn', 'scikit-learn', 'xgboost'],
    },
    
    // LLM配置
    model: {
      type: String,
      required: true,
    },
    
    // 文件和工具
    file_ids: { 
      type: [String], 
      default: [] 
    },
    tools: {
      type: Schema.Types.Mixed,
      default: [],
      description: '启用的工具列表 (e.g., code_interpreter, file_search)',
    },
    tool_resources: {
      type: Schema.Types.Mixed,
      default: {},
      description: '工具资源配置 (e.g., code_interpreter.file_ids)',
    },
    conversation_starters: {
      type: [String],
      default: [],
    },
    append_current_datetime: {
      type: Boolean,
      default: false,
      description: '是否在提示中添加当前日期和时间',
    },
    
    // 访问控制 - 由协作人员实现
    is_public: {
      type: Boolean,
      default: false,
    },
    access_level: {
      type: Number,
      default: 0,
    },
    
    // E2B特有字段 - 根据用户要求
    env_vars: {
      type: Map,
      of: String,
      default: new Map(),
      description: '环境变量，会在沙箱启动时注入',
    },
    has_internet_access: {
      type: Boolean,
      default: true,
      description: '控制沙箱是否可以访问外网',
    },
    is_persistent: {
      type: Boolean,
      default: false,
      description: '决定沙箱是否持久化',
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
      description: '自定义元数据，方便添加实验性功能',
    },
    // 数据源配置
    data_sources: {
      type: [Schema.Types.Mixed],
      default: [],
      description: '数据库连接配置列表 (MySQL, PostgreSQL)',
    },
  },
  {
    timestamps: true,
  },
);

e2bAssistantSchema.index({ updatedAt: -1, _id: 1 });

export default e2bAssistantSchema;
