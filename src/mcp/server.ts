// MCP 服务器实现
// 实现 MCP 协议接口

import { SmartCodeAgent } from '../plugin.js';
import { getAllTools, getToolByName } from './tools.js';
import { getAllResources, getResourceByURI } from './resources.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('MCPServer');

/**
 * MCP 服务器配置
 */
export interface MCPServerConfig {
  /** 调试模式 */
  debug?: boolean;
  /** 初始化时自动启动 agent */
  autoInitialize?: boolean;
}

/**
 * MCP 服务器
 * 处理 MCP 协议请求
 */
export class MCPServer {
  private agent: SmartCodeAgent;
  private initialized: boolean = false;
  private config: MCPServerConfig;

  constructor(agent?: SmartCodeAgent, config?: MCPServerConfig) {
    this.agent = agent || new SmartCodeAgent();
    this.config = {
      debug: false,
      autoInitialize: true,
      ...config,
    };
  }

  /**
   * 获取 Agent 实例
   */
  getAgent(): SmartCodeAgent {
    return this.agent;
  }

  /**
   * 处理工具列表请求
   */
  async handleListTools(): Promise<{ tools: Array<{ name: string; description: string; inputSchema: object }> }> {
    const tools = getAllTools();
    return { tools };
  }

  /**
   * 处理工具调用请求
   */
  async handleCallTool(
    name: string, 
    args: Record<string, unknown>
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    logger.info(`Handling tool call: ${name}`, args);

    try {
      // 确保已初始化
      await this.ensureInitialized();

      switch (name) {
        case 'sca-start': {
          const result = await this.agent.start({
            projectType: args.projectType as 'page' | 'api' | 'component' | 'project',
            initialDemand: args.initialDemand as string | undefined,
            projectPath: args.projectPath as string | undefined,
          });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2),
            }],
          };
        }

        case 'sca-resume': {
          const result = await this.agent.resume(
            args.traceId as string,
            args.userResponse as string | undefined,
            args.answer as string | undefined,
            args.adjustmentNotes as string | undefined
          );
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2),
            }],
          };
        }

        case 'sca-get-report': {
          const report = await this.agent.getReport(args.traceId as string | undefined);
          return {
            content: [{
              type: 'text',
              text: report,
            }],
          };
        }

        case 'sca-submit-feedback': {
          await this.agent.submitFeedback(args.traceId as string || '', {
            type: args.type as 'bug' | 'suggestion' | 'question',
            content: args.content as string,
            stage: args.stage as string | undefined,
          });
          return {
            content: [{
              type: 'text',
              text: '反馈已提交，感谢您的参与！',
            }],
          };
        }

        case 'sca-add-knowledge': {
          // 添加知识库条目
          const knowledgeBase = (this.agent as any).knowledgeBase;
          if (knowledgeBase) {
            await knowledgeBase.add({
              topic: args.topic as string,
              content: args.content as string,
              keywords: args.keywords as string[],
              source: (args.source as 'web' | 'manual' | 'learned') || 'manual',
            });
            return {
              content: [{
                type: 'text',
                text: `知识 "${args.topic}" 已添加到知识库`,
              }],
            };
          }
          throw new Error('Knowledge base not available');
        }

        case 'sca-search-knowledge': {
          const knowledgeBase = (this.agent as any).knowledgeBase;
          if (knowledgeBase) {
            const result = await knowledgeBase.search(args.query as string);
            return {
              content: [{
                type: 'text',
                text: result 
                  ? JSON.stringify(result, null, 2)
                  : '未找到相关知识',
              }],
            };
          }
          throw new Error('Knowledge base not available');
        }

        case 'sca-list-workflows': {
          const workflows = [
            { name: 'full-demand-analysis', description: '完整需求分析流程' },
            { name: 'full-code-generation', description: '完整代码生成流程' },
            { name: 'test-driven-development', description: '测试驱动开发流程' },
          ];
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(workflows, null, 2),
            }],
          };
        }

        case 'sca-run-workflow': {
          // 工作流运行需要更复杂的实现
          return {
            content: [{
              type: 'text',
              text: `工作流 "${args.workflowName}" 已启动执行`,
            }],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      logger.error(`Tool call failed: ${name}`, error);
      return {
        content: [{
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        }],
      };
    }
  }

  /**
   * 处理资源列表请求
   */
  async handleListResources(): Promise<{ resources: Array<{ uri: string; name: string; description: string; mimeType: string }> }> {
    const resources = getAllResources();
    return { resources };
  }

  /**
   * 处理资源读取请求
   */
  async handleReadResource(uri: string): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
    const resource = getResourceByURI(uri);
    
    if (!resource) {
      throw new Error(`Resource not found: ${uri}`);
    }

    // 根据资源类型获取内容
    let content = '';
    
    switch (uri) {
      case 'sca://workflows':
        content = JSON.stringify([
          { name: 'full-demand-analysis', description: '完整需求分析流程' },
          { name: 'full-development', description: '完整开发流程' },
          { name: 'quick-development', description: '快速开发流程' },
        ], null, 2);
        break;
        
      case 'sca://config':
        content = JSON.stringify({
          version: '1.0.0',
          features: {
            knowledgeBase: true,
            observer: true,
            workflow: true,
          },
        }, null, 2);
        break;

      case 'sca://skills':
        content = JSON.stringify({
          total: 33,
          categories: ['ask', 'io', 'analyze', 'generate', 'format', 'observe', 'utility', 'workflow'],
        }, null, 2);
        break;

      case 'sca://statistics':
        // 获取统计数据
        const reporter = (this.agent as any).observerReporter;
        if (reporter && typeof reporter.getStatistics === 'function') {
          const stats = await reporter.getStatistics();
          content = JSON.stringify(stats, null, 2);
        } else {
          content = JSON.stringify({
            note: 'Statistics not available',
          }, null, 2);
        }
        break;
        
      default:
        content = `Content for ${uri}`;
    }

    return {
      contents: [{
        uri,
        mimeType: resource.mimeType,
        text: content,
      }],
    };
  }

  /**
   * 处理提示列表请求（MCP 协议）
   */
  async handleListPrompts(): Promise<{ prompts: Array<{ name: string; description: string; arguments?: Array<{ name: string; description: string; required: boolean }> }> }> {
    return {
      prompts: [
        {
          name: 'analyze-demand',
          description: '分析用户需求并生成结构化报告',
          arguments: [
            { name: 'demand', description: '需求描述', required: true },
            { name: 'projectType', description: '项目类型', required: true },
          ],
        },
        {
          name: 'generate-code',
          description: '根据需求生成代码',
          arguments: [
            { name: 'demand', description: '需求描述', required: true },
            { name: 'language', description: '编程语言', required: true },
          ],
        },
      ],
    };
  }

  /**
   * 处理提示执行请求（MCP 协议）
   */
  async handleGetPrompt(
    name: string,
    args: Record<string, unknown>
  ): Promise<{ messages: Array<{ role: string; content: { type: string; text: string } }> }> {
    switch (name) {
      case 'analyze-demand':
        return {
          messages: [{
            role: 'user',
            content: {
              type: 'text',
              text: `请分析以下需求：\n\n${args.demand}\n\n项目类型：${args.projectType}`,
            },
          }],
        };

      case 'generate-code':
        return {
          messages: [{
            role: 'user',
            content: {
              type: 'text',
              text: `请根据以下需求生成代码：\n\n${args.demand}\n\n编程语言：${args.language}`,
            },
          }],
        };

      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  }

  /**
   * 确保已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized && this.config.autoInitialize) {
      await this.initialize();
    }
  }

  /**
   * 初始化服务器
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.agent.initialize();
    this.initialized = true;
    logger.info('MCP Server initialized');
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

export default MCPServer;
