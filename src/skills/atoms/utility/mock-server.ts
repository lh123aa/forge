// mock-server.skill - Mock服务管理

import { BaseSkill } from '../../../skills/base.skill.js';
import { FileStorage } from '../../../storage/index.js';
import { createLogger } from '../../../utils/logger.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import _path from 'path';
import type { SkillInput, SkillOutput } from '../../../types/index.js';

const logger = createLogger('MockServerSkill');

/**
 * Mock服务参数
 */
interface MockServerParams {
  port?: number;
  interfaceDoc?: Record<string, unknown>;
  openapiDoc?: Record<string, unknown>;
  framework?: 'express' | 'msw' | 'json-server';
  outputPath?: string;
  delay?: number;
}

/**
 * Mock服务器配置
 */
interface MockConfig {
  port: number;
  framework: string;
  outputPath: string;
  endpoints: MockEndpoint[];
  delay?: number;
}

/**
 * Mock端点配置
 */
interface MockEndpoint {
  path: string;
  method: string;
  response: Record<string, unknown>;
  delay?: number;
  statusCode?: number;
}

/**
 * Mock服务 Skill
 * 生成可运行的 Mock 服务器代码，支持 Express、MSW、JSON-Server
 */
export class MockServerSkill extends BaseSkill {
  readonly meta = {
    name: 'mock-server',
    description: '根据接口定义生成可运行的 Mock 服务器，支持 Express、MSW、JSON-Server',
    category: 'utility' as const,
    version: '1.0.0',
    tags: ['mock', 'server', 'api', 'test', 'development'],
  };

  private storage: FileStorage;

  constructor() {
    super();
    this.storage = new FileStorage();
  }

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    const params = input.task.params as MockServerParams;
    const {
      port = 3001,
      interfaceDoc,
      openapiDoc,
      framework = 'express',
      outputPath = './mock-server',
      delay = 0,
    } = params;

    // 优先使用 openapiDoc，其次使用 interfaceDoc
    const doc = openapiDoc || interfaceDoc;
    if (!doc) {
      return this.fatalError('缺少接口文档 interfaceDoc 或 openapiDoc 参数');
    }

    try {
      // 解析接口文档
      const endpoints = this.parseEndpoints(doc, delay);
      
      // 生成 Mock 服务器代码
      const generatedFiles = await this.generateMockServer({
        port,
        framework,
        outputPath,
        endpoints,
        delay,
      }, doc);

      return this.success({
        config: {
          port,
          framework,
          outputPath,
          endpointCount: endpoints.length,
          endpoints: endpoints.map(e => ({
            path: e.path,
            method: e.method,
            responseStatus: e.statusCode || 200,
          })),
        },
        generatedFiles,
        endpoints: endpoints.map(e => ({
          path: e.path,
          method: e.method,
          responseStatus: e.statusCode || 200,
        })),
        startCommand: this.getStartCommand(framework, outputPath),
        generatedAt: new Date().toISOString(),
      }, `Mock 服务生成完成: ${endpoints.length} 个接口 (${framework})`);

    } catch (error) {
      logger.error('Mock 服务生成失败', { error });
      return this.retryableError(`Mock 服务生成失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 解析接口文档，提取端点信息
   */
  private parseEndpoints(doc: Record<string, unknown>, defaultDelay?: number): MockEndpoint[] {
    const endpoints: MockEndpoint[] = [];
    const paths = doc.paths as Record<string, Record<string, unknown>> | undefined;

    if (!paths) {
      return endpoints;
    }

    for (const [path, methods] of Object.entries(paths)) {
      for (const [method, details] of Object.entries(methods)) {
        const detail = details as Record<string, unknown>;
        
        // 提取响应模板
        const response = this.extractResponseTemplate(detail.response as Record<string, unknown>);
        
        // 添加延迟
        const endpointDelay = detail.delay as number | undefined || defaultDelay;

        endpoints.push({
          path,
          method: method.toUpperCase(),
          response,
          delay: endpointDelay,
          statusCode: detail.statusCode as number | undefined,
        });
      }
    }

    return endpoints;
  }

  /**
   * 提取响应模板
   */
  private extractResponseTemplate(response: Record<string, unknown>): Record<string, unknown> {
    if (!response) {
      return { code: 200, message: 'Success', data: null };
    }

    // 优先使用 200 响应
    const successResponse = response['200'] as Record<string, unknown> | undefined;
    if (successResponse) {
      return {
        code: 200,
        message: 'Success',
        data: (successResponse.schema as Record<string, unknown>) || null,
      };
    }

    // 返回默认成功响应
    return { code: 200, message: 'Success', data: null };
  }

  /**
   * 生成 Mock 服务器文件
   */
  private async generateMockServer(
    config: MockConfig,
    doc: Record<string, unknown>
  ): Promise<Record<string, string>> {
    const files: Record<string, string> = {};

    switch (config.framework) {
      case 'express':
        Object.assign(files, await this.generateExpressMock(config, doc));
        break;
      case 'msw':
        Object.assign(files, await this.generateMSWMock(config, doc));
        break;
      case 'json-server':
        Object.assign(files, await this.generateJSONServerMock(config, doc));
        break;
      default:
        Object.assign(files, await this.generateExpressMock(config, doc));
    }

    // 生成 package.json
    files['package.json'] = this.generatePackageJson(config);

    return files;
  }

  /**
   * 生成 Express Mock 服务器
   */
  private async generateExpressMock(
    config: MockConfig,
    doc: Record<string, unknown>
  ): Promise<Record<string, string>> {
    const routes = config.endpoints.map(endpoint => {
      const delay = endpoint.delay || 0;
      return `
app.${endpoint.method.toLowerCase()}('${endpoint.path}', async (req, res) => {
  ${delay > 0 ? `await new Promise(resolve => setTimeout(resolve, ${delay}));` : ''}
  
  // Mock response for ${endpoint.method} ${endpoint.path}
  res.status(${endpoint.statusCode || 200}).json(${JSON.stringify(endpoint.response, null, 2)});
});`;
    }).join('\n');

    const serverCode = `// Mock Server - Express
// Generated by Smart Code Agent
// API: ${(doc.info as Record<string, unknown>)?.title || 'API Service'}

const express = require('express');
const cors = require('cors');
const app = express();
const PORT = ${config.port};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(\`[\${new Date().toISOString()}] \${req.method} \${req.path}\`);
  next();
});

// Routes
${routes}

// Default route
app.get('/', (req, res) => {
  res.json({
    name: '${(doc.info as Record<string, unknown>)?.title || 'Mock API'}',
    version: '${(doc.info as Record<string, unknown>)?.version || '1.0.0'}',
    description: '${(doc.info as Record<string, unknown>)?.description || 'Mock Server'}',
    endpoints: ${config.endpoints.length},
    baseUrl: \`http://localhost:\${PORT}\`,
  });
});

// Start server
app.listen(PORT, () => {
  console.log('');
  console.log('========================================');
  console.log('   Mock Server Running');
  console.log('========================================');
  console.log(\`   URL: http://localhost:\${PORT}\`);
  console.log(\`   API: http://localhost:\${PORT}/api\`);
  console.log('========================================');
  console.log('');
});

module.exports = app;
`;

    return {
      'server.js': serverCode,
      'routes.js': `// Routes module\n${routes}\n`,
    };
  }

  /**
   * 生成 MSW (Mock Service Worker) 配置
   */
  private async generateMSWMock(
    config: MockConfig,
    _doc: Record<string, unknown>
  ): Promise<Record<string, string>> {
    const handlers = config.endpoints.map(endpoint => {
      const responseJson = JSON.stringify(endpoint.response, null, 2).replace(/\n/g, '\n  ');
      
      return `  ${endpoint.method.toLowerCase}('${endpoint.path}', (req, res, ctx) => {
    return res(
      ctx.status(${endpoint.statusCode || 200}),
      ctx.json(${responseJson})
    );
  }),`;
    }).join('\n');

    const browserCode = `// browser.js - MSW Browser Setup
// Generated by Smart Code Agent

import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);
`;

    const nodeCode = `// node.js - MSW Node Setup (for testing)
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
`;

    const handlersCode = `// handlers.js - MSW Request Handlers
// Generated by Smart Code Agent

import { http, HttpResponse } from 'msw';

export const handlers = [
${handlers}
];
`;

    return {
      'src/browser.js': browserCode,
      'src/node.js': nodeCode,
      'src/handlers.js': handlersCode,
    };
  }

  /**
   * 生成 JSON-Server 配置
   */
  private async generateJSONServerMock(
    config: MockConfig,
    _doc: Record<string, unknown>
  ): Promise<Record<string, string>> {
    // 从接口定义生成 Mock 数据
    const mockData: Record<string, unknown[]> = {};
    
    for (const endpoint of config.endpoints) {
      // 从路径提取资源名，如 /users -> users
      const match = endpoint.path.match(/\/([a-zA-Z]+)/);
      if (match) {
        const resource = match[1];
        if (!mockData[resource]) {
          mockData[resource] = [];
        }
        // 生成示例数据
        mockData[resource].push({
          id: Math.random().toString(36).substr(2, 9),
          ...(endpoint.response.data as Record<string, unknown> || {}),
          createdAt: new Date().toISOString(),
        });
      }
    }

    const dbCode = `// db.json - JSON-Server Mock Data
// Generated by Smart Code Agent

${JSON.stringify(mockData, null, 2)}
`;

    const routesCode = `// routes.json - Custom Routes
// Generated by Smart Code Agent

{
  "/api/*": "/$1"
}
`;

    return {
      'db.json': dbCode,
      'routes.json': routesCode,
    };
  }

  /**
   * 生成 package.json
   */
  private generatePackageJson(config: MockConfig): string {
    const deps: Record<string, string> = {};
    const devDeps: Record<string, string> = {};

    switch (config.framework) {
      case 'express':
        deps.express = '^4.18.2';
        deps.cors = '^2.8.5';
        break;
      case 'msw':
        devDeps.msw = '^2.0.0';
        break;
      case 'json-server':
        deps['json-server'] = '^0.17.4';
        break;
    }

    return JSON.stringify({
      name: 'iflow-mock-server',
      version: '1.0.0',
      description: 'Mock server generated by Smart Code Agent',
      main: config.framework === 'express' ? 'server.js' : 'index.js',
      scripts: {
        start: config.framework === 'json-server' 
          ? 'json-server --watch db.json --routes routes.json --port ' + config.port
          : 'node ' + (config.framework === 'express' ? 'server.js' : 'index.js'),
        dev: config.framework === 'express'
          ? 'node server.js'
          : 'npm start',
      },
      dependencies: deps,
      devDependencies: devDeps,
    }, null, 2);
  }

  /**
   * 获取启动命令
   */
  private getStartCommand(framework: string, outputPath: string): string {
    switch (framework) {
      case 'express':
        return `cd ${outputPath} && npm install && npm start`;
      case 'msw':
        return `cd ${outputPath} && npm install && npx msw init public --save && npm run build`;
      case 'json-server':
        return `cd ${outputPath} && npm install && npm start`;
      default:
        return `cd ${outputPath} && npm install && npm start`;
    }
  }
}

// 导出实例
export default new MockServerSkill();
