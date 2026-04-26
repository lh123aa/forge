// file-io.skill - 文件操作Skill（增强版）

import fs from 'fs/promises';
import path from 'path';
import { BaseSkill } from '../../base.skill.js';
import type { SkillInput, SkillOutput } from '../../../types/index.js';

interface FileIOParams {
  operation: 'write' | 'read' | 'delete' | 'copy' | 'move' | 'exists' | 'list' | 'mkdir';
  filePath?: string;
  content?: string;
  encoding?: BufferEncoding;
  createDir?: boolean;
  overwrite?: boolean;
  targetPath?: string;
  pattern?: string;
  recursive?: boolean;
}

interface FileInfo {
  path: string;
  name: string;
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  extension?: string;
  modifiedTime?: string;
}

/**
 * 文件操作 Skill（增强版）
 * 支持多种文件操作：写入、读取、删除、复制、移动、exists、列表、创建目录
 */
export class FileIOSkill extends BaseSkill {
  readonly meta = {
    name: 'file-io',
    description: '文件操作Skill，支持读写删复制移动等操作',
    category: 'io' as const,
    version: '2.0.0',
    tags: ['file', 'io', 'read', 'write', 'delete', 'copy', 'move'],
  };

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    const params = input.task.params as unknown as FileIOParams;
    const { operation, filePath } = params;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _createDir = params.createDir ?? true;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _overwrite = params.overwrite ?? false;

    if (!operation) {
      return this.fatalError('缺少操作类型 operation 参数');
    }

    if (!filePath && operation !== 'list') {
      return this.fatalError('缺少文件路径 filePath 参数');
    }

    try {
      switch (operation) {
        case 'write':
          return await this.writeFile(params);
        case 'read':
          return await this.readFile(params);
        case 'delete':
          return await this.deleteFile(params);
        case 'copy':
          return await this.copyFile(params);
        case 'move':
          return await this.moveFile(params);
        case 'exists':
          return await this.checkExists(params);
        case 'list':
          return await this.listFiles(params);
        case 'mkdir':
          return await this.createDirectory(params);
        default:
          return this.fatalError(`不支持的操作类型: ${operation}`);
      }
    } catch (error) {
      return this.fatalError(`文件操作失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 写入文件
   */
  private async writeFile(params: FileIOParams): Promise<SkillOutput> {
    const { filePath, content, encoding = 'utf-8', createDir = true, overwrite = false } = params;

    if (content === undefined) {
      return this.fatalError('缺少文件内容 content 参数');
    }

    if (!filePath) {
      return this.fatalError('缺少文件路径 filePath 参数');
    }

    // 检查文件是否存在
    if (!overwrite) {
      try {
        await fs.access(filePath);
        return this.fatalError(`文件已存在: ${filePath}，设置 overwrite=true 覆盖`);
      } catch {
        // 文件不存在，继续写入
      }
    }

    // 确保目录存在
    if (createDir) {
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
    }

    // 写入文件
    await fs.writeFile(filePath, content, { encoding });

    // 获取文件信息
    const stats = await fs.stat(filePath);

    return this.success({
      operation: 'write',
      path: filePath,
      name: path.basename(filePath),
      size: stats.size,
      written: content.length,
    }, `成功写入文件: ${filePath}`);
  }

  /**
   * 读取文件
   */
  private async readFile(params: FileIOParams): Promise<SkillOutput> {
    const { filePath, encoding = 'utf-8' } = params;

    if (!filePath) {
      return this.fatalError('缺少文件路径 filePath 参数');
    }

    // 检查文件是否存在
    try {
      await fs.access(filePath);
    } catch {
      return this.fatalError(`文件不存在: ${filePath}`);
    }

    // 读取文件
    const content = await fs.readFile(filePath, { encoding: encoding as BufferEncoding });
    const stats = await fs.stat(filePath);

    return this.success({
      operation: 'read',
      path: filePath,
      name: path.basename(filePath),
      content,
      size: stats.size,
      lines: content.split('\n').length,
    }, `成功读取文件: ${filePath}`);
  }

  /**
   * 删除文件
   */
  private async deleteFile(params: FileIOParams): Promise<SkillOutput> {
    const { filePath, recursive = false } = params;

    if (!filePath) {
      return this.fatalError('缺少文件路径 filePath 参数');
    }

    // 检查文件是否存在
    try {
      const stats = await fs.stat(filePath);
      
      if (stats.isDirectory()) {
        await fs.rm(filePath, { recursive });
      } else {
        await fs.unlink(filePath);
      }
    } catch (error) {
      return this.fatalError(`删除失败: ${filePath} - ${error instanceof Error ? error.message : String(error)}`);
    }

    return this.success({
      operation: 'delete',
      path: filePath,
      name: path.basename(filePath),
    }, `成功删除: ${filePath}`);
  }

  /**
   * 复制文件
   */
  private async copyFile(params: FileIOParams): Promise<SkillOutput> {
    const { filePath, targetPath, createDir = true } = params;

    if (!filePath || !targetPath) {
      return this.fatalError('缺少源文件路径 filePath 或目标路径 targetPath');
    }

    // 检查源文件是否存在
    try {
      await fs.access(filePath);
    } catch {
      return this.fatalError(`源文件不存在: ${filePath}`);
    }

    // 确保目标目录存在
    if (createDir) {
      const targetDir = path.dirname(targetPath);
      await fs.mkdir(targetDir, { recursive: true });
    }

    // 复制文件
    await fs.copyFile(filePath, targetPath);

    // 获取目标文件信息
    const stats = await fs.stat(targetPath);

    return this.success({
      operation: 'copy',
      sourcePath: filePath,
      targetPath,
      name: path.basename(targetPath),
      size: stats.size,
    }, `成功复制文件: ${filePath} -> ${targetPath}`);
  }

  /**
   * 移动文件
   */
  private async moveFile(params: FileIOParams): Promise<SkillOutput> {
    const { filePath, targetPath, createDir = true } = params;

    if (!filePath || !targetPath) {
      return this.fatalError('缺少源文件路径 filePath 或目标路径 targetPath');
    }

    // 检查源文件是否存在
    try {
      await fs.access(filePath);
    } catch {
      return this.fatalError(`源文件不存在: ${filePath}`);
    }

    // 确保目标目录存在
    if (createDir) {
      const targetDir = path.dirname(targetPath);
      await fs.mkdir(targetDir, { recursive: true });
    }

    // 移动文件
    await fs.rename(filePath, targetPath);

    return this.success({
      operation: 'move',
      sourcePath: filePath,
      targetPath,
      name: path.basename(targetPath),
    }, `成功移动文件: ${filePath} -> ${targetPath}`);
  }

  /**
   * 检查文件是否存在
   */
  private async checkExists(params: FileIOParams): Promise<SkillOutput> {
    const { filePath } = params;

    if (!filePath) {
      return this.fatalError('缺少文件路径 filePath 参数');
    }

    let exists = false;
    let isDirectory = false;
    let isFile = false;

    try {
      const stats = await fs.stat(filePath);
      exists = true;
      isDirectory = stats.isDirectory();
      isFile = stats.isFile();
    } catch {
      exists = false;
    }

    return this.success({
      operation: 'exists',
      path: filePath,
      exists,
      isDirectory,
      isFile,
    }, exists ? `文件存在: ${filePath}` : `文件不存在: ${filePath}`);
  }

  /**
   * 列出文件
   */
  private async listFiles(params: FileIOParams): Promise<SkillOutput> {
    const { filePath = '.', pattern, recursive = false } = params;

    // 检查目录是否存在
    let stats;
    try {
      stats = await fs.stat(filePath);
    } catch {
      return this.fatalError(`目录不存在: ${filePath}`);
    }

    if (!stats.isDirectory()) {
      return this.fatalError(`不是目录: ${filePath}`);
    }

    // 列出文件
    const files = await this.listDirectory(filePath, pattern, recursive);

    return this.success({
      operation: 'list',
      path: filePath,
      files,
      count: files.length,
    }, `列出文件完成: ${filePath}，共 ${files.length} 个文件/目录`);
  }

  /**
   * 列出目录内容
   */
  private async listDirectory(dirPath: string, pattern?: string, recursive = false): Promise<FileInfo[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files: FileInfo[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      // 如果有模式匹配
      if (pattern) {
        const regex = new RegExp(pattern);
        if (!regex.test(entry.name)) {
          continue;
        }
      }

      const stats = await fs.stat(fullPath);
      
      files.push({
        path: fullPath,
        name: entry.name,
        size: stats.size,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
        extension: entry.isFile() ? path.extname(entry.name) : undefined,
        modifiedTime: stats.mtime.toISOString(),
      });

      // 递归处理子目录
      if (recursive && entry.isDirectory()) {
        const subFiles = await this.listDirectory(fullPath, pattern, true);
        files.push(...subFiles);
      }
    }

    return files;
  }

  /**
   * 创建目录
   */
  private async createDirectory(params: FileIOParams): Promise<SkillOutput> {
    const { filePath, recursive = true } = params;

    if (!filePath) {
      return this.fatalError('缺少目录路径 filePath 参数');
    }

    await fs.mkdir(filePath, { recursive });

    return this.success({
      operation: 'mkdir',
      path: filePath,
      name: path.basename(filePath),
    }, `成功创建目录: ${filePath}`);
  }
}

// 导出实例
export default new FileIOSkill();