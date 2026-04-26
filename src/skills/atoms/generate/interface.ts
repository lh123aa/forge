// generate-interface.skill - 生成API接口定义

import { BaseSkill } from '../../../skills/base.skill.js';
import { LLMBridge } from '../../../mcp/llm-bridge.js';
import { createLogger } from '../../../utils/logger.js';
import type { SkillInput, SkillOutput } from '../../../types/index.js';

const logger = createLogger('GenerateInterfaceSkill');

/**
 * 接口生成参数
 */
interface InterfaceGenParams {
  demand?: string;
  analysis?: Record<string, unknown>;
  framework?: 'express' | 'fastify' | 'koa' | 'nest';
  language?: string;
  apiPrefix?: string;
}

/**
 * 接口定义结构
 */
interface EndpointDefinition {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  summary: string;
  description?: string;
  requestBody?: {
    contentType: string;
    schema: Record<string, unknown>;
    required: boolean;
  };
  requestParams?: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;
  requestHeaders?: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;
  response: {
    [statusCode: string]: {
      description: string;
      schema: Record<string, unknown>;
    };
  };
  auth?: {
    type: 'bearer' | 'basic' | 'apiKey' | 'none';
    required: boolean;
  };
  tags?: string[];
}

/**
 * 生成的接口文档结构
 */
interface GeneratedInterfaceDoc {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{
    url: string;
    description: string;
  }>;
  paths: Record<string, Record<string, EndpointDefinition>>;
  components?: {
    schemas: Record<string, unknown>;
  };
  tags: Array<{
    name: string;
    description: string;
  }>;
}

/**
 * 生成接口定义 Skill
 * 根据需求自动生成 OpenAPI 3.0 接口文档
 */
export class GenerateInterfaceSkill extends BaseSkill {
  readonly meta = {
    name: 'generate-interface',
    description: '根据需求自动生成 OpenAPI 3.0 接口定义文档',
    category: 'generate' as const,
    version: '1.0.0',
    tags: ['generate', 'interface', 'api', 'openapi', 'swagger'],
  };

  private llmBridge: LLMBridge;

  constructor() {
    super();
    this.llmBridge = new LLMBridge();
  }

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    const params = input.task.params as InterfaceGenParams;
    const { 
      demand,
      analysis,
      framework = 'express',
      language = 'typescript',
      apiPrefix = '/api/v1',
    } = params;

    if (!demand && !analysis) {
      return this.fatalError('缺少需求内容 demand 或 analysis 参数');
    }

    try {
      // 从需求或分析结果中提取接口信息
      const interfaceInfo = await this.extractInterfaceInfo(params);

      // 生成 OpenAPI 文档
      const openapiDoc = this.generateOpenAPIDocument(interfaceInfo, apiPrefix);

      // 生成对应框架的代码
      const frameworkCode = await this.generateFrameworkCode(openapiDoc, framework, language);

      return this.success({
        document: openapiDoc,
        framework: framework,
        language: language,
        endpoints: this.countEndpoints(openapiDoc),
        generatedAt: new Date().toISOString(),
        frameworkCode,
      }, `接口定义生成完成: ${this.countEndpoints(openapiDoc)} 个接口`);

    } catch (error) {
      logger.error('接口定义生成失败', { error });
      return this.retryableError(`接口定义生成失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 从需求中提取接口信息
   */
  private async extractInterfaceInfo(params: InterfaceGenParams): Promise<{
    title: string;
    description: string;
    endpoints: EndpointDefinition[];
    schemas: Record<string, unknown>;
  }> {
    const { demand, analysis } = params;

    // 如果有分析结果，直接使用
    if (analysis && typeof analysis === 'object') {
      const analysisAny = analysis as Record<string, unknown>;
      return {
        title: (analysisAny.apiName as string) || 'API Service',
        description: (analysisAny.description as string) || (demand as string),
        endpoints: (analysisAny.endpoints as EndpointDefinition[]) || [],
        schemas: (analysisAny.schemas as Record<string, unknown>) || {},
      };
    }

    // 使用 LLM 提取接口信息
    if (this.llmBridge.isAvailable()) {
      return await this.extractWithLLM(demand as string);
    }

    // 降级：使用默认模板
    return this.generateDefaultInterfaces(demand as string);
  }

  /**
   * 使用 LLM 提取接口信息
   */
  private async extractWithLLM(demand: string): Promise<{
    title: string;
    description: string;
    endpoints: EndpointDefinition[];
    schemas: Record<string, unknown>;
  }> {
    const prompt = `请分析以下需求，提取出需要开发的 API 接口列表。

需求内容：
${demand}

请按照以下 JSON 格式输出接口定义（必须是合法的 JSON）：
{
  "title": "API服务名称",
  "description": "API服务描述",
  "endpoints": [
    {
      "path": "/users",
      "method": "GET",
      "summary": "获取用户列表",
      "description": "获取所有用户的列表，支持分页",
      "requestParams": [
        {"name": "page", "type": "number", "required": false, "description": "页码"},
        {"name": "pageSize", "type": "number", "required": false, "description": "每页数量"}
      ],
      "response": {
        "200": {"description": "成功", "schema": {"type": "array", "items": {"$ref": "#/components/schemas/User"}}},
        "400": {"description": "请求参数错误", "schema": {"$ref": "#/components/schemas/Error"}}
      },
      "auth": {"type": "bearer", "required": true},
      "tags": ["用户"]
    }
  ],
  "schemas": {
    "User": {"type": "object", "properties": {"id": {"type": "string"}, "name": {"type": "string"}}},
    "Error": {"type": "object", "properties": {"code": {"type": "number"}, "message": {"type": "string"}}}
  }
}`;

    try {
      const result = await this.llmBridge.complete(prompt);
      const cleaned = this.cleanJSONResponse(result);
      const parsed = JSON.parse(cleaned);
      
      return {
        title: parsed.title || 'API Service',
        description: parsed.description || '',
        endpoints: parsed.endpoints || [],
        schemas: parsed.schemas || {},
      };
    } catch (error) {
      logger.warn('LLM 提取接口信息失败，使用默认模板', { error });
      return this.generateDefaultInterfaces(demand);
    }
  }

  /**
   * 清理 LLM 返回的 JSON
   */
  private cleanJSONResponse(text: string): string {
    let cleaned = text.trim();
    // 移除 markdown 代码块标记
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    return cleaned.trim();
  }

  /**
   * 生成默认接口模板
   */
  private generateDefaultInterfaces(demand: string): {
    title: string;
    description: string;
    endpoints: EndpointDefinition[];
    schemas: Record<string, unknown>;
  } {
    const defaultEndpoints: EndpointDefinition[] = [
      {
        path: '/items',
        method: 'GET',
        summary: '获取列表',
        description: '获取资源列表，支持分页和筛选',
        requestParams: [
          { name: 'page', type: 'number', required: false, description: '页码，默认1' },
          { name: 'pageSize', type: 'number', required: false, description: '每页数量，默认20' },
          { name: 'keyword', type: 'string', required: false, description: '搜索关键词' },
        ],
        response: {
          200: { description: '成功', schema: { type: 'object', properties: { list: { type: 'array' }, total: { type: 'number' } } } },
          400: { description: '请求错误', schema: { type: 'object', properties: { code: { type: 'number' }, message: { type: 'string' } } } },
        },
        auth: { type: 'bearer', required: false },
        tags: ['通用'],
      },
      {
        path: '/items/{id}',
        method: 'GET',
        summary: '获取详情',
        description: '根据ID获取资源详情',
        requestParams: [
          { name: 'id', type: 'string', required: true, description: '资源ID' },
        ],
        response: {
          200: { description: '成功', schema: { type: 'object', properties: { id: { type: 'string' }, data: { type: 'object' } } } },
          404: { description: '资源不存在', schema: { type: 'object', properties: { code: { type: 'number' }, message: { type: 'string' } } } },
        },
        auth: { type: 'bearer', required: false },
        tags: ['通用'],
      },
      {
        path: '/items',
        method: 'POST',
        summary: '创建资源',
        description: '创建一个新的资源',
        requestBody: {
          contentType: 'application/json',
          schema: { type: 'object', additionalProperties: true },
          required: true,
        },
        response: {
          201: { description: '创建成功', schema: { type: 'object', properties: { id: { type: 'string' } } } },
          400: { description: '请求错误', schema: { type: 'object', properties: { code: { type: 'number' }, message: { type: 'string' } } } },
        },
        auth: { type: 'bearer', required: true },
        tags: ['通用'],
      },
    ];

    return {
      title: 'API Service',
      description: demand,
      endpoints: defaultEndpoints,
      schemas: {
        Error: {
          type: 'object',
          properties: {
            code: { type: 'integer', description: '错误码' },
            message: { type: 'string', description: '错误信息' },
          },
          required: ['code', 'message'],
        },
      },
    };
  }

  /**
   * 生成 OpenAPI 文档
   */
  private generateOpenAPIDocument(
    interfaceInfo: { title: string; description: string; endpoints: EndpointDefinition[]; schemas: Record<string, unknown> },
    apiPrefix: string
  ): GeneratedInterfaceDoc {
    const paths: Record<string, Record<string, EndpointDefinition>> = {};
    const tagsMap: Map<string, string> = new Map();

    // 构建 paths
    for (const endpoint of interfaceInfo.endpoints) {
      const fullPath = endpoint.path.startsWith('/') 
        ? `${apiPrefix}${endpoint.path}` 
        : `${apiPrefix}/${endpoint.path}`;

      if (!paths[fullPath]) {
        paths[fullPath] = {};
      }

      paths[fullPath][endpoint.method.toLowerCase()] = endpoint;

      // 收集 tags
      if (endpoint.tags) {
        for (const tag of endpoint.tags) {
          tagsMap.set(tag, `${tag}相关接口`);
        }
      }
    }

    return {
      openapi: '3.0.3',
      info: {
        title: interfaceInfo.title,
        version: '1.0.0',
        description: interfaceInfo.description,
      },
      servers: [
        {
          url: 'http://localhost:3000',
          description: '开发环境',
        },
      ],
      paths,
      components: {
        schemas: interfaceInfo.schemas,
      },
      tags: Array.from(tagsMap.entries()).map(([name, description]) => ({
        name,
        description,
      })),
    };
  }

  /**
   * 生成框架代码
   */
  private async generateFrameworkCode(
    doc: GeneratedInterfaceDoc,
    framework: string,
    language: string
  ): Promise<Record<string, string>> {
    const code: Record<string, string> = {};

    switch (framework) {
      case 'express':
        code.main = this.generateExpressServer(doc, language);
        code.routes = this.generateExpressRoutes(doc, language);
        break;
      case 'fastify':
        code.main = this.generateFastifyServer(doc, language);
        break;
      case 'nest':
        code.module = this.generateNestModule(doc, language);
        break;
      default:
        code.main = this.generateExpressServer(doc, language);
    }

    return code;
  }

  /**
   * 生成 Express 服务器代码
   */
  private generateExpressServer(doc: GeneratedInterfaceDoc, language: string): string {
    const routes = Object.keys(doc.paths).map(path => {
      const methods = Object.keys(doc.paths[path]);
      return `  // ${path}: ${methods.join(', ')}`;
    }).join('\n');

    if (language === 'typescript') {
      return `// ${doc.info.title} - Express Server
// Generated by Smart Code Agent
// Version: ${doc.info.version}

import express, { Request, Response, NextFunction } from 'express';
import { routes } from './routes';

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Routes
${routes}

// Error handling
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    code: 500,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Server running on http://localhost:\${PORT}\`);
  console.log('API Documentation: http://localhost:\${PORT}/api-docs');
});

export default app;
`;
    }

    return `// ${doc.info.title} - Express Server
const express = require('express');
const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Server running on http://localhost:\${PORT}\`);
});
`;
  }

  /**
   * 生成 Express 路由代码
   */
  private generateExpressRoutes(doc: GeneratedInterfaceDoc, language: string): string {
    const routes: string[] = [];

    for (const [path, methods] of Object.entries(doc.paths)) {
      for (const [method, endpoint] of Object.entries(methods)) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _handlerName = `${method}${path.replace(/\//g, '_').replace(/\{/g, '').replace(/}/g, '')}`;
        
        routes.push(`
/**
 * ${endpoint.summary}
 * ${endpoint.description || ''}
 */
app.${method}('${path}', async (req, res) => {
  try {
    // TODO: Implement ${endpoint.summary}
    res.json({
      code: 200,
      message: 'Success',
      data: null,
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: error instanceof Error ? error.message : 'Internal error',
    });
  }
});`);
      }
    }

    if (language === 'typescript') {
      return `// Routes
${routes.join('\n')}

export {};
`;
    }

    return `// Routes
${routes.join('\n')};
`;
  }

  /**
   * 生成 Fastify 服务器代码
   */
  private generateFastifyServer(doc: GeneratedInterfaceDoc, language: string): string {
    if (language === 'typescript') {
      return `// ${doc.info.title} - Fastify Server
import Fastify from 'fastify';

const fastify = Fastify({
  logger: true,
});

// Register routes
// TODO: Import and register routes

const start = async () => {
  try {
    await fastify.listen({ port: 3000 });
    console.log('Server running at http://localhost:3000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
`;
    }
    return '';
  }

  /**
   * 生成 NestJS 模块代码
   */
  private generateNestModule(doc: GeneratedInterfaceDoc, language: string): string {
    const controllerName = doc.info.title.replace(/\s+/g, '') + 'Controller';
    
    if (language === 'typescript') {
      return `// ${doc.info.title} - NestJS Controller
import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';

@Controller('${doc.servers[0]?.url.replace('/api/v1', '') || ''}')
export class ${controllerName} {
${Object.entries(doc.paths).map(([path, methods]) => {
  const operations = Object.entries(methods).map(([method, endpoint]) => {
    const nestMethod = method.toUpperCase();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _params = this.getNestParams(endpoint);
    return `  @${nestMethod}('${path}')`;
  }).join('\n');
  return operations;
}).join('\n\n')}
}
`;
    }
    return '';
  }

  /**
   * 获取 NestJS 参数装饰器
   */
  private getNestParams(endpoint: EndpointDefinition): string {
    const params: string[] = [];
    
    if (endpoint.requestParams) {
      for (const param of endpoint.requestParams) {
        if (param.required) {
          params.push(`@Param('${param.name}') ${param.name}: ${param.type}`);
        } else {
          params.push(`@Query('${param.name}') ${param.name}?: ${param.type}`);
        }
      }
    }
    
    if (endpoint.requestBody) {
      params.push(`@Body() body: any`);
    }
    
    return params.join(', ');
  }

  /**
   * 统计接口数量
   */
  private countEndpoints(doc: GeneratedInterfaceDoc): number {
    let count = 0;
    for (const methods of Object.values(doc.paths)) {
      count += Object.keys(methods).length;
    }
    return count;
  }
}

// 导出实例
export default new GenerateInterfaceSkill();
