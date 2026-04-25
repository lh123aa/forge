// 路由规则配置
// 定义所有路由规则，按优先级排序

import { SkillSource, type RoutingContext, type RoutingRule, type RoutingResult } from './types.js';

/**
 * 默认路由上下文
 */
export function createDefaultContext(phase: RoutingContext['phase']): RoutingContext {
  return {
    phase,
    domain: 'unknown',
    complexity: 'medium',
    hasBrowser: false,
    hasExplicitTechStack: false,
  };
}

/**
 * 路由规则列表（按优先级从低到高排序）
 * 匹配时从上到下匹配，第一个满足条件的生效
 */
export const routingRules: RoutingRule[] = [
  // ==================== demand 阶段 ====================
  {
    phase: 'demand',
    priority: 10,
    condition: (ctx) => ctx.complexity === 'high',
    result: {
      source: SkillSource.GSTACK,
      skill: 'office-hours',
      invokeType: 'llm',
    },
  },
  {
    phase: 'demand',
    priority: 5,
    condition: () => true,
    result: {
      source: SkillSource.AIOS,
      skill: 'demand-collect',
      invokeType: 'direct',
    },
  },

  // ==================== architecture 阶段 ====================
  {
    phase: 'architecture',
    priority: 100,
    condition: () => true,
    result: {
      source: SkillSource.GSTACK,
      skill: 'plan-eng-review',
      invokeType: 'llm',
    },
  },

  // ==================== implement 阶段 ====================
  {
    phase: 'implement',
    priority: 50,
    condition: (ctx) => ctx.domain === 'frontend' || ctx.domain === 'fullstack',
    result: {
      source: SkillSource.MINIMAX,
      skill: 'frontend-dev',
      invokeType: 'llm',
    },
  },
  {
    phase: 'implement',
    priority: 50,
    condition: (ctx) => ctx.domain === 'backend' || ctx.domain === 'fullstack',
    result: {
      source: SkillSource.MINIMAX,
      skill: 'fullstack-dev',
      invokeType: 'llm',
    },
  },
  {
    phase: 'implement',
    priority: 45,
    condition: (ctx) => ctx.domain === 'mobile' && (ctx.techStack?.toLowerCase().includes('android') ?? false),
    result: {
      source: SkillSource.MINIMAX,
      skill: 'android-native-dev',
      invokeType: 'llm',
    },
  },
  {
    phase: 'implement',
    priority: 45,
    condition: (ctx) => ctx.domain === 'mobile' && (
      (ctx.techStack?.toLowerCase().includes('ios') ?? false) ||
      (ctx.techStack?.toLowerCase().includes('swift') ?? false)
    ),
    result: {
      source: SkillSource.MINIMAX,
      skill: 'ios-application-dev',
      invokeType: 'llm',
    },
  },
  {
    phase: 'implement',
    priority: 40,
    condition: (ctx) => ctx.domain === 'mobile' && (
      ctx.techStack?.toLowerCase().includes('flutter') ?? false
    ),
    result: {
      source: SkillSource.MINIMAX,
      skill: 'flutter-dev',
      invokeType: 'llm',
    },
  },
  {
    phase: 'implement',
    priority: 40,
    condition: (ctx) => ctx.domain === 'mobile' && (
      (ctx.techStack?.toLowerCase().includes('react native') ?? false) ||
      (ctx.techStack?.toLowerCase().includes('react-native') ?? false)
    ),
    result: {
      source: SkillSource.MINIMAX,
      skill: 'react-native-dev',
      invokeType: 'llm',
    },
  },
  // 文档生成
  {
    phase: 'implement',
    priority: 35,
    condition: (ctx) => ctx.domain === 'document',
    result: {
      source: SkillSource.MINIMAX,
      skill: 'minimax-pdf',
      invokeType: 'llm',
    },
  },
  // 媒体处理
  {
    phase: 'implement',
    priority: 35,
    condition: (ctx) => ctx.domain === 'media',
    result: {
      source: SkillSource.MINIMAX,
      skill: 'minimax-multimodal-toolkit',
      invokeType: 'llm',
    },
  },
  // 默认实现
  {
    phase: 'implement',
    priority: 10,
    condition: () => true,
    result: {
      source: SkillSource.AIOS,
      skill: 'generate-code',
      invokeType: 'direct',
    },
  },

  // ==================== review 阶段 ====================
  {
    phase: 'review',
    priority: 50,
    condition: (ctx) => ctx.hasBrowser === true,
    result: {
      source: SkillSource.GSTACK,
      skill: 'review',
      invokeType: 'llm',
    },
  },
  {
    phase: 'review',
    priority: 40,
    condition: () => true,
    result: {
      source: SkillSource.GSTACK,
      skill: 'review',
      invokeType: 'llm',
    },
  },

  // ==================== qa 阶段 ====================
  {
    phase: 'qa',
    priority: 50,
    condition: (ctx) => ctx.hasBrowser === true,
    result: {
      source: SkillSource.GSTACK,
      skill: 'qa',
      invokeType: 'llm',
    },
  },
  {
    phase: 'qa',
    priority: 40,
    condition: () => true,
    result: {
      source: SkillSource.AIOS,
      skill: 'test-orchestrator',
      invokeType: 'direct',
    },
  },

  // ==================== ship 阶段 ====================
  {
    phase: 'ship',
    priority: 50,
    condition: (ctx) => ctx.hasBrowser === true,
    result: {
      source: SkillSource.GSTACK,
      skill: 'ship',
      invokeType: 'llm',
    },
  },
  {
    phase: 'ship',
    priority: 40,
    condition: () => true,
    result: {
      source: SkillSource.AIOS,
      skill: 'deploy',
      invokeType: 'direct',
    },
  },
];

/**
 * 根据上下文推断 domain
 */
export function inferDomain(input: string, techStack?: string): RoutingContext['domain'] {
  const lower = (input + ' ' + (techStack || '')).toLowerCase();

  if (/react|vue|angular|next\.js|nuxt|svelte|html css|tailwind|frontend|前端/.test(lower)) {
    return 'frontend';
  }
  if (/node|express|fastapi|django|flask|spring|api|backend|后端|server/.test(lower)) {
    return 'backend';
  }
  if (/android|kotlin|java.*mobile|ios|swift|flutter|react.?native|mobile|移动端/.test(lower)) {
    return 'mobile';
  }
  if (/fullstack|全栈|前端.*后端|前后端/.test(lower)) {
    return 'fullstack';
  }
  if (/pdf|docx?|word|excel|document|文档|报表|report/.test(lower)) {
    return 'document';
  }
  if (/image|photo|picture|video|audio|media|图片|视频|音频|语音|tts|music/.test(lower)) {
    return 'media';
  }

  return 'unknown';
}

/**
 * 根据输入推断复杂度
 */
export function inferComplexity(input: string): RoutingContext['complexity'] {
  const lower = input.toLowerCase();

  // 高复杂度指标
  const highComplexity = [
    /微服务|micro.?service|distributed|分布式/,
    /机器学习|machine.?learning|ai|人工智能|deep.?learning/,
    /区块链|blockchain|crypto/,
    /实时|real.?time|websocket|stream/,
    /复杂.*架构|三层|多层架构/,
  ];

  // 低复杂度指标
  const lowComplexity = [
    /简单.*页面|simple.*page|静态页面|static.*page/,
    /crud|增删改查|basic.*api/,
    /单个.*组件|single.*component/,
  ];

  for (const pattern of highComplexity) {
    if (pattern.test(lower)) return 'high';
  }
  for (const pattern of lowComplexity) {
    if (pattern.test(lower)) return 'low';
  }

  return 'medium';
}

/**
 * 检测是否提及浏览器相关需求
 */
export function detectBrowserNeed(input: string): boolean {
  const lower = input.toLowerCase();
  return /浏览器|browser|chrome|firefox|selenium|playwright|e2e|端到端.*测试/.test(lower);
}
