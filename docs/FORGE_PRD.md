# Forge - 智能代码开发工作台

## 1. 概念与愿景

**Forge** 是一款整合 gstack、MiniMax Skills 和 AIOS 的智能代码开发工作台。"Forge"意为锻造厂——代码在这里被打磨、淬炼、成型。三套系统各司其职：AIOS 作为顶层编排引擎，gstack 作为工程流程监理，MiniMax Skills 作为领域技术专家。

**核心理念**：不给开发者堆砌工具，而是打造一支 AI 工程团队。

---

## 2. 架构设计

### 2.1 三层架构

```
┌─────────────────────────────────────────────────────────────┐
│  AIOS (SCA) — 顶层编排层                                    │
│  • 唯一调度中枢，traceId 串联全流程                        │
│  • 多 Agent 协作 (PM/Architect/Dev/QA)                    │
│  • 本地知识库沉淀                                            │
│  • 决策点: 何时调用 gstack / MiniMax                       │
└──────────────────────────┬──────────────────────────────────┘
                           │ MCP Tool / Skill Invocation
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  gstack — 工程流程层 (SKILL.md)                            │
│  • /office-hours  → 需求重构                                │
│  • /plan-ceo-review → 产品方向评审                          │
│  • /plan-eng-review → 架构锁定                             │
│  • /review → 代码审查                                       │
│  • /qa → 浏览器测试                                         │
│  • /ship → 发布 PR                                          │
│  • /document-release → 文档同步                             │
└──────────────────────────┬──────────────────────────────────┘
                           │ Skill Invocation
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  MiniMax Skills — 领域专家层 (SKILL.md)                    │
│  • frontend-dev → React/Next.js 最佳实践                   │
│  • fullstack-dev → API/数据库/架构                         │
│  • android-native-dev / ios-application-dev → 移动端       │
│  • minimax-pdf/docx/xlsx → 文档生成                        │
│  • minimax-multimodal-toolkit → 媒体生成                    │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 组件关系

| 组件 | 来源 | 角色 | 集成方式 |
|------|------|------|----------|
| SCA (Smart Code Agent) | 现有 `E:\程序\forge` | 顶层编排 | MCP Server，核心 |
| gstack | git submodule | 工程监理 | SKILL.md，被 SCA 调用 |
| MiniMax Skills | git submodule | 领域专家 | SKILL.md，被 SCA 调用 |
| 持久浏览器 | gstack 复用 | 自动化测试 | Playwright/CDP |

---

## 3. 功能模块

### 3.1 新增功能

#### 3.1.1 Skill Router (技能路由器)

自动判断当前阶段应该调用哪个系统的技能：

```typescript
// 根据上下文决定调用哪个技能
SkillRouter.route(context: WorkflowContext): SkillTarget

// 决策逻辑：
// - 需要产品方向/CEO视角 → gstack /plan-ceo-review
// - 需要架构设计 → gstack /plan-eng-review
// - 需要前端代码 → MiniMax frontend-dev
// - 需要后端代码 → MiniMax fullstack-dev
// - 需要代码审查 → gstack /review
// - 需要浏览器测试 → gstack /qa
// - 需要文档生成 → gstack /document-release + MiniMax pdf/docx
```

#### 3.1.2 Unified Workflow (统一工作流)

整合三套系统的工作流程：

```
需求输入
    │
    ▼
┌─────────────────┐
│ AIOS 需求分析   │ ← gstack /office-hours 增强
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ AIOS 架构设计   │ ← gstack /plan-eng-review 增强
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ AIOS 代码生成   │ ← MiniMax domain skills 增强
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ AIOS 代码审查   │ ← gstack /review 增强
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ AIOS 浏览器测试 │ ← gstack /qa 增强
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ AIOS 发布交付   │ ← gstack /ship + /land-and-deploy
└─────────────────┘
```

#### 3.1.3 Knowledge Bridge (知识桥)

让 AIOS 的知识库与 gstack 的经验沉淀互通：

- AIOS 学到的经验 → 写入共享知识库
- gstack 的最佳实践 → 导入 AIOS 知识库
- 统一的知识查询接口

### 3.2 整合的技能列表

| 技能 | 来源 | 调用时机 |
|------|------|----------|
| `sca-start` | AIOS | 启动开发流程 |
| `sca-resume` | AIOS | 恢复中断的流程 |
| `sca-add-knowledge` | AIOS | 添加知识 |
| `sca-search-knowledge` | AIOS | 搜索知识 |
| `gstack-office-hours` | gstack | 需求重构 |
| `gstack-plan-ceo` | gstack | CEO 视角评审 |
| `gstack-plan-eng` | gstack | 架构评审 |
| `gstack-review` | gstack | 代码审查 |
| `gstack-qa` | gstack | 浏览器测试 |
| `gstack-ship` | gstack | 发布 |
| `minimax-frontend` | MiniMax | 前端代码 |
| `minimax-fullstack` | MiniMax | 全栈代码 |
| `minimax-mobile` | MiniMax | 移动端代码 |
| `minimax-doc` | MiniMax | 文档生成 |

---

## 4. 技术方案

### 4.1 目录结构

```
forge/
├── src/
│   ├── index.ts              # 入口
│   ├── plugin.ts            # 主插件类
│   │
│   ├── core/                # 核心新增
│   │   ├── skill-router.ts  # 技能路由
│   │   ├── workflow-bridge.ts # 工作流桥接
│   │   └── knowledge-bridge.ts # 知识桥
│   │
│   ├── skills/              # 现有 AIOS Skills
│   │   ├── atoms/
│   │   └── workflows/
│   │
│   ├── mcp/                # MCP Server
│   │   ├── server.ts
│   │   └── tools.ts
│   │
│   └── ...                 # 其他现有模块
│
├── external/                # 外部依赖 (submodules)
│   ├── gstack/            # gstack submodule
│   └── minimax-skills/    # MiniMax Skills submodule
│
├── workflows/              # 整合后的工作流
│   ├── forge-demand.ts    # 需求工作流 (AIOS + gstack)
│   ├── forge-architecture.ts # 架构工作流 (AIOS + gstack)
│   ├── forge-implementation.ts # 实现工作流 (AIOS + MiniMax)
│   ├── forge-review.ts    # 审查工作流 (AIOS + gstack)
│   └── forge-qa.ts       # 测试工作流 (AIOS + gstack)
│
├── docs/
│   ├── FORGE_PRD.md       # 本文档
│   └── INTEGRATION.md     # 集成指南
│
└── package.json
```

### 4.2 依赖关系

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.26.0",
    "commander": "^11.1.0",
    "handlebars": "^4.7.8",
    "inquirer": "^9.2.6",
    "sql.js": "^1.14.0",
    "uuid": "^9.0.1",
    "yaml": "^2.3.4"
  }
}
```

新增依赖：无（复用的外部系统）

### 4.3 关键接口设计

#### SkillRouter

```typescript
interface SkillRouter {
  // 根据当前上下文选择最佳技能
  route(context: {
    phase: 'demand' | 'architecture' | 'implement' | 'review' | 'qa' | 'ship';
    techStack?: string;
    domain?: 'frontend' | 'backend' | 'mobile' | 'fullstack';
  }): {
    system: 'aios' | 'gstack' | 'minimax';
    skill: string;
    args?: Record<string, unknown>;
  };

  // 串联调用多个技能
  chain(context: WorkflowContext, skills: string[]): Promise<SkillResult[]>;
}
```

#### WorkflowBridge

```typescript
interface WorkflowBridge {
  // 挂载 gstack 技能到 AIOS
  mountGstackSkills(): void;
  
  // 挂载 MiniMax 技能到 AIOS
  mountMinimaxSkills(): void;
  
  // 执行整合工作流
  executeWorkflow(name: string, params: WorkflowParams): Promise<WorkflowResult>;
}
```

---

## 5. 实施计划

### Phase 1: 架构整合 (1-2 天)

- [ ] 创建 `external/` 目录结构
- [ ] 添加 gstack 和 MiniMax 为 git submodule
- [ ] 实现 `SkillRouter` 核心逻辑
- [ ] 实现 `WorkflowBridge` 基础框架

### Phase 2: 技能挂载 (1-2 天)

- [ ] gstack 技能挂载到 AIOS
  - [ ] /office-hours → demand 增强
  - [ ] /plan-ceo-review → architecture 增强
  - [ ] /plan-eng-review → architecture 增强
  - [ ] /review → review 增强
  - [ ] /qa → qa 增强
  - [ ] /ship → ship 增强
- [ ] MiniMax 技能挂载到 AIOS
  - [ ] frontend-dev → implement 增强
  - [ ] fullstack-dev → implement 增强
  - [ ] pdf/docx/xlsx → delivery 文档生成

### Phase 3: 工作流整合 (1-2 天)

- [ ] forge-demand 工作流
- [ ] forge-architecture 工作流
- [ ] forge-implementation 工作流
- [ ] forge-review 工作流
- [ ] forge-qa 工作流

### Phase 4: 知识整合 (0.5 天)

- [ ] 知识桥接实现
- [ ] 共享知识库设计

### Phase 5: 测试与文档 (0.5 天)

- [ ] 集成测试
- [ ] 文档完善
- [ ] README 更新

---

## 6. 风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| gstack/MiniMax API 变更 | 技能调用失败 | 版本锁定 + 定期同步 |
| 技能路由决策失误 | 调用错误系统 | 提供手动 override 选项 |
| 知识库格式冲突 | 经验无法共享 | 抽象公共接口 + 适配器模式 |

---

## 7. 成功标准

- [ ] 三套系统无缝衔接，无手动切换
- [ ] SkillRouter 决策准确率 > 90%
- [ ] 完整工作流端到端跑通
- [ ] 代码审查覆盖率 > 80%
- [ ] 浏览器测试自动化
- [ ] 文档自动同步

---

## 8. 未来展望

- **多 Agent 并行**：借鉴 gstack Conductor，支持 10+ 并行 sprint
- **跨语言支持**：MiniMax 已有多语言技能，可扩展
- **自进化知识库**：基于运行数据自动优化路由决策
