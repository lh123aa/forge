// 工作流可视化观察者
// 观察工作流执行并发布可视化事件

import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger.js';
import type {
  WorkflowNode,
  WorkflowEdge,
  WorkflowSnapshot,
  WorkflowVisualizationEvent,
  WorkflowVisualizationState,
} from '../types/workflow-visualization.js';

const logger = createLogger('WorkflowObserver');

/**
 * 工作流可视化观察者
 * 发布工作流执行事件供前端可视化使用
 */
export class WorkflowObserver extends EventEmitter {
  private connections: Map<string, WorkflowVisualizationState> = new Map();

  constructor() {
    super();
    // 设置最大监听器数量
    this.setMaxListeners(100);
  }

  /**
   * 开始观察工作流
   */
  startWorkflow(traceId: string, workflowName: string, steps: string[]): void {
    const state: WorkflowVisualizationState = {
      connected: true,
      workflowName,
      traceId,
      paused: false,
      nodes: new Map(),
      edges: new Map(),
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
    };

    // 创建节点
    let x = 0;
    let y = 0;
    const nodeSpacing = 150;
    const levelSpacing = 100;

    for (let i = 0; i < steps.length; i++) {
      const stepName = steps[i];
      const node: WorkflowNode = {
        id: `node-${i}`,
        name: stepName,
        type: 'skill',
        status: 'pending',
        position: { x, y },
        retryCount: 0,
      };
      state.nodes.set(node.id, node);

      // 创建边（连接到前一个节点）
      if (i > 0) {
        const edge: WorkflowEdge = {
          id: `edge-${i - 1}-${i}`,
          source: `node-${i - 1}`,
          target: `node-${i}`,
          type: 'dependency',
          active: false,
        };
        state.edges.set(edge.id, edge);
      }

      // 位置递增（简单的水平布局）
      x += nodeSpacing;
      if ((i + 1) % 5 === 0) {
        x = 0;
        y += levelSpacing;
      }
    }

    // 添加开始和结束节点
    const startNode: WorkflowNode = {
      id: 'node-start',
      name: '开始',
      type: 'start',
      status: 'success',
      position: { x: -nodeSpacing, y: 0 },
    };
    const endNode: WorkflowNode = {
      id: 'node-end',
      name: '结束',
      type: 'end',
      status: 'pending',
      position: { x, y },
    };

    state.nodes.set(startNode.id, startNode);
    state.nodes.set(endNode.id, endNode);

    // 边：从开始到第一个，从最后一个到结束
    if (steps.length > 0) {
      const startEdge: WorkflowEdge = {
        id: 'edge-start',
        source: 'node-start',
        target: 'node-0',
        type: 'dependency',
        active: false,
      };
      const endEdge: WorkflowEdge = {
        id: 'edge-end',
        source: `node-${steps.length - 1}`,
        target: 'node-end',
        type: 'dependency',
        active: false,
      };
      state.edges.set(startEdge.id, startEdge);
      state.edges.set(endEdge.id, endEdge);
    }

    this.connections.set(traceId, state);

    // 发布开始事件
    this.emit('event', {
      type: 'started',
      payload: {
        workflowName,
        traceId,
        totalSteps: steps.length,
      },
    } as WorkflowVisualizationEvent);

    // 发布初始快照
    this.emitSnapshot(traceId);

    logger.info(`Started observing workflow: ${workflowName}`, { traceId, steps: steps.length });
  }

  /**
   * 步骤开始
   */
  stepStarted(traceId: string, stepIndex: number, stepName: string): void {
    const state = this.connections.get(traceId);
    if (!state) {
      logger.warn(`No state found for traceId: ${traceId}`);
      return;
    }

    const nodeId = `node-${stepIndex}`;
    const node = state.nodes.get(nodeId);
    if (node) {
      node.status = 'running';
      node.startTime = Date.now();
    }

    // 激活边
    if (stepIndex > 0) {
      const edgeId = `edge-${stepIndex - 1}-${stepIndex}`;
      const edge = state.edges.get(edgeId);
      if (edge) edge.active = true;
    } else {
      // 激活开始边
      const startEdge = state.edges.get('edge-start');
      if (startEdge) startEdge.active = true;
    }

    state.currentStep = stepName;
    state.lastUpdateTime = Date.now();

    this.emit('event', {
      type: 'step-started',
      payload: { stepName, stepIndex, nodeId },
    } as WorkflowVisualizationEvent);

    this.emitNodeUpdated(traceId, nodeId);
  }

  /**
   * 步骤进度更新
   */
  stepProgress(traceId: string, stepName: string, progress: number, message?: string): void {
    this.emit('event', {
      type: 'step-progress',
      payload: { stepName, progress, message },
    } as WorkflowVisualizationEvent);
  }

  /**
   * 步骤完成
   */
  stepCompleted(traceId: string, stepIndex: number, stepName: string, output?: Record<string, unknown>): void {
    const state = this.connections.get(traceId);
    if (!state) return;

    const nodeId = `node-${stepIndex}`;
    const node = state.nodes.get(nodeId);
    if (node) {
      node.status = 'success';
      node.endTime = Date.now();
      node.duration = node.endTime - (node.startTime || 0);
      node.output = output;
    }

    // 激活到下一步的边
    if (stepIndex < this.getTotalSteps(state) - 1) {
      const edgeId = `edge-${stepIndex}-${stepIndex + 1}`;
      const edge = state.edges.get(edgeId);
      if (edge) edge.active = true;
    } else {
      // 激活结束边
      const endEdge = state.edges.get('edge-end');
      if (endEdge) endEdge.active = true;
    }

    state.lastUpdateTime = Date.now();

    this.emit('event', {
      type: 'step-completed',
      payload: { stepName, stepIndex, nodeId, output },
    } as WorkflowVisualizationEvent);

    this.emitNodeUpdated(traceId, nodeId);
  }

  /**
   * 步骤失败
   */
  stepFailed(traceId: string, stepIndex: number, stepName: string, error: string): void {
    const state = this.connections.get(traceId);
    if (!state) return;

    const nodeId = `node-${stepIndex}`;
    const node = state.nodes.get(nodeId);
    if (node) {
      node.status = 'failed';
      node.endTime = Date.now();
      node.duration = node.endTime - (node.startTime || 0);
      node.error = error;
    }

    state.lastUpdateTime = Date.now();

    this.emit('event', {
      type: 'step-failed',
      payload: { stepName, stepIndex, nodeId, error },
    } as WorkflowVisualizationEvent);

    this.emitNodeUpdated(traceId, nodeId);
  }

  /**
   * 步骤跳过
   */
  stepSkipped(traceId: string, stepIndex: number, stepName: string, reason?: string): void {
    const state = this.connections.get(traceId);
    if (!state) return;

    const nodeId = `node-${stepIndex}`;
    const node = state.nodes.get(nodeId);
    if (node) {
      node.status = 'skipped';
    }

    state.lastUpdateTime = Date.now();

    this.emit('event', {
      type: 'step-skipped',
      payload: { stepName, stepIndex, reason },
    } as WorkflowVisualizationEvent);

    this.emitNodeUpdated(traceId, nodeId);
  }

  /**
   * 工作流暂停
   */
  paused(traceId: string, atStep: string, reason?: string): void {
    const state = this.connections.get(traceId);
    if (!state) return;

    state.paused = true;
    state.lastUpdateTime = Date.now();

    this.emit('event', {
      type: 'paused',
      payload: { atStep, reason },
    } as WorkflowVisualizationEvent);
  }

  /**
   * 工作流恢复
   */
  resumed(traceId: string, atStep: string): void {
    const state = this.connections.get(traceId);
    if (!state) return;

    state.paused = false;
    state.lastUpdateTime = Date.now();

    this.emit('event', {
      type: 'resumed',
      payload: { atStep },
    } as WorkflowVisualizationEvent);
  }

  /**
   * 工作流完成
   */
  completed(traceId: string, workflowName: string, success: boolean): void {
    const state = this.connections.get(traceId);
    if (!state) return;

    const totalDuration = Date.now() - (state.startTime || Date.now());

    // 更新结束节点状态
    const endNode = state.nodes.get('node-end');
    if (endNode) {
      endNode.status = success ? 'success' : 'failed';
    }

    state.lastUpdateTime = Date.now();

    this.emit('event', {
      type: 'completed',
      payload: { workflowName, success, totalDuration },
    } as WorkflowVisualizationEvent);

    // 发布最终快照
    this.emitSnapshot(traceId);

    logger.info(`Workflow completed: ${workflowName}`, { traceId, success, totalDuration });
  }

  /**
   * 获取当前状态快照
   */
  getSnapshot(traceId: string): WorkflowSnapshot | null {
    const state = this.connections.get(traceId);
    if (!state) return null;

    const nodes = Array.from(state.nodes.values());
    const edges = Array.from(state.edges.values());

    // 找到当前步骤索引
    let currentStepIndex = 0;
    if (state.currentStep) {
      const nodeIndex = nodes.findIndex((n) => n.name === state.currentStep);
      if (nodeIndex >= 0) currentStepIndex = nodeIndex;
    }

    return {
      id: `snapshot-${Date.now()}`,
      workflowName: state.workflowName || '',
      traceId: state.traceId || traceId,
      timestamp: Date.now(),
      currentStepIndex,
      currentStepName: state.currentStep || '',
      nodes,
      edges,
      stepHistory: this.buildStepHistory(state),
    };
  }

  /**
   * 获取所有活跃连接
   */
  getActiveConnections(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * 移除连接
   */
  removeConnection(traceId: string): void {
    this.connections.delete(traceId);
    logger.info(`Removed connection: ${traceId}`);
  }

  /**
   * 清空所有连接
   */
  clear(): void {
    this.connections.clear();
    logger.info('Cleared all connections');
  }

  /**
   * 发送快照
   */
  private emitSnapshot(traceId: string): void {
    const snapshot = this.getSnapshot(traceId);
    if (snapshot) {
      this.emit('event', {
        type: 'snapshot',
        payload: snapshot,
      } as WorkflowVisualizationEvent);
    }
  }

  /**
   * 发送节点更新
   */
  private emitNodeUpdated(traceId: string, nodeId: string): void {
    const state = this.connections.get(traceId);
    if (!state) return;

    const node = state.nodes.get(nodeId);
    if (node) {
      this.emit('event', {
        type: 'node-updated',
        payload: node,
      } as WorkflowVisualizationEvent);
    }
  }

  /**
   * 构建步骤历史
   */
  private buildStepHistory(state: WorkflowVisualizationState): Array<{
    stepName: string;
    status: 'started' | 'success' | 'failed' | 'skipped';
    startTime: number;
    endTime?: number;
    duration?: number;
    outputSummary?: string;
    error?: string;
  }> {
    const history: Array<{
      stepName: string;
      status: 'started' | 'success' | 'failed' | 'skipped';
      startTime: number;
      endTime?: number;
      duration?: number;
      outputSummary?: string;
      error?: string;
    }> = [];

    for (const node of state.nodes.values()) {
      if (node.type === 'skill' && node.status !== 'pending') {
        // Map internal status to history status (paused -> skipped for history)
        let historyStatus: 'started' | 'success' | 'failed' | 'skipped' = 'started';
        if (node.status === 'success') historyStatus = 'success';
        else if (node.status === 'failed') historyStatus = 'failed';
        else if (node.status === 'skipped') historyStatus = 'skipped';
        else if (node.status === 'running') historyStatus = 'started';

        history.push({
          stepName: node.name,
          status: historyStatus,
          startTime: node.startTime || Date.now(),
          endTime: node.endTime,
          duration: node.duration,
          outputSummary: node.output ? JSON.stringify(node.output).substring(0, 100) : undefined,
          error: node.error,
        });
      }
    }

    return history;
  }

  /**
   * 获取总步骤数
   */
  private getTotalSteps(state: WorkflowVisualizationState): number {
    let count = 0;
    for (const node of state.nodes.values()) {
      if (node.type === 'skill') count++;
    }
    return count;
  }
}

// 导出单例
export const workflowObserver = new WorkflowObserver();

export default workflowObserver;
