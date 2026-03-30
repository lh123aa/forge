// LLM 桥接器 - 请求宿主 LLM 能力
// 通过 MCP sampling 协议请求宿主进行 LLM 推理

import { createLogger } from '../utils/logger.js';

const logger = createLogger('LLMBridge');

/**
 * LLM 桥接器配置
 */
export interface LLMBridgeConfig {
  /** 是否启用调试日志 */
  debug?: boolean;
  /** 降级模式：当宿主不支持 sampling 时的行为 */
  fallbackMode?: 'error' | 'mock' | 'template';
}

/**
 * MCP Sampling 参数（符合 MCP 协议规范）
 */
export interface SamplingParams {
  /** 消息列表 */
  messages: Array<{
    role: 'user' | 'assistant';
    content: string | { type: string; text: string };
  }>;
  /** 系统提示 */
  systemPrompt?: string;
  /** 最大 tokens */
  maxTokens?: number;
  /** 温度 */
  temperature?: number;
  /** 停止词 */
  stopSequences?: string[];
}

/**
 * MCP Sampling 响应
 */
export interface SamplingResponse {
  /** 角色 */
  role: 'assistant';
  /** 内容 */
  content: string | { type: string; text: string };
  /** 模型信息 */
  model?: string;
  /** 停止原因 */
  stopReason?: string;
}

/**
 * MCP 客户端接口
 * 宿主需要实现此接口，特别是 sampling 能力
 */
export interface MCPClient {
  /** 调用工具 */
  call?(tool: string, params?: Record<string, unknown>): Promise<unknown>;
  /** 列出工具 */
  listTools?(): Promise<Array<{ name: string; description: string }>>;
  
  /**
   * MCP sampling 能力
   * 请求宿主 LLM 进行推理
   * 这是 MCP 协议的标准能力
   */
  sampling?(params: SamplingParams): Promise<SamplingResponse>;
  
  /**
   * 检查是否支持 sampling
   */
  capabilities?: {
    sampling?: boolean;
  };
}

/**
 * LLM 桥接器 - 通过 MCP sampling 请求宿主 LLM 能力
 * 
 * 设计原则：
 * 1. 不独立接入 LLM 服务，依赖宿主能力
 * 2. 通过 MCP sampling 协议请求推理
 * 3. 宿主不支持时提供降级方案
 */
export class LLMBridge {
  private config: LLMBridgeConfig;
  private mcpClient: MCPClient | null = null;

  constructor(config?: LLMBridgeConfig) {
    this.config = {
      debug: false,
      fallbackMode: 'error',
      ...config,
    };
  }

  /**
   * 设置 MCP 客户端（由宿主注入）
   */
  setMCPClient(client: MCPClient): void {
    this.mcpClient = client;
    logger.info('MCP client configured', { 
      hasSampling: this.supportsSampling() 
    });
  }

  /**
   * 检查宿主是否支持 sampling
   */
  supportsSampling(): boolean {
    if (!this.mcpClient) return false;
    if (typeof this.mcpClient.sampling !== 'function') return false;
    if (this.mcpClient.capabilities?.sampling === false) return false;
    return true;
  }

  /**
   * 检查是否可用
   */
  isAvailable(): boolean {
    return this.supportsSampling();
  }

  /**
   * 核心方法：请求宿主 LLM 推理
   */
  async requestSampling(params: SamplingParams): Promise<SamplingResponse> {
    if (!this.supportsSampling()) {
      return this.handleUnsupportedSampling(params);
    }

    if (this.config.debug) {
      logger.debug('Requesting sampling from host', { 
        messageCount: params.messages.length,
        maxTokens: params.maxTokens 
      });
    }

    try {
      const response = await this.mcpClient!.sampling!(params);
      
      if (this.config.debug) {
        const content = typeof response.content === 'string' 
          ? response.content 
          : response.content.text;
        logger.debug('Sampling response received', { 
          contentLength: content.length 
        });
      }

      return response;
    } catch (error) {
      logger.error('Sampling request failed', { error });
      throw new Error(`Sampling request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 简化的文本补全接口
   */
  async complete(prompt: string, systemPrompt?: string): Promise<string> {
    const response = await this.requestSampling({
      messages: [{ role: 'user', content: prompt }],
      systemPrompt,
      maxTokens: 4096,
    });

    return this.extractContent(response);
  }

  /**
   * 对话接口
   */
  async chat(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    systemPrompt?: string
  ): Promise<string> {
    const response = await this.requestSampling({
      messages,
      systemPrompt,
      maxTokens: 4096,
    });

    return this.extractContent(response);
  }

  /**
   * 结构化输出 - 返回 JSON 对象
   */
  async structuredOutput<T = Record<string, unknown>>(
    prompt: string,
    schema?: Record<string, unknown>,
    systemPrompt?: string
  ): Promise<T> {
    const fullPrompt = `${prompt}

${schema ? `\n输出必须符合以下 JSON Schema:\n${JSON.stringify(schema, null, 2)}` : ''}

重要：只返回 JSON 对象，不要包含任何其他文字、解释或 markdown 代码块标记。`;

    const response = await this.complete(fullPrompt, systemPrompt);
    
    // 清理可能的 markdown 代码块标记
    let content = response.trim();
    if (content.startsWith('```json')) {
      content = content.slice(7);
    } else if (content.startsWith('```')) {
      content = content.slice(3);
    }
    if (content.endsWith('```')) {
      content = content.slice(0, -3);
    }
    content = content.trim();

    try {
      return JSON.parse(content) as T;
    } catch (error) {
      throw new Error(`Failed to parse structured output: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 需求分析 - 返回结构化分析结果
   * 注意：这个方法返回的是"让宿主分析后需要的数据格式"
   */
  async analyzeDemand(demand: string, projectType: string): Promise<DemandAnalysisResult> {
    const systemPrompt = `你是一个专业的需求分析师。请分析用户需求并返回结构化的分析结果。`;
    
    const prompt = `分析以下需求：

项目类型: ${projectType}
用户需求: ${demand}

请返回 JSON 格式的分析结果。`;

    return this.structuredOutput<DemandAnalysisResult>(prompt, undefined, systemPrompt);
  }

  /**
   * 代码生成提示 - 返回"让宿主生成代码"所需的提示
   * 注意：这个方法不生成代码，而是准备让宿主 LLM 生成的提示
   */
  buildCodeGenerationPrompt(params: CodeGenerationParams): string {
    const { demand, type, language, framework, template, existingCode } = params;

    const prompt = `请根据以下需求生成代码。

需求描述: ${demand}
代码类型: ${type}
编程语言: ${language}
${framework ? `框架: ${framework}` : ''}
${template ? `参考模板: ${template}` : ''}
${existingCode ? `已有代码:\n${existingCode}` : ''}

要求:
1. 代码完整可运行
2. 包含必要的类型定义（如适用）
3. 包含必要的注释
4. 遵循最佳实践和代码规范`;

    return prompt;
  }

  /**
   * 提取响应内容
   */
  private extractContent(response: SamplingResponse): string {
    if (typeof response.content === 'string') {
      return response.content;
    }
    if (response.content.type === 'text') {
      return response.content.text;
    }
    throw new Error(`Unsupported content type: ${response.content.type}`);
  }

  /**
   * 处理宿主不支持 sampling 的情况
   */
  private async handleUnsupportedSampling(params: SamplingParams): Promise<SamplingResponse> {
    const mode = this.config.fallbackMode;

    logger.warn('Host does not support sampling', { fallbackMode: mode });

    switch (mode) {
      case 'error':
        throw new Error('Host does not support sampling. Please ensure the host MCP client supports sampling capability.');

      case 'mock':
        return {
          role: 'assistant',
          content: JSON.stringify({
            note: 'Mock response - host does not support sampling',
            originalPrompt: params.messages[0]?.content,
          }),
        };

      case 'template':
        // 返回提示，让调用方知道需要宿主处理
        return {
          role: 'assistant',
          content: `[REQUIRES_HOST_LLM] This operation requires host LLM support. Prompt: ${JSON.stringify(params.messages)}`,
        };

      default:
        throw new Error('Host does not support sampling');
    }
  }
}

/**
 * 需求分析结果
 */
export interface DemandAnalysisResult {
  background: string;
  coreTarget: string;
  targetUser: string;
  coreFunctions: Array<{ name: string; description: string }>;
  technicalRequirements: {
    techStack: string;
    language: string;
    uiLibrary?: string;
    runtimeEnv?: string;
  };
  acceptanceCriteria: string[];
  risks: Array<{ level: string; description: string; suggestion: string }>;
}

/**
 * 代码生成参数
 */
export interface CodeGenerationParams {
  demand: string;
  type: string;
  language: string;
  framework?: string;
  template?: string;
  existingCode?: string;
}

export default LLMBridge;