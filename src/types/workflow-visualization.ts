// 工作流可视化状态类型
// 用于实时展示工作流执行状态

/**
 * 工作流节点状态
 */
export type WorkflowNodeStatus =
  | 'pending'    // 等待执行
  | 'running'    // 执行中
  | 'success'    // 执行成功
  | 'failed'     // 执行失败
  | 'skipped'    // 被跳过
  | 'paused';    // 暂停

/**
 * 工作流节点（对应 DAG 中的节点）
 */
export interface WorkflowNode {
  /** 节点 ID */
  id: string;
  /** 节点名称（Skill 名称） */
  name: string;
  /** 节点类型 */
  type: 'skill' | 'gate' | 'condition' | 'start' | 'end';
  /** 节点状态 */
  status: WorkflowNodeStatus;
  /** 节点输入 */
  input?: Record<string, unknown>;
  /** 节点输出 */
  output?: Record<string, unknown>;
  /** 错误信息 */
  error?: string;
  /** 开始时间 */
  startTime?: number;
  /** 结束时间 */
  endTime?: number;
  /** 执行耗时(ms) */
  duration?: number;
  /** 重试次数 */
  retryCount?: number;
  /** 图位置 */
  position?: { x: number; y: number };
}

/**
 * 工作流边（对应 DAG 中的边）
 */
export interface WorkflowEdge {
  /** 边 ID */
  id: string;
  /** 源节点 ID */
  source: string;
  /** 目标节点 ID */
  target: string;
  /** 边类型 */
  type: 'dependency' | 'condition-true' | 'condition-false';
  /** 是否激活 */
  active?: boolean;
}

/**
 * 工作流执行快照
 */
export interface WorkflowSnapshot {
  /** 快照 ID */
  id: string;
  /** 工作流名称 */
  workflowName: string;
  /** 追踪 ID */
  traceId: string;
  /** 快照创建时间 */
  timestamp: number;
  /** 当前步骤索引 */
  currentStepIndex: number;
  /** 当前步骤名称 */
  currentStepName: string;
  /** 节点列表 */
  nodes: WorkflowNode[];
  /** 边列表 */
  edges: WorkflowEdge[];
  /** 步骤历史 */
  stepHistory: WorkflowStepHistory[];
}

/**
 * 步骤执行历史
 */
export interface WorkflowStepHistory {
  /** 步骤名称 */
  stepName: string;
  /** 状态 */
  status: 'started' | 'success' | 'failed' | 'skipped';
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime?: number;
  /** 耗时 */
  duration?: number;
  /** 输出摘要 */
  outputSummary?: string;
  /** 错误信息 */
  error?: string;
}

/**
 * 工作流可视化事件类型
 */
export type WorkflowVisualizationEvent =
  | { type: 'started'; payload: { workflowName: string; traceId: string; totalSteps: number } }
  | { type: 'step-started'; payload: { stepName: string; stepIndex: number; nodeId: string } }
  | { type: 'step-progress'; payload: { stepName: string; progress: number; message?: string } }
  | { type: 'step-completed'; payload: { stepName: string; stepIndex: number; nodeId: string; output?: Record<string, unknown> } }
  | { type: 'step-failed'; payload: { stepName: string; stepIndex: number; nodeId: string; error: string } }
  | { type: 'step-skipped'; payload: { stepName: string; stepIndex: number; reason?: string } }
  | { type: 'paused'; payload: { atStep: string; reason?: string } }
  | { type: 'resumed'; payload: { atStep: string } }
  | { type: 'completed'; payload: { workflowName: string; success: boolean; totalDuration: number } }
  | { type: 'snapshot'; payload: WorkflowSnapshot }
  | { type: 'node-updated'; payload: WorkflowNode }
  | { type: 'edge-activated'; payload: { edgeId: string; active: boolean } };

/**
 * 工作流可视化状态
 */
export interface WorkflowVisualizationState {
  /** 是否连接 */
  connected: boolean;
  /** 当前工作流名称 */
  workflowName?: string;
  /** 追踪 ID */
  traceId?: string;
  /** 是否暂停 */
  paused: boolean;
  /** 节点映射 */
  nodes: Map<string, WorkflowNode>;
  /** 边映射 */
  edges: Map<string, WorkflowEdge>;
  /** 当前步骤 */
  currentStep?: string;
  /** 开始时间 */
  startTime?: number;
  /** 最后更新时间 */
  lastUpdateTime?: number;
}

/**
 * 可视化连接信息
 */
export interface VisualizationConnection {
  /** 连接 ID */
  id: string;
  /** 创建时间 */
  createdAt: number;
  /** 最后活动 */
  lastActivity: number;
  /** 订阅的工作流 */
  subscribedWorkflows: Set<string>;
}

export default {};
