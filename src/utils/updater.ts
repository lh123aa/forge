/**
 * 自动更新模块
 * 检测 GitHub 更新并自动升级
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from './logger.js';
import type { UpdateCheckResult, UpdateResult } from '../types/update.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

const logger = createLogger('Updater');

/**
 * 获取当前版本
 */
export function getCurrentVersion(): string {
  try {
    const pkgPath = path.join(ROOT_DIR, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * 获取远程仓库信息
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _getRemoteInfo(): { owner: string; repo: string } | null {
  try {
    const remoteUrl = execSync('git remote get-url origin', {
      cwd: ROOT_DIR,
      encoding: 'utf-8',
    }).trim();

    // 解析 GitHub URL
    // 格式: https://github.com/owner/repo.git 或 git@github.com:owner/repo.git
    const match = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 检测更新
 */
export async function checkUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = getCurrentVersion();
  const checkedAt = new Date().toISOString();

  try {
    // 1. 获取远程最新代码信息
    logger.info('正在检查更新...');

    // Fetch 远程仓库
    try {
      execSync('git fetch origin --tags', {
        cwd: ROOT_DIR,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      // fetch 失败，可能没有网络
      logger.warn('无法连接到远程仓库');
    }

    // 2. 检查是否有更新
    let remoteVersion = currentVersion;
    let hasUpdate = false;

    // 方法1: 比较 HEAD 和 origin/main
    try {
      const localCommit = execSync('git rev-parse HEAD', {
        cwd: ROOT_DIR,
        encoding: 'utf-8',
      }).trim();

      const remoteCommit = execSync('git rev-parse origin/main', {
        cwd: ROOT_DIR,
        encoding: 'utf-8',
      }).trim();

      if (localCommit !== remoteCommit) {
        hasUpdate = true;
        // 获取远程 package.json 版本
        try {
          const remotePkgContent = execSync('git show origin/main:package.json', {
            cwd: ROOT_DIR,
            encoding: 'utf-8',
          });
          const remotePkg = JSON.parse(remotePkgContent);
          remoteVersion = remotePkg.version || currentVersion;
        } catch {
          // 无法获取远程版本，使用当前版本
        }
      }
    } catch {
      // 可能没有 origin/main，尝试其他分支
      try {
        const remoteCommit = execSync('git rev-parse origin/master', {
          cwd: ROOT_DIR,
          encoding: 'utf-8',
        }).trim();
        const localCommit = execSync('git rev-parse HEAD', {
          cwd: ROOT_DIR,
          encoding: 'utf-8',
        }).trim();

        if (localCommit !== remoteCommit) {
          hasUpdate = true;
        }
      } catch {
        logger.warn('无法比较本地和远程版本');
      }
    }

    // 3. 获取更新日志
    let releaseNotes = '';
    if (hasUpdate) {
      try {
        // 获取最近的提交信息作为更新日志
        releaseNotes = execSync('git log HEAD..origin/main --oneline --no-merges | head -10', {
          cwd: ROOT_DIR,
          encoding: 'utf-8',
        }).trim();
      } catch {
        releaseNotes = '有新的更新可用';
      }
    }

    if (hasUpdate) {
      logger.info(`发现新版本: ${remoteVersion}`);
    } else {
      logger.info('已是最新版本');
    }

    return {
      hasUpdate,
      currentVersion,
      remoteVersion,
      releaseNotes,
      checkedAt,
    };
  } catch (error) {
    logger.error('检查更新失败:', error);
    return {
      hasUpdate: false,
      currentVersion,
      remoteVersion: currentVersion,
      checkedAt,
    };
  }
}

/**
 * 执行更新
 */
export async function doUpdate(): Promise<UpdateResult> {
  const logs: string[] = [];
  const fromVersion = getCurrentVersion();
  let toVersion = fromVersion;

  const log = (msg: string) => {
    logs.push(msg);
    logger.info(msg);
  };

  try {
    log('开始更新...');

    // 1. 检查是否有本地修改
    try {
      const status = execSync('git status --porcelain', {
        cwd: ROOT_DIR,
        encoding: 'utf-8',
      }).trim();

      if (status) {
        // 有本地修改，暂存它们
        log('检测到本地修改，正在暂存...');
        execSync('git stash', { cwd: ROOT_DIR, encoding: 'utf-8' });
      }
    } catch {
      // 忽略错误
    }

    // 2. 拉取最新代码
    log('正在拉取最新代码...');
    try {
      execSync('git pull origin main', {
        cwd: ROOT_DIR,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      // 尝试 master 分支
      try {
        execSync('git pull origin master', {
          cwd: ROOT_DIR,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (pullError) {
        throw new Error(`拉取代码失败: ${pullError}`);
      }
    }

    // 3. 安装依赖
    log('正在安装依赖...');
    execSync('npm install', {
      cwd: ROOT_DIR,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // 4. 构建项目
    log('正在构建项目...');
    execSync('npm run build', {
      cwd: ROOT_DIR,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // 5. 获取新版本号
    toVersion = getCurrentVersion();

    log(`更新完成! ${fromVersion} → ${toVersion}`);

    return {
      success: true,
      fromVersion,
      toVersion,
      logs,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`更新失败: ${errorMsg}`);

    // 回滚
    log('正在回滚...');
    try {
      execSync('git reset --hard HEAD', { cwd: ROOT_DIR, encoding: 'utf-8' });
      log('已回滚到更新前状态');
    } catch {
      log('回滚失败，请手动处理');
    }

    return {
      success: false,
      fromVersion,
      toVersion,
      error: errorMsg,
      logs,
    };
  }
}

/**
 * 快速检查是否有更新（不返回详细信息）
 */
export async function hasUpdate(): Promise<boolean> {
  const result = await checkUpdate();
  return result.hasUpdate;
}

export default {
  getCurrentVersion,
  checkUpdate,
  doUpdate,
  hasUpdate,
};
