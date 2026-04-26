// Smart Code Agent 类型定义

// ==================== Skill 相关类型 ====================

/**
 * Skill 类别
 */
export type SkillCategory = 'ask' | 'search' | 'analyze' | 'generate' | 'format' | 'io' | 'observe' | 'utility' | 'workflow' | 'plan';

/**
 * Skill 输入接口
 */
export interface SkillInput {
  /** 全局标准化配置 */
  config: Record<string, unknown>;
  /** 授权访问的上下文 */
  context: {
    /** 只读上下文 */
    readOnly: Record<string, unknown>;
    /** 可写上下文 */
    writable: Record<string, unknown>;
  };
  /** 当前任务描述 */
  task: {
    /** 任务唯一ID */
    taskId: string;
    /** 任务名称 */
    taskName: string;
    /** 任务核心目标 */
    target: string;
    /** 任务输入参数 */
    params: Record<string, unknown>;
    /** 任务超时时间(ms) */
    timeout: number;
    /** 最大重试次数 */
    maxRetry: number;
  };
  /** 快照路径 */
  snapshotPath: string;
  /** 全链路追踪ID */
  traceId: string;
}

/**
 * Skill 输出状态码
 */
export type SkillStatusCode = 200 | 300 | 400 | 500;

/**
 * Skill 输出接口
 */
export interface SkillOutput {
  /** 执行结果状态码 */
  code: SkillStatusCode;
  /** 执行结果数据 */
  data: Record<string, unknown>;
  /** 执行描述信息 */
  message: string;
  /** 建议的下一步动作 */
  nextAction?: string;
  /** 是否需要回滚 */
  needRollback?: boolean;
}

/**
 * Skill 依赖
 */
export interface SkillDependency {
  /** 依赖的 Skill 名称 */
  skill: string;
  /** 最小版本约束（可选） */
  version?: string;
  /** 依赖说明 */
  description?: string;
}

/**
 * Skill 元信息
 */
export interface SkillMeta {
  name: string;
  description: string;
  category: SkillCategory;
  version: string;
  tags?: string[];
  /** 依赖的其他 Skills */
  dependencies?: SkillDependency[];
  /** 是否为入口 Skill（无前置依赖） */
  isEntry?: boolean;
}

/**
 * Skill 实例
 */
export interface Skill {
  meta: SkillMeta;
  run(input: SkillInput): Promise<SkillOutput>;
}

// ==================== 工作流相关类型 ====================

/**
 * 工作流步骤
 */
export interface WorkflowStep {
  /** Skill 名称 */
  skill: string;
  /** 参数 */
  params?: Record<string, unknown>;
  /** 成功时下一步 */
  onSuccess?: string | null;
  /** 失败时下一步 */
  onFail?: string | null;
  /** 重试次数 */
  retry?: number;
}

/**
 * 工作流定义
 */
export interface Workflow {
  /** 工作流名称 */
  name: string;
  /** 工作流描述 */
  description: string;
  /** 初始步骤 */
  initialStep: string;
  /** 步骤列表 */
  steps: WorkflowStep[];
}

/**
 * 工作流定义（用于解析器）
 */
export interface WorkflowDefinition {
  name: string;
  description?: string;
  initialStep: string;
  steps: Array<{
    skill: string;
    params?: Record<string, unknown>;
    onSuccess?: string | null;
    onFail?: string | null;
    retry?: number;
  }>;
}

/**
 * 工作流执行状态
 */
export interface WorkflowExecution {
  workflowName: string;
  traceId: string;
  currentStep: string;
  status: 'running' | 'success' | 'failed' | 'paused';
  context: Record<string, unknown>;
  startTime: number;
  endTime?: number;
  stepsExecuted: string[];
  error?: string;
}

// ==================== 知识库相关类型 ====================

/**
 * 知识条目
 */
export interface KnowledgeEntry {
  id: string;
  topic: string;
  keywords: string[];
  content: string;
  summary: string;
  source: 'web' | 'manual' | 'learned';
  sourceUrl?: string;
  createdAt: string;
  updatedAt: string;
  usageCount: number;
}

// ==================== 观察者相关类型 ====================

/**
 * 阶段执行记录
 */
export interface StageRecord {
  traceId: string;
  stage: string;
  startTime: number;
  endTime: number;
  duration: number;
  status: 'success' | 'failed' | 'retry' | 'paused';
  skills: string[];
  metrics: Record<string, unknown>;
  error?: {
    type: string;
    message: string;
    stack?: string;
  };
}

/**
 * 用户修改记录
 */
export interface UserModification {
  projectId: string;
  traceId: string;
  stage: 'demand' | 'code' | 'test' | 'delivery';
  timestamp: string;
  modifiedFiles: string[];
  modificationType: 'add' | 'delete' | 'modify' | 'refactor';
  userReason?: string;
  autoSuggested?: boolean;
  diffSummary?: string;
}

/**
 * 运行摘要
 */
export interface RunSummary {
  traceId: string;
  projectName: string;
  startTime: string;
  endTime: string;
  totalDuration: number;
  stages: StageRecord[];
  overallStatus: 'success' | 'failed' | 'partial';
  userModifications: UserModification[];
}

// ==================== LLM 桥接相关类型 ====================

/**
 * 消息
 */
export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  name?: string;
}

/**
 * 工具定义
 */
export interface Tool {
  name: string;
  description: string;
  inputSchema: object;
}

/**
 * LLM 调用结果
 */
export interface LLMResult {
  content: string;
  toolCalls?: {
    name: string;
    arguments: Record<string, unknown>;
  }[];
}

// ==================== 插件相关类型 ====================

/**
 * 启动参数
 */
export interface StartParams {
  projectType: 'page' | 'api' | 'component' | 'project';
  initialDemand?: string;
  projectPath?: string;
}

/**
 * 运行结果
 */
export interface RunResult {
  traceId: string;
  status: 'success' | 'failed' | 'partial';
  output: Record<string, unknown>;
  errors?: string[];
}

/**
 * 用户反馈
 */
export interface UserFeedback {
  type: 'bug' | 'suggestion' | 'question';
  content: string;
  stage?: string;
  traceId?: string;
}

// ==================== 进度回调类型 ====================

/**
 * 进度回调参数
 */
export interface ProgressCallbackArgs {
  /** 当前步骤名称 */
  stepName: string | null;
  /** 步骤索引 */
  stepIndex: number;
  /** 总步骤数 */
  totalSteps: number;
  /** 步骤状态 */
  status: 'started' | 'success' | 'failed' | 'paused';
  /** 步骤输出 */
  output?: SkillOutput;
  /** 执行消息 */
  message?: string;
  /** 时间戳 */
  timestamp: number;
}
