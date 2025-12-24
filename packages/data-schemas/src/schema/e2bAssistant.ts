import { Schema, Types } from 'mongoose';

// E2B Assistant类型定义（内联定义，避免循环导入）
interface IE2BAssistantData {
  id: string;
  name: string;
  description?: string;
  prompt: string; // 改名为prompt避免与Mongoose字段冲突
  avatar?: {
    filepath: string;
    source: string;
  };
  author: Types.ObjectId; // 使用Types.ObjectId
  e2b_sandbox_template: string;
  e2b_config: {
    timeout_ms: number;
    max_memory_mb: number;
    max_cpu_percent: number;
  };
  code_execution_mode: 'interactive' | 'batch';
  allowed_libraries: string[];
  model: string;
  file_ids?: string[];
  conversation_starters?: string[];
  is_public: boolean;
  access_level: number;
  createdAt?: string;
  updatedAt?: string;
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
    conversation_starters: {
      type: [String],
      default: [],
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
  },
  {
    timestamps: true,
  },
);

e2bAssistantSchema.index({ updatedAt: -1, _id: 1 });

export default e2bAssistantSchema;
