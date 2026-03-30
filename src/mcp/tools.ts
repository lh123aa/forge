// MCP 工具定义
// 定义 Smart Code Agent 可用的 MCP 工具

import type { Tool } from '../types/index.js';

/**
 * Smart Code Agent MCP 工具列表
 */
export const tools: Tool[] = [
  {
    name: 'sca-start',
    description: '启动 Smart Code Agent 开发流程，从需求采集开始',
    inputSchema: {
      type: 'object',
      properties: {
        projectType: {
          type: 'string',
          enum: ['page', 'api', 'component', 'project'],
          description: '项目类型：页面开发、接口开发、组件封装、项目初始化',
        },
        initialDemand: {
          type: 'string',
          description: '初始需求描述（可选）',
        },
        projectPath: {
          type: 'string',
          description: '项目路径（可选）',
        },
      },
      required: ['projectType'],
    },
  },
  {
    name: 'sca-resume',
    description: '恢复之前中断的开发流程，可传递用户响应（如确认/调整/跳过等）',
    inputSchema: {
      type: 'object',
      properties: {
        traceId: {
          type: 'string',
          description: '之前运行的追踪 ID',
        },
        userResponse: {
          type: 'string',
          enum: ['confirm', 'adjust', 'reclarify', 'confirm-start', 'skip'],
          description: '通用用户响应：confirm=确认通过, adjust=需要调整, reclarify=重新澄清, confirm-start=开始执行, skip=跳过',
        },
        answer: {
          type: 'string',
          description: '答案/确认词（用于测试确认等场景，如：开始测试、调整计划、跳过测试）',
        },
        adjustmentNotes: {
          type: 'string',
          description: '调整说明（当需要调整时需要）',
        },
      },
      required: ['traceId'],
    },
  },
  {
    name: 'sca-get-report',
    description: '获取指定运行的观察者报告',
    inputSchema: {
      type: 'object',
      properties: {
        traceId: {
          type: 'string',
          description: '追踪 ID（可选，不提供则返回最近运行的报告）',
        },
      },
    },
  },
  {
    name: 'sca-submit-feedback',
    description: '提交用户反馈，用于产品改进',
    inputSchema: {
      type: 'object',
      properties: {
        traceId: {
          type: 'string',
          description: '关联的追踪 ID',
        },
        type: {
          type: 'string',
          enum: ['bug', 'suggestion', 'question'],
          description: '反馈类型',
        },
        content: {
          type: 'string',
          description: '反馈内容',
        },
        stage: {
          type: 'string',
          enum: ['demand', 'code', 'test', 'delivery'],
          description: '关联阶段',
        },
      },
      required: ['type', 'content'],
    },
  },
  {
    name: 'sca-add-knowledge',
    description: '添加知识到本地知识库',
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: '知识主题',
        },
        content: {
          type: 'string',
          description: '知识内容',
        },
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: '关键词标签',
        },
        source: {
          type: 'string',
          enum: ['web', 'manual', 'learned'],
          default: 'manual',
          description: '知识来源',
        },
      },
      required: ['topic', 'content'],
    },
  },
  {
    name: 'sca-search-knowledge',
    description: '搜索本地知识库',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'sca-list-workflows',
    description: '列出所有可用的工作流',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'sca-run-workflow',
    description: '执行指定的工作流',
    inputSchema: {
      type: 'object',
      properties: {
        workflowName: {
          type: 'string',
          description: '工作流名称',
        },
        params: {
          type: 'object',
          description: '工作流参数',
        },
      },
      required: ['workflowName'],
    },
  },
  // ==================== Forge 工具 ====================
  {
    name: 'forge-route',
    description: '根据上下文自动路由到合适的技能，返回技能来源和名称',
    inputSchema: {
      type: 'object',
      properties: {
        phase: {
          type: 'string',
          enum: ['demand', 'architecture', 'implement', 'review', 'qa', 'ship'],
          description: '当前工作流阶段',
        },
        originalInput: {
          type: 'string',
          description: '原始用户输入（用于推断 domain 和 complexity）',
        },
        techStack: {
          type: 'string',
          description: '技术栈（如 react, vue, angular 等）',
        },
        domain: {
          type: 'string',
          enum: ['frontend', 'backend', 'mobile', 'fullstack', 'document', 'media', 'unknown'],
          description: '技术领域',
        },
        complexity: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: '复杂度等级',
        },
        hasBrowser: {
          type: 'boolean',
          description: '是否需要浏览器功能',
        },
      },
      required: ['phase'],
    },
  },
  {
    name: 'forge-list-skills',
    description: '列出所有可用的 Forge 技能（AIOS + gstack + MiniMax）',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          enum: ['aios', 'gstack', 'minimax', 'all'],
          description: '技能来源筛选',
        },
      },
    },
  },
  {
    name: 'forge-invoke-skill',
    description: '手动调用指定来源的技能',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          enum: ['aios', 'gstack', 'minimax'],
          description: '技能来源',
        },
        skill: {
          type: 'string',
          description: '技能名称',
        },
        args: {
          type: 'object',
          description: '技能参数',
        },
      },
      required: ['source', 'skill'],
    },
  },
  {
    name: 'forge-list-workflows',
    description: '列出所有可用的 Forge 工作流',
    inputSchema: {
      type: 'object',
      properties: {
        phase: {
          type: 'string',
          enum: ['demand', 'architecture', 'implement', 'review', 'qa', 'ship'],
          description: '按阶段筛选工作流',
        },
      },
    },
  },
  {
    name: 'forge-self-iterate',
    description: '触发 Forge 自我迭代分析，分析近期执行日志，生成优化建议（可选：生成新 Skill / 进化工作流）',
    inputSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['manual', 'auto', 'scheduled'],
          default: 'manual',
          description: '触发模式：manual=手动触发, auto=自动优化, scheduled=定时任务',
        },
        includeL3: {
          type: 'boolean',
          default: false,
          description: '是否包含 L3 能力扩展（生成新 Skill）',
        },
        includeL4: {
          type: 'boolean',
          default: false,
          description: '是否包含 L4 工作流进化（优化工作流）',
        },
      },
    },
  },
];

/**
 * 获取所有工具定义
 */
export function getAllTools(): Tool[] {
  return tools;
}

/**
 * 根据名称获取工具定义
 */
export function getToolByName(name: string): Tool | undefined {
  return tools.find(t => t.name === name);
}

export default tools;
