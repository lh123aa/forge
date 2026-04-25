# Forge 开发计划

> 三系统整合：AIOS (编排层) + gstack (工程流程层) + MiniMax Skills (领域专家层)
>
> **自我迭代引擎**：L2 主动优化 + L3 能力扩展 + L4 工作流进化

---

## 一、整体架构

### 1.1 三层架构 + 自我迭代引擎

```
┌─────────────────────────────────────────────────────────────────────┐
│  Forge 主控层 (src/core/)                                          │
│  • SkillRouter - 自动路由决策                                       │
│  • WorkflowBridge - 工作流桥接                                      │
│  • ExternalSkillLoader - 外部 Skill 加载                            │
│  • SelfIterationEngine - 🆕 自我迭代引擎                            │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  AIOS Skill 层 (现有)                                              │
│  • demand-collect / demand-analysis / demand-confirm                │
│  • task-decompose / task-plan / task-confirm                        │
│  • code-generation / test / review                                  │
│  • + 45 内置 Skills                                                │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ 能力不足时调用
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  gstack 技能层 (external/gstack/)                                  │
│  SKILL.md 格式，通过 LLM 调用                                       │
│  • /office-hours → 需求重构  • /plan-eng-review → 架构设计          │
│  • /review → 代码审查  • /qa → 浏览器测试  • /ship → 发布          │
└──────────────────────────────┬──────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  MiniMax Skills 层 (external/minimax-skills/)                       │
│  SKILL.md 格式，通过 LLM 调用                                       │
│  • frontend-dev → React/Next.js  • fullstack-dev → API/数据库      │
│  • minimax-pdf/docx/xlsx → 文档生成  • multimodal → 媒体生成       │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  🆕 自我迭代引擎 (SelfIterationEngine)                              │
│  • L2: PerformanceAnalyzer - 执行日志分析，生成优化建议              │
│  • L3: SkillGenerator - 自动生成新 Skill                            │
│  • L4: WorkflowEvolver - 自动优化/创建工作流                        │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 自我迭代架构详解

```
SelfIterationEngine
    │
    ├── L2: PerformanceAnalyzer (主动优化)
    │   ├── 执行日志采集 (ExecutionLogger)
    │   ├── 性能指标分析 (MetricsAnalyzer)
    │   ├── 瓶颈识别 (BottleneckDetector)
    │   └── 优化建议生成 (OptimizationGenerator) → 存入知识库
    │
    ├── L3: SkillGenerator (能力扩展)
    │   ├── 模式识别 (PatternRecognizer) - 发现重复模式 3 次触发
    │   ├── Skill 骨架生成 (SkeletonGenerator)
    │   ├── 代码生成 (CodeGenerator)
    │   └── 自动注册 (AutoRegistrar) → 写入 src/skills/workflows/
    │
    └── L4: WorkflowEvolver (工作流进化)
        ├── 执行路径分析 (PathAnalyzer)
        ├── 效率优化 (EfficiencyOptimizer)
        ├── 成功率优化 (SuccessRateOptimizer)
        └── 工作流生成 (WorkflowGenerator) → 写入 src/core/workflows/
```

---

## 二、详细开发计划

### Phase 1: 基础设施搭建

**预计时间**: 1 天

#### Task 1.1: 创建 external 目录结构

**新建文件**:
- `external/.gitkeep`

**操作**:
```bash
mkdir -p external/gstack external/minimax-skills
```

#### Task 1.2: 初始化 git submodule

**操作**:
```bash
cd external/gstack
git submodule add https://github.com/garrytan/gstack.git .

cd external/minimax-skills
git submodule add https://github.com/MiniMax-AI/skills.git skills
```

#### Task 1.3: 创建核心类型定义

**新建文件**: `src/core/types.ts`

```typescript
// 技能来源枚举
export enum SkillSource {
  AIOS = 'aios',
  GSTACK = 'gstack',
  MINIMAX = 'minimax',
}

// 技能路由决策上下文
export interface RoutingContext {
  phase: 'demand' | 'architecture' | 'implement' | 'review' | 'qa' | 'ship';
  techStack?: string;
  domain?: 'frontend' | 'backend' | 'mobile' | 'fullstack' | 'document' | 'media';
  complexity?: 'low' | 'medium' | 'high';
  hasBrowser?: boolean;
}

// 路由决策结果
export interface RoutingResult {
  source: SkillSource;
  skill: string;
  invokeType: 'llm' | 'mcp' | 'direct';
  args?: Record<string, unknown>;
}

// ===== 自我迭代相关类型 =====

// 执行日志条目
export interface ExecutionLogEntry {
  traceId: string;
  timestamp: number;
  workflowName: string;
  stepName: string;
  skillName: string;
  source: SkillSource;
  duration: number;           // 耗时 ms
  success: boolean;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
  retryCount: number;
}

// 性能指标
export interface PerformanceMetrics {
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  successRate: number;
  totalExecutions: number;
  avgRetries: number;
}

// 优化建议
export interface OptimizationSuggestion {
  id: string;
  type: 'performance' | 'reliability' | 'capability';
  priority: 'low' | 'medium' | 'high';
  target: string;           // skill 名或 workflow 名
  description: string;
  expectedImprovement: string;
  implementationHint: string;
  autoApplicable: boolean;  // 是否可自动应用
}

// 生成的 Skill 元信息
export interface GeneratedSkillMeta {
  name: string;
  description: string;
  pattern: string;         // 识别到的模式
  triggerCount: number;    // 触发次数
  generatedAt: number;
  author: 'SelfIterationEngine';
  version: string;
}
```

---

### Phase 2: SkillRouter 实现

**预计时间**: 1.5 天

#### Task 2.1: 创建 SkillRouter 类

**新建文件**: `src/core/skill-router.ts`

**核心方法**:
```typescript
export class SkillRouter {
  route(context: RoutingContext): RoutingResult;
  chain(context: WorkflowContext, skills: RoutingResult[]): Promise<SkillResult[]>;
  shouldDelegate(skill: string): boolean;
}
```

#### Task 2.2: 实现路由决策逻辑

**路由规则表**:

| 场景 | AIOS Skill | gstack Skill | MiniMax Skill |
|------|------------|--------------|---------------|
| 需求采集 | demand-collect | office-hours (增强) | - |
| 产品评审 | - | plan-ceo-review | - |
| 架构设计 | - | plan-eng-review | - |
| 前端代码 | generate-code | review | frontend-dev |
| 代码审查 | code-review | review | - |
| 浏览器测试 | test-orchestrator | qa | - |
| 发布 | deploy | ship | - |
| 文档生成 | - | document-release | minimax-pdf |

#### Task 2.3: 添加路由配置

**新建文件**: `src/core/routing-rules.ts`

---

### Phase 3: 外部技能加载器

**预计时间**: 1 天

#### Task 3.1: 创建 ExternalSkillLoader

**新建文件**: `src/core/external-skill-loader.ts`

**核心方法**:
```typescript
export class ExternalSkillLoader {
  async loadGstackSkill(skillName: string): Promise<string>;
  async loadMinimaxSkill(skillName: string): Promise<string>;
  async getSkillContent(source: SkillSource, skill: string): Promise<string>;
  listAvailableSkills(): { gstack: string[]; minimax: string[] };
}
```

#### Task 3.2: 实现 gstack 技能加载

#### Task 3.3: 实现 MiniMax 技能加载

---

### Phase 4: WorkflowBridge 实现

**预计时间**: 1 天

#### Task 4.1: 创建 WorkflowBridge 类

**新建文件**: `src/core/workflow-bridge.ts`

#### Task 4.2: 定义 ForgeWorkflow 类型

**新建文件**: `src/core/workflow-types.ts`

#### Task 4.3: 创建整合工作流定义

**新建文件**: `src/core/workflows/forge-demand.ts`

---

### Phase 5: MCP 工具扩展

**预计时间**: 0.5 天

#### Task 5.1: 新增 Forge MCP 工具

**修改文件**: `src/mcp/tools.ts`

**新增工具**:
```typescript
{ name: 'forge-route', description: '根据上下文路由到合适的技能' },
{ name: 'forge-list-skills', description: '列出所有可用的 Forge 技能' },
{ name: 'forge-invoke-skill', description: '手动调用指定技能' },
{ name: 'forge-self-iterate', description: '🆕 触发自我迭代分析' },
```

#### Task 5.2: 实现工具处理函数

**修改文件**: `src/mcp/stdio-server.ts`

---

### Phase 6: 知识桥接

**预计时间**: 0.5 天

#### Task 6.1: 创建 KnowledgeBridge 类

**新建文件**: `src/core/knowledge-bridge.ts`

#### Task 6.2: 实现经验同步

---

### Phase 7: 🆕 L2 主动优化引擎

**预计时间**: 1.5 天

> **目标**: 每次 workflow 完成后分析执行数据，生成优化建议存入知识库

#### Task 7.1: 创建 ExecutionLogger (执行日志采集)

**新建文件**: `src/core/self-iteration/execution-logger.ts`

**核心方法**:
```typescript
export class ExecutionLogger {
  // 记录单个执行步骤
  async logStep(entry: ExecutionLogEntry): Promise<void>;
  
  // 获取指定 skill/workflow 的执行历史
  async getHistory(
    target: string,
    type: 'skill' | 'workflow',
    limit?: number
  ): Promise<ExecutionLogEntry[]>;
  
  // 获取性能统计
  async getMetrics(
    target: string,
    type: 'skill' | 'workflow'
  ): Promise<PerformanceMetrics>;
}
```

**数据结构**:
```
data/
└── self-iteration/
    └── logs/
        ├── {year-month}.json    # 按月存储
        └── {traceId}/
            └── steps.json      # 单次运行的步骤日志
```

#### Task 7.2: 创建 MetricsAnalyzer (指标分析)

**新建文件**: `src/core/self-iteration/metrics-analyzer.ts`

**核心方法**:
```typescript
export class MetricsAnalyzer {
  // 分析单个 skill 的性能
  analyzeSkillPerformance(skillName: string): Promise<PerformanceMetrics>;
  
  // 分析工作流整体性能
  analyzeWorkflowPerformance(workflowName: string): Promise<PerformanceMetrics>;
  
  // 找出瓶颈
  findBottlenecks(workflowName: string): Promise<Bottleneck[]>;
  
  // 对比两次运行的差异
  compareRuns(traceId1: string, traceId2: string): Promise<ComparisonResult>;
}
```

**瓶颈识别规则**:
| 指标 | 阈值 | 问题 |
|------|------|------|
| 成功率 | < 80% | 可靠性问题 |
| 平均耗时 | > 平均值 2σ | 性能瓶颈 |
| 重试次数 | > 1 次/次 | 执行不稳定 |
| 超时率 | > 20% | 资源不足或逻辑复杂 |

#### Task 7.3: 创建 OptimizationGenerator (优化建议生成)

**新建文件**: `src/core/self-iteration/optimization-generator.ts`

**核心方法**:
```typescript
export class OptimizationGenerator {
  // 生成优化建议
  generateSuggestions(
    metrics: PerformanceMetrics,
    bottlenecks: Bottleneck[]
  ): OptimizationSuggestion[];
  
  // 将建议转换为知识库格式
  toKnowledgeEntry(suggestion: OptimizationSuggestion): KnowledgeEntry;
  
  // 检查建议是否已存在（避免重复）
  async isDuplicate(suggestion: OptimizationSuggestion): Promise<boolean>;
}
```

**优化建议模板**:

| 场景 | 建议类型 | 自动可应用 |
|------|----------|-----------|
| 某 skill 经常超时 | 增加 timeout | ❌ |
| 某步骤成功率高但耗时高 | 并行化建议 | ❌ |
| 某组合 skill 被频繁手动调用 | 建议生成新 Skill | ✅ |
| 某 workflow 失败率高 | 改进错误处理 | ❌ |

#### Task 7.4: 创建 SelfIterationEngine 主类

**新建文件**: `src/core/self-iteration/engine.ts`

**核心方法**:
```typescript
export class SelfIterationEngine {
  private logger: ExecutionLogger;
  private analyzer: MetricsAnalyzer;
  private generator: OptimizationGenerator;
  private skillGenerator: SkillGenerator;  // L3
  private workflowEvolver: WorkflowEvolver; // L4
  
  // L2: 执行主动优化
  async optimize(): Promise<OptimizationResult>;
  
  // L2: 分析单次运行
  async analyzeRun(traceId: string): Promise<RunAnalysis>;
  
  // L3: 生成新 Skill (见 Phase 8)
  async generateSkill(pattern: string): Promise<GeneratedSkillMeta>;
  
  // L4: 优化工作流 (见 Phase 9)
  async evolveWorkflow(workflowName: string): Promise<EvolveResult>;
  
  // 获取自我迭代状态
  getStatus(): IterationStatus;
}
```

**触发机制**:
1. **手动触发**: `forge-self-iterate` MCP 工具
2. **自动触发**: 每次 workflow 完成且成功率 > 90% 时（后台运行）
3. **定时触发**: 每天凌晨分析上周数据

---

### Phase 8: 🆕 L3 能力扩展引擎

**预计时间**: 2 天

> **目标**: 识别重复模式，自动生成新 Skill

#### Task 8.1: 创建 PatternRecognizer (模式识别)

**新建文件**: `src/core/self-iteration/pattern-recognizer.ts`

**核心方法**:
```typescript
export class PatternRecognizer {
  // 分析执行历史，识别重复模式
  async recognizePatterns(): Promise<Pattern[]>;
  
  // 检查模式是否满足生成条件 (>= 3 次)
  shouldGenerate(pattern: Pattern): boolean;
  
  // 将模式转换为 Skill 骨架
  toSkeleton(pattern: Pattern): SkillSkeleton;
}
```

**识别模式类型**:

| 模式类型 | 描述 | 示例 |
|----------|------|------|
| **顺序组合** | 多个 skill 总是按顺序调用 | A → B → C |
| **条件分支** | 某 skill 结果决定后续调用 | if X → A else B |
| **参数模板** | 某 skill 总是用类似参数 | generate-code + {前端模板} |
| **跨工作流** | 多个工作流包含相同步骤 | review 在 3 个 workflow 中 |

**识别算法**:
```
1. 收集所有执行历史
2. 提取 step 序列
3. 计算序列相似度 (Jaccard)
4. 聚类相似序列
5. 找出频繁项集 (Apriori)
6. 验证是否满足 3 次阈值
```

#### Task 8.2: 创建 SkillGenerator (Skill 生成器)

**新建文件**: `src/core/self-iteration/skill-generator.ts`

**核心方法**:
```typescript
export class SkillGenerator {
  private recognizer: PatternRecognizer;
  private skeleton: SkillSkeleton;
  
  // 生成新 Skill 代码
  async generate(skeleton: SkillSkeleton): Promise<string>;
  
  // 生成 Skill 的 metadata
  generateMeta(skeleton: SkillSkeleton, code: string): GeneratedSkillMeta;
  
  // 验证生成的 Skill 语法正确
  validate(code: string): Promise<ValidationResult>;
}
```

**生成示例**:

输入模式:
```
demand-collect + demand-analysis + demand-confirm (出现 15 次)
```

生成的 Skill:
```typescript
// src/skills/workflows/demand-express.ts
export class DemandExpressSkill extends BaseSkill {
  readonly meta = {
    name: 'demand-express',
    description: '快速需求确认流程 (自动生成)',
    pattern: 'demand-collect + demand-analysis + demand-confirm',
    author: 'SelfIterationEngine',
    version: '1.0.0',
  };

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    // 按顺序执行三个 skill
    const r1 = await this.executeSkill('demand-collect', input);
    if (r1.code !== 200) return r1;
    
    const r2 = await this.executeSkill('demand-analysis', {
      ...input,
      context: { ...input.context, ...r1.data }
    });
    if (r2.code !== 200) return r2;
    
    return this.executeSkill('demand-confirm', {
      ...input,
      context: { ...input.context, ...r2.data }
    });
  }
}
```

#### Task 8.3: 创建 AutoRegistrar (自动注册)

**新建文件**: `src/core/self-iteration/auto-registrar.ts`

**核心方法**:
```typescript
export class AutoRegistrar {
  // 注册新生成的 Skill
  async register(meta: GeneratedSkillMeta, code: string): Promise<void>;
  
  // 注销 Skill
  async unregister(skillName: string): Promise<void>;
  
  // 更新 SkillRegistry
  updateRegistry(meta: GeneratedSkillMeta): void;
  
  // 回滚（如果验证失败）
  async rollback(skillName: string): Promise<void>;
}
```

**注册流程**:
```
1. 生成 Skill 代码
2. 语法验证 (TypeScript compile)
3. 写入 src/skills/workflows/{skill-name}.ts
4. 添加到 index.ts 导出
5. 注册到 SkillRegistry
6. 记录到 generated-skills.json
```

---

### Phase 9: 🆕 L4 工作流进化引擎

**预计时间**: 1.5 天

> **目标**: 分析工作流执行路径，自动优化或生成新工作流

#### Task 9.1: 创建 PathAnalyzer (路径分析)

**新建文件**: `src/core/self-iteration/path-analyzer.ts`

**核心方法**:
```typescript
export class PathAnalyzer {
  // 分析工作流所有可能的执行路径
  analyzePaths(workflow: Workflow): ExecutionPath[];
  
  // 统计每条路径的出现频率
  getPathFrequencies(workflowName: string): PathFrequency[];
  
  // 识别高价值优化点
  findOptimizationPoints(workflowName: string): OptimizationPoint[];
}
```

**路径分析输出示例**:
```
Workflow: forge-demand
Paths:
  A: demand-collect → demand-analysis → demand-confirm (85%)
  B: demand-collect → demand-analysis → demand-clarify → demand-confirm (12%)
  C: demand-collect → demand-analysis → demand-clarify → demand-analysis → demand-confirm (3%)
  
Optimization Points:
  - B/C 都经过 demand-clarify，说明需求经常需要澄清
  - 建议：默认加上 demand-clarify 步骤
```

#### Task 9.2: 创建 WorkflowEvolver (工作流进化器)

**新建文件**: `src/core/self-iteration/workflow-evolver.ts`

**核心方法**:
```typescript
export class WorkflowEvolver {
  // 基于分析结果优化现有工作流
  async evolve(
    workflowName: string,
    suggestions: OptimizationSuggestion[]
  ): Promise<EvolveResult>;
  
  // 生成新的工作流
  async generateFromPattern(pattern: Pattern): Promise<Workflow>;
  
  // A/B 测试支持
  async createVariant(
    workflowName: string,
    modifications: WorkflowModification[]
  ): Promise<Workflow>;
}
```

**进化策略**:

| 策略 | 条件 | 操作 |
|------|------|------|
| **步骤合并** | 两步骤总是顺序执行，且无分支 | 合并为一个步骤 |
| **步骤提取** | 多处出现相同步骤序列 | 提取为独立 Skill |
| **默认步骤** | 某可选步骤执行率 > 80% | 变为必选步骤 |
| **并行优化** | 两步骤无依赖 | 添加并行分支 |
| **重试优化** | 某步骤经常重试成功 | 增加默认重试次数 |

#### Task 9.3: 创建 WorkflowGenerator (工作流生成器)

**新建文件**: `src/core/self-iteration/workflow-generator.ts`

**核心方法**:
```typescript
export class WorkflowGenerator {
  // 从优化建议生成新工作流
  async generateFromOptimization(
    suggestion: OptimizationSuggestion
  ): Promise<Workflow>;
  
  // 验证生成的工作流
  validate(workflow: Workflow): ValidationResult;
  
  // 估算优化效果
  estimateImprovement(
    original: Workflow,
    evolved: Workflow
  ): ImprovementEstimate;
}
```

---

### Phase 10: 测试与文档

**预计时间**: 0.5 天

#### Task 10.1: 单元测试

**新建文件**:
- `tests/core/skill-router.test.ts`
- `tests/core/self-iteration/execution-logger.test.ts`
- `tests/core/self-iteration/metrics-analyzer.test.ts`
- `tests/core/self-iteration/pattern-recognizer.test.ts`

#### Task 10.2: 集成测试

**新建文件**:
- `tests/integration/forge-workflow.test.ts`
- `tests/integration/self-iteration.test.ts`

#### Task 10.3: 文档完善

**修改文件**: `README.md`, `README_CN.md`

**新增章节**:
- Forge 自我迭代引擎
- L2/L3/L4 详细说明
- 自我迭代配置

---

## 三、任务清单

### Phase 1: 基础设施 (1 天)

- [ ] **1.1** 创建 external 目录结构
- [ ] **1.2** 初始化 git submodule (gstack + minimax)
- [ ] **1.3** 创建核心类型定义 `src/core/types.ts`

### Phase 2: SkillRouter (1.5 天)

- [ ] **2.1** 创建 SkillRouter 类 `src/core/skill-router.ts`
- [ ] **2.2** 实现路由决策逻辑
- [ ] **2.3** 添加路由配置 `src/core/routing-rules.ts`

### Phase 3: 外部技能加载器 (1 天)

- [ ] **3.1** 创建 ExternalSkillLoader 类
- [ ] **3.2** 实现 gstack 技能加载
- [ ] **3.3** 实现 MiniMax 技能加载

### Phase 4: WorkflowBridge (1 天)

- [ ] **4.1** 创建 WorkflowBridge 类
- [ ] **4.2** 定义 ForgeWorkflow 类型
- [ ] **4.3** 创建整合工作流

### Phase 5: MCP 工具扩展 (0.5 天)

- [ ] **5.1** 新增 Forge MCP 工具定义
- [ ] **5.2** 实现工具处理函数

### Phase 6: 知识桥接 (0.5 天)

- [ ] **6.1** 创建 KnowledgeBridge 类
- [ ] **6.2** 实现经验同步

### Phase 7: L2 主动优化引擎 (1.5 天)

- [ ] **7.1** 创建 ExecutionLogger
- [ ] **7.2** 创建 MetricsAnalyzer
- [ ] **7.3** 创建 OptimizationGenerator
- [ ] **7.4** 创建 SelfIterationEngine 主类

### Phase 8: L3 能力扩展引擎 (2 天)

- [ ] **8.1** 创建 PatternRecognizer
- [ ] **8.2** 创建 SkillGenerator
- [ ] **8.3** 创建 AutoRegistrar

### Phase 9: L4 工作流进化引擎 (1.5 天)

- [ ] **9.1** 创建 PathAnalyzer
- [ ] **9.2** 创建 WorkflowEvolver
- [ ] **9.3** 创建 WorkflowGenerator

### Phase 10: 测试与文档 (0.5 天)

- [ ] **10.1** 单元测试
- [ ] **10.2** 集成测试
- [ ] **10.3** 文档完善

---

## 四、文件变更汇总

### 新建文件 (共 25 个)

**核心整合 (8 个)**
| 文件路径 | 描述 |
|----------|------|
| `src/core/index.ts` | 核心模块导出 |
| `src/core/types.ts` | 类型定义 |
| `src/core/skill-router.ts` | 技能路由 |
| `src/core/routing-rules.ts` | 路由规则 |
| `src/core/external-skill-loader.ts` | 外部技能加载器 |
| `src/core/workflow-bridge.ts` | 工作流桥接 |
| `src/core/workflow-types.ts` | 工作流类型 |
| `src/core/knowledge-bridge.ts` | 知识桥接 |

**自我迭代引擎 (12 个)**
| 文件路径 | 描述 |
|----------|------|
| `src/core/self-iteration/index.ts` | 自我迭代模块导出 |
| `src/core/self-iteration/engine.ts` | 自我迭代引擎主类 |
| `src/core/self-iteration/execution-logger.ts` | L2 执行日志采集 |
| `src/core/self-iteration/metrics-analyzer.ts` | L2 指标分析 |
| `src/core/self-iteration/optimization-generator.ts` | L2 优化建议生成 |
| `src/core/self-iteration/pattern-recognizer.ts` | L3 模式识别 |
| `src/core/self-iteration/skill-generator.ts` | L3 Skill 生成器 |
| `src/core/self-iteration/auto-registrar.ts` | L3 自动注册 |
| `src/core/self-iteration/path-analyzer.ts` | L4 路径分析 |
| `src/core/self-iteration/workflow-evolver.ts` | L4 工作流进化 |
| `src/core/self-iteration/workflow-generator.ts` | L4 工作流生成 |
| `src/core/self-iteration/types.ts` | 自我迭代类型定义 |

**测试文件 (4 个)**
| 文件路径 | 描述 |
|----------|------|
| `tests/core/skill-router.test.ts` | 路由测试 |
| `tests/core/self-iteration/*.test.ts` | 自我迭代测试 |
| `tests/integration/forge-workflow.test.ts` | 集成测试 |
| `tests/integration/self-iteration.test.ts` | 自我迭代集成测试 |

**文档 (1 个)**
| 文件路径 | 描述 |
|----------|------|
| `docs/INTEGRATION_GUIDE.md` | 整合指南 + 自我迭代说明 |

### 修改文件 (共 4 个)

| 文件路径 | 修改内容 |
|----------|----------|
| `src/mcp/tools.ts` | 新增 forge-* 工具 + forge-self-iterate |
| `src/mcp/stdio-server.ts` | 注册新工具处理函数 |
| `README.md` | 新增 Forge 章节 + 自我迭代说明 |
| `README_CN.md` | 同上 |

### 外部依赖 (git submodule)

| 路径 | 来源 |
|------|------|
| `external/gstack/` | https://github.com/garrytan/gstack |
| `external/minimax-skills/` | https://github.com/MiniMax-AI/skills |

---

## 五、风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| L3 生成无效 Skill | 系统不稳定 | 必须通过语法验证 + 沙盒测试 |
| L4 修改工作流导致死循环 | 系统卡死 | 版本快照 + 回滚机制 + 人工审批 |
| 自我迭代占用资源 | 影响正常流程 | 后台异步执行 + 限流 |
| 知识库污染 | 建议质量下降 | 去重检查 + 人工审核高优先级建议 |
| gstack/MiniMax API 变更 | 技能调用失败 | 版本锁定 + 定期同步 |

---

## 六、安全机制

> **重要**: L3/L4 涉及自动代码生成，必须有安全机制

### 6.1 沙盒验证

```typescript
// 生成的新 Skill 必须通过以下验证
1. TypeScript 编译检查 (tsc --noEmit)
2. 单元测试 (如果生成测试)
3. 沙盒执行 (在临时目录运行，不影响主流程)
4. 人工审批 (高风险操作如修改核心模块)
```

### 6.2 版本控制

```typescript
// 所有自动生成的代码都带有标记
{
  "author": "SelfIterationEngine",
  "version": "1.0.0",
  "generatedAt": 1699999999999,
  "parentVersion": "original-skill-version"
}

// 可随时回滚到人工版本
```

### 6.3 限流机制

```typescript
// 自我迭代触发限制
- L2 分析: 每次 workflow 完成后自动触发 (无限制)
- L3 生成: 同一模式需要间隔 24 小时才能再次生成
- L4 进化: 每周最多自动进化 1 个工作流
- 人工触发: 无限制
```

### 6.4 人工审批清单

| 操作 | 自动执行 | 需要人工审批 |
|------|---------|-------------|
| L2 优化建议 | ✅ | 建议存入知识库，标注"待审核" |
| L3 新 Skill | ❌ | 生成后暂停，等待人工确认 |
| L4 工作流修改 | ❌ | 生成变体，等待人工确认 |
| 核心模块修改 | ❌ | 禁止自动修改 |

---

## 七、验收标准

### 基础整合
- [ ] `forge-route` 工具正确返回路由决策
- [ ] `forge-list-skills` 列出所有可用技能
- [ ] `forge-invoke-skill` 成功调用 gstack/MiniMax 技能
- [ ] 需求工作流端到端跑通

### L2 主动优化
- [ ] 执行日志正确记录
- [ ] 性能指标正确计算
- [ ] 瓶颈识别准确
- [ ] 优化建议生成并存入知识库

### L3 能力扩展
- [ ] 重复模式识别准确 (>= 3 次触发)
- [ ] Skill 代码生成语法正确
- [ ] 自动注册到 SkillRegistry
- [ ] 可通过 `forge-self-iterate` 手动触发

### L4 工作流进化
- [ ] 执行路径分析正确
- [ ] 进化建议合理
- [ ] 生成的工作流通过验证
- [ ] 支持人工审批流程

### 自我迭代总控
- [ ] `forge-self-iterate` 工具正常工作
- [ ] 迭代状态可查询
- [ ] 安全机制生效（沙盒、限流、审批）
- [ ] 所有测试通过
