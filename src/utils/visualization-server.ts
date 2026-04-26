// 工作流可视化 WebSocket 服务器
// 提供实时工作流状态推送

import { WebSocketServer, WebSocket } from 'ws';
import { createLogger } from './logger.js';
import { workflowObserver } from '../observer/workflow-observer.js';
import type { WorkflowVisualizationEvent } from '../types/workflow-visualization.js';
import type { IncomingMessage } from 'http';

const logger = createLogger('VisualizationServer');

/**
 * 可视化服务器配置
 */
export interface VisualizationServerOptions {
  /** WebSocket 端口 */
  port?: number;
  /** 静态文件目录 */
  staticDir?: string;
  /** 是否启用 CORS */
  enableCors?: boolean;
}

/**
 * 客户端连接
 */
interface ClientConnection {
  /** WebSocket 实例 */
  ws: WebSocket;
  /** 订阅的工作流 ID 列表 */
  subscriptions: Set<string>;
  /** 连接时间 */
  connectedAt: number;
  /** 最后活动 */
  lastActivity: number;
}

/**
 * 可视化 WebSocket 服务器
 */
export class VisualizationServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ClientConnection> = new Map();
  private options: Required<VisualizationServerOptions>;
  private started = false;
  private workflowEventListener: ((event: WorkflowVisualizationEvent) => void) | null = null;

  constructor(options: VisualizationServerOptions = {}) {
    this.options = {
      port: options.port || 3456,
      staticDir: options.staticDir || './public',
      enableCors: options.enableCors ?? true,
    };
  }

  /**
   * 启动服务器
   */
  start(): void {
    if (this.started) {
      logger.warn('VisualizationServer already started');
      return;
    }

    try {
      this.wss = new WebSocketServer({ port: this.options.port });

      // 监听连接
      this.wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
        const clientId = this.generateClientId();
        this.clients.set(clientId, {
          ws,
          subscriptions: new Set(),
          connectedAt: Date.now(),
          lastActivity: Date.now(),
        });

        logger.info(`Client connected: ${clientId}`, { totalClients: this.clients.size });

        // 发送欢迎消息
        this.sendToClient(clientId, {
          type: 'connected',
          payload: { clientId, message: 'Connected to VisualizationServer' },
        });

        // 处理消息
        ws.on('message', (data: Buffer) => {
          this.handleMessage(clientId, data.toString());
        });

        // 处理关闭
        ws.on('close', () => {
          this.clients.delete(clientId);
          logger.info(`Client disconnected: ${clientId}`, { totalClients: this.clients.size });
        });

        // 处理错误
        ws.on('error', (error: Error) => {
          logger.error(`WebSocket error for client ${clientId}: ${error.message}`);
          this.clients.delete(clientId);
        });
      });

      // 监听工作流事件
      this.workflowEventListener = (event: WorkflowVisualizationEvent) => {
        this.broadcastEvent(event);
      };
      workflowObserver.on('event', this.workflowEventListener);

      this.started = true;
      logger.info(`VisualizationServer started on port ${this.options.port}`);
    } catch (error) {
      logger.error(`Failed to start VisualizationServer: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * 停止服务器
   */
  stop(): void {
    if (!this.started || !this.wss) {
      return;
    }

    // 移除工作流事件监听器
    if (this.workflowEventListener) {
      workflowObserver.off('event', this.workflowEventListener);
      this.workflowEventListener = null;
    }

    // 先关闭所有 WebSocket 连接，再清空 Map
    for (const conn of this.clients.values()) {
      conn.ws.close();
    }

    // 清空客户端映射
    this.clients.clear();

    // 关闭服务器
    this.wss.close();
    this.wss = null;
    this.started = false;

    logger.info('VisualizationServer stopped');
  }

  /**
   * 订阅工作流
   */
  subscribe(clientId: string, traceId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.subscriptions.add(traceId);
      client.lastActivity = Date.now();

      // 如果工作流正在执行，发送当前快照
      const snapshot = workflowObserver.getSnapshot(traceId);
      if (snapshot) {
        this.sendToClient(clientId, {
          type: 'snapshot',
          payload: snapshot,
        });
      }

      logger.debug(`Client ${clientId} subscribed to ${traceId}`);
    }
  }

  /**
   * 取消订阅
   */
  unsubscribe(clientId: string, traceId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.subscriptions.delete(traceId);
      client.lastActivity = Date.now();
      logger.debug(`Client ${clientId} unsubscribed from ${traceId}`);
    }
  }

  /**
   * 发送消息给指定客户端
   */
  private sendToClient(clientId: string, message: object): void {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  /**
   * 广播事件给所有订阅的客户端
   *
   * 广播规则：
   * - 如果事件没有 traceId（系统级事件），发送给所有已连接客户端
   * - 如果事件有 traceId：
   *   - 无订阅的客户端收不到（静默忽略）
   *   - 有订阅的客户端只有订阅了该 traceId 才能收到
   */
  private broadcastEvent(event: WorkflowVisualizationEvent): void {
    // 提取 traceId
    let traceId: string | undefined;
    if ('payload' in event && event.payload && typeof event.payload === 'object') {
      const payload = event.payload as Record<string, unknown>;
      traceId = payload.traceId as string | undefined;
    }

    for (const [, client] of this.clients) {
      if (client.ws.readyState !== WebSocket.OPEN) {
        continue;
      }

      // 如果事件没有 traceId，发送给所有已连接客户端
      if (!traceId) {
        client.ws.send(JSON.stringify(event));
        client.lastActivity = Date.now();
        continue;
      }

      // 如果事件有 traceId，只发给订阅了该 traceId 的客户端
      if (client.subscriptions.has(traceId)) {
        client.ws.send(JSON.stringify(event));
        client.lastActivity = Date.now();
      }
      // 没订阅的客户端忽略此事件
    }
  }

  /**
   * 处理客户端消息
   */
  private handleMessage(clientId: string, data: string): void {
    try {
      const message = JSON.parse(data);
      const client = this.clients.get(clientId);

      if (!client) return;
      client.lastActivity = Date.now();

      switch (message.type) {
        case 'subscribe':
          if (message.traceId) {
            this.subscribe(clientId, message.traceId);
          }
          break;

        case 'unsubscribe':
          if (message.traceId) {
            this.unsubscribe(clientId, message.traceId);
          }
          break;

        case 'get-snapshot':
          if (message.traceId) {
            const snapshot = workflowObserver.getSnapshot(message.traceId);
            if (snapshot) {
              this.sendToClient(clientId, { type: 'snapshot', payload: snapshot });
            }
          }
          break;

        case 'list-workflows': {
          const workflows = workflowObserver.getActiveConnections();
          this.sendToClient(clientId, {
            type: 'workflow-list',
            payload: { workflows },
          });
          break;
        }

        case 'ping':
          this.sendToClient(clientId, { type: 'pong', payload: { timestamp: Date.now() } });
          break;

        default:
          logger.warn(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      logger.error(`Failed to handle message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 生成客户端 ID
   */
  private generateClientId(): string {
    return `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 获取服务器状态
   */
  getStatus(): {
    started: boolean;
    port: number;
    clientCount: number;
    activeWorkflows: number;
  } {
    return {
      started: this.started,
      port: this.options.port,
      clientCount: this.clients.size,
      activeWorkflows: workflowObserver.getActiveConnections().length,
    };
  }

  /**
   * 获取所有客户端信息
   */
  getClients(): Array<{
    id: string;
    subscriptions: string[];
    connectedAt: number;
    lastActivity: number;
  }> {
    return Array.from(this.clients.entries()).map(([id, conn]) => ({
      id,
      subscriptions: Array.from(conn.subscriptions),
      connectedAt: conn.connectedAt,
      lastActivity: conn.lastActivity,
    }));
  }
}

// 导出单例（延迟初始化）
let visualizationServer: VisualizationServer | null = null;

export function getVisualizationServer(): VisualizationServer {
  if (!visualizationServer) {
    visualizationServer = new VisualizationServer();
  }
  return visualizationServer;
}

export function startVisualizationServer(options?: VisualizationServerOptions): VisualizationServer {
  const server = options ? new VisualizationServer(options) : getVisualizationServer();
  server.start();
  return server;
}

export function stopVisualizationServer(): void {
  if (visualizationServer) {
    visualizationServer.stop();
    visualizationServer = null;
  }
}

export default VisualizationServer;
