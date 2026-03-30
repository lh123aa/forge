#!/usr/bin/env node

/**
 * MCP Stdio Server 入口
 * 用于 OpenCode/Claude 等 MCP 客户端
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import SmartCodeAgent from '../plugin.js';
import { createLogger } from '../utils/logger.js';
import { checkUpdate, doUpdate, getCurrentVersion } from '../utils/updater.js';

const logger = createLogger('MCPServer');

// 创建 Agent 实例
const agent = new SmartCodeAgent();

// 创建 MCP 服务器
const server = new McpServer({
  name: 'smart-code-agent',
  version: getCurrentVersion(),
});

// 注册工具
server.tool(
  'sca-start',
  '启动 Smart Code Agent 开发流程，从需求采集开始',
  {
    projectType: z
      .enum(['page', 'api', 'component', 'project'])
      .describe('项目类型：页面(page)、接口(api)、组件(component)、项目(project)'),
    initialDemand: z.string().optional().describe('初始需求描述'),
    projectPath: z.string().optional().describe('项目路径'),
  },
  async (args) => {
    await agent.initialize();
    const result = await agent.start({
      projectType: args.projectType,
      initialDemand: args.initialDemand,
      projectPath: args.projectPath,
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  'sca-resume',
  '恢复中断的开发流程',
  {
    traceId: z.string().describe('之前运行的追踪 ID'),
  },
  async (args) => {
    await agent.initialize();
    const result = await agent.resume(args.traceId);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  'sca-get-report',
  '获取指定运行的观察者报告',
  {
    traceId: z.string().optional().describe('追踪 ID（可选，不提供则返回最近运行的报告）'),
  },
  async (args) => {
    await agent.initialize();
    const report = await agent.getReport(args.traceId);
    return {
      content: [{ type: 'text', text: report }],
    };
  }
);

server.tool(
  'sca-submit-feedback',
  '提交用户反馈，用于产品改进',
  {
    type: z.enum(['bug', 'suggestion', 'question']).describe('反馈类型'),
    content: z.string().describe('反馈内容'),
    stage: z.enum(['demand', 'code', 'test', 'delivery']).optional().describe('关联阶段'),
    traceId: z.string().optional().describe('关联的追踪 ID'),
  },
  async (args) => {
    await agent.initialize();
    await agent.submitFeedback(args.traceId || '', {
      type: args.type,
      content: args.content,
      stage: args.stage,
    });
    return {
      content: [{ type: 'text', text: '反馈已提交，感谢您的参与！' }],
    };
  }
);

server.tool(
  'sca-add-knowledge',
  '添加知识到本地知识库',
  {
    topic: z.string().describe('知识主题'),
    content: z.string().describe('知识内容'),
    keywords: z.array(z.string()).optional().describe('关键词标签'),
    source: z.enum(['web', 'manual', 'learned']).optional().default('manual').describe('知识来源'),
  },
  async (args) => {
    await agent.initialize();
    const knowledgeBase = (agent as any).knowledgeBase;
    if (knowledgeBase) {
      await knowledgeBase.add({
        topic: args.topic,
        content: args.content,
        keywords: args.keywords,
        source: args.source || 'manual',
      });
      return {
        content: [{ type: 'text', text: `知识 "${args.topic}" 已添加到知识库` }],
      };
    }
    throw new Error('Knowledge base not available');
  }
);

server.tool(
  'sca-search-knowledge',
  '搜索本地知识库',
  {
    query: z.string().describe('搜索关键词'),
  },
  async (args) => {
    await agent.initialize();
    const knowledgeBase = (agent as any).knowledgeBase;
    if (knowledgeBase) {
      const result = await knowledgeBase.search(args.query);
      return {
        content: [
          { type: 'text', text: result ? JSON.stringify(result, null, 2) : '未找到相关知识' },
        ],
      };
    }
    throw new Error('Knowledge base not available');
  }
);

server.tool('sca-list-workflows', '列出所有可用的工作流', {}, async () => {
  const workflows = [
    { name: 'full-demand-analysis', description: '完整需求分析流程' },
    { name: 'full-code-generation', description: '完整代码生成流程' },
    { name: 'test-driven-development', description: '测试驱动开发流程' },
  ];
  return {
    content: [{ type: 'text', text: JSON.stringify(workflows, null, 2) }],
  };
});

server.tool(
  'sca-run-workflow',
  '执行指定的工作流',
  {
    workflowName: z.string().describe('工作流名称'),
    params: z.record(z.string(), z.any()).optional().describe('工作流参数'),
  },
  async (args) => {
    return {
      content: [{ type: 'text', text: `工作流 "${args.workflowName}" 已启动执行` }],
    };
  }
);

// ==================== Forge 工具 ====================

// 延迟加载 Forge 模块（避免循环依赖）
let forgeRouter: any = null;
let forgeLoader: any = null;
let forgeBridge: any = null;

async function getForgeModules() {
  if (!forgeRouter) {
    const core = await import('../core/index.js');
    forgeRouter = core.getSkillRouter();
    forgeLoader = core.getExternalSkillLoader();
    forgeBridge = core.getWorkflowBridge();
  }
  return { router: forgeRouter, loader: forgeLoader, bridge: forgeBridge };
}

server.tool(
  'forge-route',
  '根据上下文自动路由到合适的技能',
  {
    phase: z.enum(['demand', 'architecture', 'implement', 'review', 'qa', 'ship']).describe('当前工作流阶段'),
    originalInput: z.string().optional().describe('原始用户输入'),
    techStack: z.string().optional().describe('技术栈'),
    domain: z.enum(['frontend', 'backend', 'mobile', 'fullstack', 'document', 'media', 'unknown']).optional().describe('技术领域'),
    complexity: z.enum(['low', 'medium', 'high']).optional().describe('复杂度等级'),
    hasBrowser: z.boolean().optional().describe('是否需要浏览器功能'),
  },
  async (args) => {
    const { router } = await getForgeModules();
    const result = router.route({
      phase: args.phase,
      originalInput: args.originalInput,
      techStack: args.techStack,
      domain: args.domain,
      complexity: args.complexity,
      hasBrowser: args.hasBrowser,
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  'forge-list-skills',
  '列出所有可用的 Forge 技能',
  {
    source: z.enum(['aios', 'gstack', 'minimax', 'all']).optional().default('all').describe('技能来源筛选'),
  },
  async (args) => {
    const { loader } = await getForgeModules();
    const allSkills = await loader.listAvailableSkills();

    let result: any;
    if (args.source === 'all' || !args.source) {
      result = {
        aios: ['demand-collect', 'demand-analysis', 'demand-confirm', 'task-decompose', 'task-plan', 'generate-code', 'code-review', 'test-orchestrator'],
        gstack: allSkills.gstack,
        minimax: allSkills.minimax,
      };
    } else if (args.source === 'aios') {
      result = {
        source: 'aios',
        skills: ['demand-collect', 'demand-analysis', 'demand-confirm', 'task-decompose', 'task-plan', 'generate-code', 'code-review', 'test-orchestrator'],
      };
    } else if (args.source === 'gstack') {
      result = { source: 'gstack', skills: allSkills.gstack };
    } else if (args.source === 'minimax') {
      result = { source: 'minimax', skills: allSkills.minimax };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  'forge-invoke-skill',
  '手动调用指定来源的技能',
  {
    source: z.enum(['aios', 'gstack', 'minimax']).describe('技能来源'),
    skill: z.string().describe('技能名称'),
    args: z.record(z.string(), z.any()).optional().describe('技能参数'),
  },
  async (args) => {
    const { loader } = await getForgeModules();
    const { SkillSource } = await import('../core/types.js');

    const sourceMap: Record<string, any> = {
      aios: SkillSource.AIOS,
      gstack: SkillSource.GSTACK,
      minimax: SkillSource.MINIMAX,
    };

    const source = sourceMap[args.source];
    if (!source) {
      throw new Error(`Unknown source: ${args.source}`);
    }

    const content = await loader.getSkillContent(source, args.skill);
    return {
      content: [{ type: 'text', text: content }],
    };
  }
);

server.tool(
  'forge-list-workflows',
  '列出所有可用的 Forge 工作流',
  {
    phase: z.enum(['demand', 'architecture', 'implement', 'review', 'qa', 'ship']).optional().describe('按阶段筛选'),
  },
  async (args) => {
    const { bridge } = await getForgeModules();
    let workflows = bridge.listWorkflows();

    if (args.phase) {
      workflows = workflows.filter((w: any) => w.type === args.phase);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            workflows.map((w: any) => ({
              name: w.name,
              description: w.description,
              type: w.type,
              skills: w.skills.map((s: any) => `${s.source}:${s.name}`),
            })),
            null,
            2
          ),
        },
      ],
    };
  }
);

server.tool(
  'forge-self-iterate',
  '触发 Forge 自我迭代分析',
  {
    mode: z.enum(['manual', 'auto', 'scheduled']).optional().default('manual').describe('触发模式'),
    includeL3: z.boolean().optional().default(false).describe('是否包含 L3 能力扩展'),
    includeL4: z.boolean().optional().default(false).describe('是否包含 L4 工作流进化'),
  },
  async (args) => {
    const { SelfIterationEngine } = await import('../core/self-iteration/index.js');
    const engine = new SelfIterationEngine();
    
    const result = await engine.optimize(args.mode || 'manual');
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: result.success,
              message: result.success
                ? `自我迭代完成，生成 ${result.optimizations.length} 条优化建议`
                : `自我迭代完成，但有 ${result.errors.length} 个错误`,
              optimizations: result.optimizations.map(o => ({
                id: o.id,
                type: o.type,
                priority: o.priority,
                description: o.description,
                expectedImprovement: o.expectedImprovement,
              })),
              stats: {
                totalIterations: engine.getStatus().totalIterations,
                pendingSuggestions: engine.getStatus().pendingSuggestions,
                appliedSuggestions: engine.getStatus().appliedSuggestions,
                generatedSkills: engine.getStatus().generatedSkills,
                evolvedWorkflows: engine.getStatus().evolvedWorkflows,
              },
              errors: result.errors,
              duration: result.duration,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// 更新检测工具
server.tool('sca-check-update', '检测是否有新版本可用', {}, async () => {
  const result = await checkUpdate();
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
});

// 执行更新工具
server.tool(
  'sca-do-update',
  '执行自动更新，拉取最新代码并重新构建',
  {
    force: z.boolean().optional().default(false).describe('强制更新，即使已是最新版本'),
  },
  async (args) => {
    // 先检查更新
    const checkResult = await checkUpdate();

    if (!checkResult.hasUpdate && !args.force) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: '已是最新版本',
                currentVersion: checkResult.currentVersion,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // 执行更新
    const result = await doUpdate();
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }
);

// 注册资源
server.resource(
  'knowledge-base',
  'sca://knowledge',
  { mimeType: 'application/json', description: '本地知识库，包含已学习的知识条目' },
  async () => ({
    contents: [
      {
        uri: 'sca://knowledge',
        mimeType: 'application/json',
        text: JSON.stringify({ note: 'Knowledge base resources' }),
      },
    ],
  })
);

server.resource(
  'run-history',
  'sca://runs',
  { mimeType: 'application/json', description: '运行历史记录' },
  async () => ({
    contents: [
      { uri: 'sca://runs', mimeType: 'application/json', text: JSON.stringify({ runs: [] }) },
    ],
  })
);

server.resource(
  'workflows',
  'sca://workflows',
  { mimeType: 'application/json', description: '所有可用的工作流定义' },
  async () => ({
    contents: [
      {
        uri: 'sca://workflows',
        mimeType: 'application/json',
        text: JSON.stringify([
          { name: 'full-demand-analysis', description: '完整需求分析流程' },
          { name: 'full-development', description: '完整开发流程' },
          { name: 'quick-development', description: '快速开发流程' },
        ]),
      },
    ],
  })
);

server.resource(
  'agent-config',
  'sca://config',
  { mimeType: 'application/json', description: 'Smart Code Agent 当前配置' },
  async () => ({
    contents: [
      {
        uri: 'sca://config',
        mimeType: 'application/json',
        text: JSON.stringify({
          version: getCurrentVersion(),
          features: { knowledgeBase: true, observer: true, workflow: true },
        }),
      },
    ],
  })
);

server.resource(
  'skills',
  'sca://skills',
  { mimeType: 'application/json', description: '所有可用的 Skill 列表及状态' },
  async () => ({
    contents: [
      {
        uri: 'sca://skills',
        mimeType: 'application/json',
        text: JSON.stringify({
          total: 33,
          categories: [
            'ask',
            'io',
            'analyze',
            'generate',
            'format',
            'observe',
            'utility',
            'workflow',
          ],
        }),
      },
    ],
  })
);

server.resource(
  'statistics',
  'sca://statistics',
  { mimeType: 'application/json', description: '运行统计数据' },
  async () => ({
    contents: [
      {
        uri: 'sca://statistics',
        mimeType: 'application/json',
        text: JSON.stringify({ note: 'Statistics' }),
      },
    ],
  })
);

// 启动服务器
async function main() {
  logger.info('Starting MCP Server...');
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('MCP Server started on stdio');
}

main().catch((error) => {
  logger.error('MCP Server failed:', error);
  process.exit(1);
});
