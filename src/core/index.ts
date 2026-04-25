// Forge 核心模块导出

// 类型
export * from './types.js';

// 路由
export * from './skill-router.js';
export { routingRules, inferDomain, inferComplexity, detectBrowserNeed, createDefaultContext } from './routing-rules.js';

// 外部技能加载
export * from './external-skill-loader.js';

// 工作流桥接
export * from './workflow-bridge.js';

// 知识桥接
export * from './knowledge-bridge.js';

// 自我迭代引擎
export * from './self-iteration/index.js';
