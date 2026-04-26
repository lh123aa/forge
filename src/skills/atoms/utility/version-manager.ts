// version-manager.skill - 版本号管理
// 管理和更新项目版本号，支持语义化版本

import { BaseSkill } from '../../base.skill.js';
import { createLogger } from '../../../utils/logger.js';
import { FileStorage } from '../../../storage/index.js';
import type { SkillInput, SkillOutput } from '../../../types/index.js';

const logger = createLogger('VersionManagerSkill');

/**
 * 版本管理参数
 */
interface VersionManagerParams {
  projectPath?: string;
  action: 'get' | 'bump' | 'set' | 'tag';
  bumpType?: 'major' | 'minor' | 'patch' | 'prerelease';
  version?: string;
  tagPrefix?: string;
  changelog?: string;
}

/**
 * 版本信息
 */
interface VersionInfo {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  version: string;
  formatted: string;
}

/**
 * 版本管理 Skill
 * 管理和更新项目版本号，支持语义化版本规范
 */
export class VersionManagerSkill extends BaseSkill {
  readonly meta = {
    name: 'version-manager',
    description: '版本管理 - 管理项目版本号，支持语义化版本',
    category: 'utility' as const,
    version: '1.0.0',
    tags: ['version', 'semver', 'release', 'tag', 'bump'],
  };

  private storage: FileStorage;

  constructor() {
    super();
    this.storage = new FileStorage();
  }

  protected async execute(input: SkillInput): Promise<SkillOutput> {
    const params = input.task.params as unknown as VersionManagerParams;
    const {
      projectPath = process.cwd(),
      action = 'get',
      bumpType = 'patch',
      version,
      tagPrefix = 'v',
      changelog,
    } = params;

    logger.info('Version manager action', { projectPath, action, bumpType });

    try {
      switch (action) {
        case 'get':
          return await this.getVersion(projectPath);

        case 'bump':
          return await this.bumpVersion(projectPath, bumpType, changelog);

        case 'set':
          if (!version) {
            return this.fatalError('设置版本号时必须提供 version 参数');
          }
          return await this.setVersion(projectPath, version, changelog);

        case 'tag':
          return await this.createTag(projectPath, tagPrefix);

        default:
          return this.fatalError(`不支持的操作: ${action}`);
      }
    } catch (error) {
      logger.error('Version manager failed', { error });
      return this.fatalError(
        `版本管理失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 获取当前版本
   */
  private async getVersion(projectPath: string): Promise<SkillOutput> {
    const versionInfo = await this.readVersion(projectPath);

    return this.success(
      {
        currentVersion: versionInfo,
        versionFile: `${projectPath}/package.json`,
      },
      `当前版本: ${versionInfo.version}`
    );
  }

  /**
   * 升级版本号
   */
  private async bumpVersion(
    projectPath: string,
    bumpType: 'major' | 'minor' | 'patch' | 'prerelease',
    changelog?: string
  ): Promise<SkillOutput> {
    const currentVersion = await this.readVersion(projectPath);
    const newVersionStr = this.calculateBump(currentVersion.version, bumpType);

    // 更新 package.json
    await this.updateVersionInFile(projectPath, newVersionStr);

    // 生成 changelog
    if (changelog) {
      await this.appendChangelog(projectPath, newVersionStr, changelog);
    }

    return this.success(
      {
        previousVersion: currentVersion.version,
        newVersion: newVersionStr,
        bumpType,
        versionFile: projectPath + '/package.json',
      },
      '版本已升级: ' + currentVersion.version + ' -> ' + newVersionStr
    );
  }

  /**
   * 设置指定版本号
   */
  private async setVersion(
    projectPath: string,
    version: string,
    changelog?: string
  ): Promise<SkillOutput> {
    const currentVersion = await this.readVersion(projectPath);

    // 验证版本号格式
    if (!this.isValidVersion(version)) {
      return this.fatalError(`无效的版本号: ${version}`);
    }

    // 更新 package.json
    await this.updateVersionInFile(projectPath, version);

    // 生成 changelog
    if (changelog) {
      await this.appendChangelog(projectPath, version, changelog);
    }

    return this.success(
      {
        previousVersion: currentVersion.version,
        newVersion: version,
        versionFile: `${projectPath}/package.json`,
      },
      `版本已设置为: ${version}`
    );
  }

  /**
   * 创建 Git 标签
   */
  private async createTag(projectPath: string, tagPrefix: string): Promise<SkillOutput> {
    const versionInfo = await this.readVersion(projectPath);
    const tagName = `${tagPrefix}${versionInfo.version}`;

    // 模拟创建标签（实际应调用 git 命令）
    logger.info('Creating git tag', { tagName });

    return this.success(
      {
        tagName,
        tagPrefix,
        version: versionInfo.version,
      },
      `Git 标签已创建: ${tagName}`
    );
  }

  /**
   * 读取当前版本
   */
  private async readVersion(_projectPath: string): Promise<VersionInfo> {
    // 模拟从 package.json 读取版本
    // 实际应读取 package.json 文件
    const mockVersion = '1.0.0';

    return this.parseVersion(mockVersion);
  }

  /**
   * 解析版本号
   */
  private parseVersion(versionString: string): VersionInfo {
    const match = versionString.match(/^(\d+)\.(\d+)\.(\d+)(?:-([^+]+))?$/);

    if (!match) {
      throw new Error(`无法解析版本号: ${versionString}`);
    }

    const [, major, minor, patch, prerelease] = match;

    return {
      major: parseInt(major, 10),
      minor: parseInt(minor, 10),
      patch: parseInt(patch, 10),
      prerelease,
      version: versionString,
      formatted: versionString,
    };
  }

  /**
   * 计算升级后的版本
   */
  private calculateBump(
    currentVersion: string,
    bumpType: 'major' | 'minor' | 'patch' | 'prerelease'
  ): string {
    const parsed = this.parseVersion(currentVersion);
    let { major, minor, patch } = parsed;

    switch (bumpType) {
      case 'major':
        major += 1;
        minor = 0;
        patch = 0;
        break;
      case 'minor':
        minor += 1;
        patch = 0;
        break;
      case 'patch':
        patch += 1;
        break;
      case 'prerelease':
        return major + '.' + minor + '.' + patch + '-beta.1';
    }

    return major + '.' + minor + '.' + patch;
  }

  /**
   * 验证版本号格式
   */
  private isValidVersion(version: string): boolean {
    return /^\d+\.\d+\.\d+(?:-[^+]+)?$/.test(version);
  }

  /**
   * 更新文件中的版本号
   */
  private async updateVersionInFile(projectPath: string, version: string): Promise<void> {
    logger.info('Updating version in package.json', { projectPath, version });
    // 实际应读取和修改 package.json
  }

  /**
   * 追加 changelog
   */
  private async appendChangelog(
    projectPath: string,
    version: string,
    content: string
  ): Promise<void> {
    const changelogPath = `${projectPath}/CHANGELOG.md`;
    const entry = `\n## [${version}] - ${new Date().toISOString().split('T')[0]}\n\n${content}\n`;

    logger.info('Appending to changelog', { changelogPath, entry });
    // 实际应写入 changelog
  }
}

// 导出实例
export default new VersionManagerSkill();
