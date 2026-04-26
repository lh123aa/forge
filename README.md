# Forge

<div align="center">

**Intelligent Code Generation MCP Plugin**

_Requirement Loop • Skill Plugin System • Self-Learning • Observer Iteration_

[![Node.js](https://img.shields.io/badge/Node.js-18+-green?style=flat-square)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?style=flat-square)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-orange?style=flat-square)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-1.0-purple?style=flat-square)](https://modelcontextprotocol.io/)

[English](README.md) | [中文文档](README_CN.md)

</div>

---

## ✨ Features

### 🎯 Requirement-Driven Development

Complete closed-loop from requirement collection to code generation. Support multiple project types: pages, APIs, components, and full projects.

### 🔌 Skill Plugin System

Extensible skill architecture with **45+ built-in skills**. Create custom skills easily with the BaseSkill class.

### 🧠 Self-Learning

Local knowledge base that continuously accumulates development experience. Add, search, and manage knowledge entries.

### 📊 Observer Pattern

Full runtime data recording for continuous optimization. Generate detailed reports and track execution metrics.

### 💾 Dual Storage

Support both file system storage and SQLite database. Flexible configuration for different use cases.

### 🔄 Auto-Update

Detect GitHub updates automatically. One-click upgrade with rollback support on failure.

### 🧪 Complete Testing

Built-in test generation (unit, integration, acceptance). Code quality checks with lint and type validation.

### 🚀 MCP Integration

Full MCP (Model Context Protocol) support. Works with OpenCode, Claude Desktop, and other MCP clients.

### 🛡️ Quality Gate

Automated quality checkpoints after code generation. Configurable lint, type-check, test, and security gates.

### 📡 Interface Contract

Auto-generate OpenAPI 3.0 interface definitions. Built-in Mock server support for Express, MSW, and JSON-Server.

### 🚢 Deployment Support

One-click deployment with build verification. Support for local, NPM, Docker, SSH, Vercel, and Netlify.

### 👥 Team Collaboration

Task assignment and decomposition. Code review automation with security, best-practices, and performance checks.

---

## 📦 Installation

### Quick Install

```bash
git clone https://github.com/lh123aa/forge.git
cd forge
npm install
npm run build
```

### Development Mode

```bash
npm install
npm run dev    # Watch mode
npm test       # Run tests
```

### Global CLI

```bash
npm install
npm run build
npm link       # Optional: global CLI as 'fg'
```

---

## 🚀 Quick Start

### CLI Usage

```bash
# Initialize
fg init

# Start development
fg start -t page -d "Create a user login page"

# Check for updates
fg update --check

# Perform update
fg update

# Show version
fg version
```

### Library Usage

```typescript
import Forge from 'forge';

const agent = new Forge();
await agent.initialize();

const result = await agent.start({
  projectType: 'page',
  initialDemand: 'Create a user login page',
  projectPath: './my-project',
});
```

### MCP Integration

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

## 🛠️ MCP Tools

| Tool                   | Description                 |
| ---------------------- | --------------------------- |
| `sca-start`            | Start development workflow  |
| `sca-resume`           | Resume interrupted workflow |
| `sca-get-report`       | Get runtime report          |
| `sca-add-knowledge`    | Add knowledge entry         |
| `sca-search-knowledge` | Search knowledge base       |
| `sca-list-workflows`   | List available workflows    |
| `sca-run-workflow`     | Execute a workflow          |
| `sca-submit-feedback`  | Submit user feedback        |
| `sca-check-update`     | Check for updates           |
| `sca-do-update`        | Perform auto-update         |

---

## 📚 Built-in Skills

### Code Generation

| Skill                  | Description                     |
| ---------------------- | ------------------------------- |
| `generate-code`        | Generate code from requirements |
| `generate-interface`   | Generate OpenAPI 3.0 interface  |
| `generate-test`        | Generate test code              |
| `unit-test`            | Unit test generation            |
| `integration-test`     | Integration test generation     |
| `acceptance-test`      | Acceptance test generation      |
| `lint`                 | Code linting                    |
| `type-check`           | TypeScript type checking        |
| `build-check`          | Build verification              |
| `error-fix`            | Auto-fix code errors            |
| `test-result-analyzer` | Analyze test failures           |

### Requirement Analysis

| Skill            | Description               |
| ---------------- | ------------------------- |
| `analyze-demand` | Requirement analysis      |
| `demand-collect` | Requirement collection    |
| `demand-confirm` | Requirement confirmation  |
| `demand-clarify` | Requirement clarification |
| `smart-analysis` | Smart analysis            |

### Task Planning

| Skill            | Description             |
| ---------------- | ----------------------- |
| `task-decompose` | Decompose requirements  |
| `task-plan`      | Generate execution plan |
| `task-confirm`   | Confirm task plan       |
| `task-assign`    | Assign tasks to team    |

### Testing & Quality

| Skill               | Description             |
| ------------------- | ----------------------- |
| `test-orchestrator` | Test orchestration      |
| `test-plan`         | Generate test plan      |
| `test-confirm`      | Confirm test plan       |
| `quality-scorer`    | Calculate quality score |
| `test-fix-loop`     | Test-fix iteration      |
| `code-review`       | Code review automation  |

### Utilities

| Skill             | Description        |
| ----------------- | ------------------ |
| `read-file`       | Read file content  |
| `write-file`      | Write file         |
| `format-code`     | Code formatting    |
| `retry`           | Retry on failure   |
| `parallel`        | Parallel execution |
| `branch`          | Conditional branch |
| `wait`            | Wait/sleep         |
| `mock-server`     | Mock server        |
| `version-manager` | Version management |
| `deploy`          | Deployment         |

---

## 📝 Code Templates

8 built-in templates for rapid development:

| Template          | Description                |
| ----------------- | -------------------------- |
| `react-component` | React functional component |
| `vue-component`   | Vue component              |
| `express-api`     | Express REST API           |
| `typescript-type` | TypeScript type definition |
| `react-hook`      | Custom React Hook          |
| `service`         | Business service layer     |
| `model`           | Data model                 |
| `test`            | Jest test file             |

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

## 🏗️ Architecture

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

## 🔧 Configuration

### Environment Variables

| Variable        | Description       | Default  |
| --------------- | ----------------- | -------- |
| `SCA_DATA_PATH` | Data storage path | `./data` |
| `SCA_LOG_LEVEL` | Log level         | `info`   |

### Config File (`.sca/config.json`)

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

## 📂 Project Structure

```
forge/
├── src/
│   ├── index.ts              # Entry point
│   ├── plugin.ts             # Main plugin class
│   ├── bin/cli.ts            # CLI interface
│   ├── skill-engine/         # Skill execution engine
│   ├── skills/               # Built-in skills
│   ├── storage/              # Storage layer
│   ├── knowledge/            # Knowledge base
│   ├── observer/              # Observer pattern
│   ├── mcp/                  # MCP server
│   └── utils/                # Utilities
├── tests/                    # Test files
└── package.json
```

---

## 🔌 Custom Skill Development

```typescript
// src/skills/atoms/custom/my-skill.ts
import { BaseSkill, type SkillResult } from '../../base.skill.js';

export class MySkill extends BaseSkill {
  name = 'my-skill';
  description = 'My custom skill';
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

## ❓ FAQ

**Q: Which IDEs are supported?**  
A: Any MCP-compatible IDE: VS Code (with MCP extension), Cursor, Zed, Claude Desktop, OpenCode.

**Q: How to add custom templates?**  
A: Edit `src/utils/template-manager.ts` and add templates in `getTemplates()`.

**Q: How to disable a skill?**  
A: Add skill name to `skills.disabled` array in config file.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'feat: add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

## 📄 License

[MIT License](LICENSE) - Feel free to use and modify.

---

## 📋 Changelog

### v1.3.0 (2026-04-26)

- ✅ **P0 安全增强**: 新增 SecurityAnalyzer 模块，集成 Semgrep 静态分析
  - 支持 60+ 安全漏洞检测模式
  - 涵盖: 代码注入、SQL注入、XSS、硬编码凭据、弱加密等
  - Semgrep CLI 可用时自动使用，否则回退到正则检测
  - 提供详细漏洞报告和修复建议
- ✅ **P0 Skill 依赖管理**: 新增 SkillDependencyResolver 模块
  - SkillMeta 支持 dependencies 声明
  - 循环依赖检测
  - 拓扑排序自动执行顺序规划
  - 依赖链验证
- ✅ **代码质量优化**: lint warnings 122 → 0
- ✅ **新增工具模块**:
  - `src/utils/security-analyzer.ts` - 安全分析模块
  - `src/utils/skill-dependency-resolver.ts` - 依赖解析模块
- ✅ **Skill 生命周期增强**: BaseSkill 支持 initialize/cleanup/validate 钩子
- ✅ **DIContainer**: 新增依赖注入容器，支持单例/工厂模式
- ✅ **构建验证**: 95/95 测试通过，0 lint warnings

### v1.2.1 (2026-04-25)

- ✅ **OpenCode MCP 系统支持**: 全面升级 OpenCode MCP 集成，调试能力增强
- ✅ **自我迭代引擎**: 新增 SelfIterationEngine，支持自动优化和工作流进化
- ✅ **调试能力完善**: Logger 系统增强、错误处理优化、观察者模式改进
- ✅ **代码质量改进**: 修复 4 个 lint empty block errors，121 warnings → 122 warnings
- ✅ **新增 Forge MCP 工具**: `forge-route`, `forge-list-skills`, `forge-invoke-skill`, `forge-list-workflows`, `forge-self-iterate`
- ✅ **新增核心模块**: `src/core/` 目录包含 skill-router, routing-rules, knowledge-bridge, external-skill-loader
- ✅ **测试完善**: 9 个测试套件，95 个测试用例全部通过
- ✅ **构建优化**: TypeScript 编译优化，产物更稳定

### v1.2.0 (2026-03-30)

- ✅ **Forge Rebrand**: Complete project rename and reorganization
- ✅ **CLI Update**: New `fg` command (formerly `sca`)

### v1.1.0 (2026-03-12)

- ✅ **Interface Contract Module**: Generate OpenAPI 3.0 interface definitions
- ✅ **Mock Server Support**: Built-in Mock server for Express, MSW, JSON-Server
- ✅ **Quality Gate Automation**: Configurable quality checkpoints after code generation
- ✅ **Build Verification**: Build check skill for pre-deployment validation
- ✅ **Version Management**: Semantic versioning with bump and tag support
- ✅ **Deployment Support**: One-click deploy to local, NPM, Docker, SSH, Vercel, Netlify
- ✅ **Task Assignment**: Decompose and assign tasks to team members
- ✅ **Code Review**: Automated code review with security, best-practices, performance checks
- ✅ **Collaboration Storage**: Extended SQLite storage for team collaboration
- ✅ **45+ Built-in Skills**: Increased from 30+ skills

### v1.0.0 (2026-02-22)

- ✅ Initial release
- ✅ Requirement-driven development workflow
- ✅ 30+ built-in skills
- ✅ Skill plugin system
- ✅ Knowledge base with local storage
- ✅ Observer pattern for runtime tracking
- ✅ File & SQLite dual storage
- ✅ Error handling with recovery suggestions
- ✅ Retry strategy with presets
- ✅ 8 code templates
- ✅ CLI tools (`sca` command)
- ✅ Auto-update from GitHub
- ✅ Full MCP server support

---

<div align="center">

**Made with ❤️ by Forge**

[GitHub](https://github.com/lh123aa/forge) • [Report Bug](https://github.com/lh123aa/forge/issues) • [Request Feature](https://github.com/lh123aa/forge/issues)

</div>
