/**
 * Admin Dashboard Type Definitions
 * 
 * This file contains all TypeScript interfaces and types for the Admin Reporting Dashboard.
 * These types correspond to the API response structures defined in the design document.
 */

// ============================================================================
// Time Range Types
// ============================================================================

export type TimeRangePreset = 'today' | 'last7days' | 'last30days' | 'last90days' | 'custom';

export interface TimeRange {
  start: Date;
  end: Date;
  preset?: TimeRangePreset;
}

export interface TimeSeriesData {
  timestamp: Date;
  value: number;
}

// ============================================================================
// Dashboard Overview Types
// ============================================================================

export interface DashboardOverview {
  users: {
    total: number;
    active: number;
    newToday: number;
    newThisWeek: number;
    newThisMonth: number;
  };
  conversations: {
    total: number;
    activeToday: number;
    averageLength: number;
  };
  messages: {
    total: number;
    todayCount: number;
    userGenerated: number;
    aiGenerated: number;
  };
  tokens: {
    totalConsumed: number;
    estimatedCost: number;
    averagePerConversation: number;
  };
  systemHealth: {
    avgResponseTime: number;
    errorRate: number;
    cacheHitRate: number;
  };
}

// ============================================================================
// User Metrics Types
// ============================================================================

export interface TopUser {
  userId: string;
  email: string;
  conversationCount: number;
  messageCount: number;
  tokenUsage: number;
  lastActive: Date;
}

export interface UserMetrics {
  totalUsers: number;
  activeUsers: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  newUsers: TimeSeriesData[];
  authMethodBreakdown: {
    email: number;
    google: number;
    github: number;
    other: number;
  };
  topUsers: TopUser[];
}

// ============================================================================
// Conversation Metrics Types
// ============================================================================

export interface EndpointBreakdown {
  endpoint: string;
  count: number;
  percentage: number;
}

export interface ConversationMetrics {
  totalConversations: number;
  conversationsByPeriod: TimeSeriesData[];
  averageMessagesPerConversation: number;
  conversationsByEndpoint: EndpointBreakdown[];
  conversationLengthDistribution: {
    short: number;    // 1-5 messages
    medium: number;   // 6-20 messages
    long: number;     // 21+ messages
  };
  archivedCount: number;
}

// ============================================================================
// Token Metrics Types
// ============================================================================

export interface EndpointTokenUsage {
  endpoint: string;
  tokens: number;
  cost: number;
}

export interface ModelTokenUsage {
  model: string;
  tokens: number;
  cost: number;
}

export interface TokenMetrics {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  tokensByEndpoint: EndpointTokenUsage[];
  tokensByModel: ModelTokenUsage[];
  estimatedCosts: {
    total: number;
    byEndpoint: { endpoint: string; cost: number }[];
  };
  balanceStats: {
    totalCredits: number;
    averageBalance: number;
    usersWithLowBalance: number;
  };
  cacheStats: {
    writeTokens: number;
    readTokens: number;
    hitRate: number;
    savings: number;
  };
}

// ============================================================================
// Message Metrics Types
// ============================================================================

export interface MessageMetrics {
  totalMessages: number;
  messagesByPeriod: TimeSeriesData[];
  userGeneratedCount: number;
  aiGeneratedCount: number;
  averageLength: number;
  errorCount: number;
  errorRate: number;
}

// ============================================================================
// System Health Metrics Types
// ============================================================================

export interface SystemHealthMetrics {
  avgResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  errorRate: number;
  totalRequests: number;
  cacheHitRate: number;
  cacheMemoryUsage: number;
  concurrentUsers: number;
  databaseQueryTime: number;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface TimeRangeParams {
  startDate?: string;
  endDate?: string;
  preset?: TimeRangePreset;
}

export interface ExportParams {
  format: 'csv' | 'json';
  startDate?: string;
  endDate?: string;
  metrics?: string[];
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: Date;
}

// ============================================================================
// Component Props Types
// ============================================================================

export interface MetricCardProps {
  title: string;
  value: number | string;
  change?: number;
  changeType?: 'increase' | 'decrease' | 'neutral';
  icon?: React.ReactNode;
  loading?: boolean;
}

export interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  presets: TimeRangePreset[];
}

export interface TopUsersTableProps {
  users: TopUser[];
  metric: 'conversations' | 'tokens' | 'messages';
  loading?: boolean;
}

export interface ExportButtonProps {
  format: 'csv' | 'json';
  data: any;
  filename: string;
}

// ============================================================================
// Dashboard State Types
// ============================================================================

export interface DashboardMetrics {
  overview?: DashboardOverview;
  users?: UserMetrics;
  conversations?: ConversationMetrics;
  tokens?: TokenMetrics;
  messages?: MessageMetrics;
  systemHealth?: SystemHealthMetrics;
}

export interface AdminDashboardState {
  timeRange: TimeRange;
  metrics: DashboardMetrics;
  loading: boolean;
  error: Error | null;
  autoRefresh: boolean;
  lastUpdate?: Date;
}
