# Forge

<div align="center">

**智能代码生成 MCP 插件**

_需求闭环 • Skill 插件化 • 自我学习 • 观察者迭代_

[![Node.js](https://img.shields.io/badge/Node.js-18+-green?style=flat-square)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?style=flat-square)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-orange?style=flat-square)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-1.0-purple?style=flat-square)](https://modelcontextprotocol.io/)

[English](README.md) | [中文文档](README_CN.md)

</div>

---

## ✨ 特性

### 🎯 需求驱动开发

从需求采集到代码生成的完整闭环。支持多种项目类型：页面、API、组件和完整项目。

### 🔌 Skill 插件系统

可扩展的技能架构，**45+ 内置 Skills**。使用 BaseSkill 类轻松创建自定义 Skill。

### 🧠 自我学习

本地知识库，持续积累开发经验。添加、搜索和管理知识条目。

### 📊 观察者模式

全程记录运行数据，持续优化。生成详细报告和执行指标追踪。

### 💾 双存储

支持文件系统存储和 SQLite 数据库。灵活配置适应不同使用场景。

### 🔄 自动更新

自动检测 GitHub 更新。一键升级，失败自动回滚。

### 🧪 完整测试

内置测试生成（单元、集成、验收）。代码质量检查（lint 和类型验证）。

### 🚀 MCP 集成

完整的 MCP (Model Context Protocol) 支持。兼容 OpenCode、Claude Desktop 等 MCP 客户端。

### 🛡️ 质量门禁

代码生成后自动质量检查。可配置 lint、类型检查、测试和安全检查。

### 📡 接口契约

自动生成 OpenAPI 3.0 接口定义。内置 Mock 服务器支持 Express、MSW、JSON-Server。

### 🚢 部署支持

一键部署，构建验证。支持本地、NPM、Docker、SSH、Vercel 和 Netlify。

### 👥 团队协作

任务分配与分解。代码评审自动化（安全、最佳实践、性能检查）。

---

## 📦 安装

### 快速安装

```bash
git clone https://github.com/lh123aa/forge.git
cd forge
npm install
npm run build
```

### 开发模式

```bash
npm install
npm run dev    # 监听模式
npm test       # 运行测试
```

### 全局 CLI

```bash
npm install
npm run build
npm link       # 可选：全局安装为 'fg' 命令
```

---

## 🚀 快速开始

### CLI 使用

```bash
# 初始化
fg init

# 启动开发
fg start -t page -d "创建一个用户登录页面"

# 检查更新
fg update --check

# 执行更新
fg update

# 显示版本
fg version
```

### 库使用

```typescript
import Forge from 'forge';

const agent = new Forge();
await agent.initialize();

const result = await agent.start({
  projectType: 'page',
  initialDemand: '创建一个用户登录页面',
  projectPath: './my-project',
});
```

### MCP 集成

```json
{
  "mcpServers": {
    "forge": {
      "command": "node",
      "args": ["/path/to/forge/dist/mcp/stdio-server.js"]
    }
  }
}
```

---

## 🛠️ MCP 工具

| 工具                   | 描述           |
| ---------------------- | -------------- |
| `sca-start`            | 启动开发流程   |
| `sca-resume`           | 恢复中断的流程 |
| `sca-get-report`       | 获取运行报告   |
| `sca-add-knowledge`    | 添加知识       |
| `sca-search-knowledge` | 搜索知识库     |
| `sca-list-workflows`   | 列出工作流     |
| `sca-run-workflow`     | 执行工作流     |
| `sca-submit-feedback`  | 提交反馈       |
| `sca-check-update`     | 检查更新       |
| `sca-do-update`        | 执行更新       |

---

## 📚 内置 Skills

### 代码生成

| Skill                  | 描述                  |
| ---------------------- | --------------------- |
| `generate-code`        | 根据需求生成代码      |
| `generate-interface`   | 生成 OpenAPI 3.0 接口 |
| `generate-test`        | 生成测试代码          |
| `unit-test`            | 单元测试生成          |
| `integration-test`     | 集成测试生成          |
| `acceptance-test`      | 验收测试生成          |
| `lint`                 | 代码检查              |
| `type-check`           | 类型检查              |
| `build-check`          | 构建检查              |
| `error-fix`            | 自动修复错误          |
| `test-result-analyzer` | 测试结果分析          |

### 需求分析

| Skill            | 描述     |
| ---------------- | -------- |
| `analyze-demand` | 需求分析 |
| `demand-collect` | 需求采集 |
| `demand-confirm` | 需求确认 |
| `demand-clarify` | 需求澄清 |
| `smart-analysis` | 智能分析 |

### 任务规划

| Skill            | 描述         |
| ---------------- | ------------ |
| `task-decompose` | 任务拆解     |
| `task-plan`      | 生成执行计划 |
| `task-confirm`   | 确认执行计划 |
| `task-assign`    | 任务分配     |

### 测试与质量

| Skill               | 描述           |
| ------------------- | -------------- |
| `test-orchestrator` | 测试编排       |
| `test-plan`         | 生成测试计划   |
| `test-confirm`      | 确认测试计划   |
| `quality-scorer`    | 质量评分       |
| `test-fix-loop`     | 测试修复循环   |
| `code-review`       | 代码评审自动化 |

### 工具类

| Skill             | 描述        |
| ----------------- | ----------- |
| `read-file`       | 读取文件    |
| `write-file`      | 写入文件    |
| `format-code`     | 代码格式化  |
| `retry`           | 失败重试    |
| `parallel`        | 并行执行    |
| `branch`          | 条件分支    |
| `wait`            | 等待        |
| `mock-server`     | Mock 服务器 |
| `version-manager` | 版本管理    |
| `deploy`          | 部署        |

---

## 📝 代码模板

内置 8 种代码模板：

| 模板              | 描述             |
| ----------------- | ---------------- |
| `react-component` | React 函数组件   |
| `vue-component`   | Vue 组件         |
| `express-api`     | Express REST API |
| `typescript-type` | TypeScript 类型  |
| `react-hook`      | 自定义 Hook      |
| `service`         | 业务服务层       |
| `model`           | 数据模型         |
| `test`            | Jest 测试文件    |

```typescript
import { TemplateManager } from 'forge';

const tm = new TemplateManager();
const code = tm.render('react-component', {
  name: 'UserProfile',
  props: ['user', 'onEdit'],
  state: ['loading', 'error'],
});
```

---

## 🏗️ 架构

```
┌─────────────────────────────────────────────────────────────┐
│                          Forge                              │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │    Skill     │  │   Workflow   │  │   Observer   │   │
│  │   Registry   │  │  Executor    │  │   Recorder   │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  Knowledge   │  │   Storage    │  │     LLM     │   │
│  │    Base      │  │   (FS/SQL)   │  │   Bridge    │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
├─────────────────────────────────────────────────────────────┤
│                        MCP Server                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 配置

### 环境变量

| 变量            | 描述         | 默认值   |
| --------------- | ------------ | -------- |
| `SCA_DATA_PATH` | 数据存储路径 | `./data` |
| `SCA_LOG_LEVEL` | 日志级别     | `info`   |

### 配置文件 (`.sca/config.json`)

```json
{
  "version": "1.0.0",
  "dataPath": "./data",
  "logLevel": "info",
  "skills": {
    "enabled": ["*"],
    "disabled": []
  },
  "workflows": {
    "default": "full-demand-analysis"
  }
}
```

---

## 📂 项目结构

```
forge/
├── src/
│   ├── index.ts              # 入口文件
│   ├── plugin.ts             # 主插件类
│   ├── bin/cli.ts            # CLI 接口
│   ├── skill-engine/         # Skill 执行引擎
│   ├── skills/               # 内置 Skills
│   ├── storage/              # 存储层
│   ├── knowledge/            # 知识库
│   ├── observer/             # 观察者模式
│   ├── mcp/                  # MCP 服务器
│   └── utils/                # 工具函数
├── tests/                    # 测试文件
└── package.json
```

---

## 🔌 自定义 Skill 开发

```typescript
// src/skills/atoms/custom/my-skill.ts
import { BaseSkill, type SkillResult } from '../../base.skill.js';

export class MySkill extends BaseSkill {
  name = 'my-skill';
  description = '我的自定义 Skill';
  category = 'custom';

  async execute(input: Record<string, unknown>): Promise<SkillResult> {
    return {
      success: true,
      output: { result: 'Done' },
      metadata: { skill: this.name, duration: 0 },
    };
  }
}

export default new MySkill();
```

---

## ❓ 常见问题

**Q: 支持哪些 IDE？**  
A: 支持 MCP 协议的 IDE：VS Code (需 MCP 扩展)、Cursor、Zed、Claude Desktop、OpenCode。

**Q: 如何添加自定义模板？**  
A: 编辑 `src/utils/template-manager.ts`，在 `getTemplates()` 方法中添加新模板。

**Q: 如何禁用某个 Skill？**  
A: 在配置文件的 `skills.disabled` 数组中添加技能名称。

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送分支 (`git push origin feature/amazing`)
5. 创建 Pull Request

---

## 📄 许可证

[MIT License](LICENSE) - 请随意使用和修改

---

## 📋 更新日志

### v1.2.1 (2026-04-25)

- ✅ **OpenCode MCP 系统支持**: 全面升级 OpenCode MCP 集成，调试能力增强
- ✅ **自我迭代引擎**: 新增 SelfIterationEngine，支持自动优化和工作流进化
- ✅ **调试能力完善**: Logger 系统增强、错误处理优化、观察者模式改进
- ✅ **代码质量改进**: 修复 4 个 lint empty block errors，测试全部通过
- ✅ **新增 Forge MCP 工具**: `forge-route`, `forge-list-skills`, `forge-invoke-skill`, `forge-list-workflows`, `forge-self-iterate`
- ✅ **新增核心模块**: `src/core/` 目录包含 skill-router, routing-rules, knowledge-bridge, external-skill-loader
- ✅ **测试完善**: 9 个测试套件，95 个测试用例全部通过
- ✅ **构建优化**: TypeScript 编译优化，产物更稳定

### v1.2.0 (2026-03-30)

- ✅ **Forge 重塑品牌**：项目重命名和组织结构重组
- ✅ **CLI 更新**：新命令 `fg`（原 `sca`）

### v1.1.0 (2026-03-12)

- ✅ **接口契约模块**：自动生成 OpenAPI 3.0 接口定义
- ✅ **Mock 服务器支持**：内置 Express、MSW、JSON-Server Mock 服务
- ✅ **质量门禁自动化**：代码生成后自动质量检查
- ✅ **构建检查**：部署前构建验证
- ✅ **版本管理**：语义化版本支持
- ✅ **部署支持**：一键部署到本地、NPM、Docker、SSH、Vercel、Netlify
- ✅ **任务分配**：需求拆解与团队任务分配
- ✅ **代码评审**：自动化代码评审（安全、最佳实践、性能检查）
- ✅ **协作存储**：扩展 SQLite 支持团队协作
- ✅ **45+ 内置 Skills**：从 30+ 增加到 45+

### v1.0.0 (2026-02-22)

- ✅ 初始版本发布
- ✅ 需求闭环支持
- ✅ Skill 插件系统
- ✅ 知识库模块
- ✅ 观察者模式
- ✅ 文件/SQLite 双存储
- ✅ 错误处理系统
- ✅ 重试策略
- ✅ 代码模板库
- ✅ CLI 工具
- ✅ 自动升级功能
- ✅ MCP stdio 服务器

---

<div align="center">

**Made with ❤️ by Forge**

[GitHub](https://github.com/lh123aa/forge) • [报告 Bug](https://github.com/lh123aa/forge/issues) • [请求功能](https://github.com/lh123aa/forge/issues)

</div>
