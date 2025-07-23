const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const FileSystemManager = require('../src/FileSystemManager');
const { PermissionError } = require('../src/errors');

describe('FileSystemManager', () => {
  const testDir = path.join(__dirname, 'tmp');
  const localRexDir = path.join(testDir, '.rex');
  const configPath = path.join(localRexDir, 'config.json');

  beforeAll(async () => {
    await fs.ensureDir(testDir);
    process.chdir(testDir);
  });

  afterAll(async () => {
    await fs.remove(testDir);
  });

  test('should create .rex directory and config.json', async () => {
    await FileSystemManager.ensureRexDirs();
    const config = await FileSystemManager.ensureConfigFile({ overwrite: true });
    expect(await fs.pathExists(localRexDir)).toBe(true);
    expect(await fs.pathExists(configPath)).toBe(true);
    expect(config).toBe(configPath);
  });

  test('should not overwrite config.json without overwrite option', async () => {
    await FileSystemManager.ensureConfigFile({ overwrite: true });
    await expect(FileSystemManager.ensureConfigFile({ overwrite: false }))
      .rejects.toThrow('already exists');
  });

  test('should throw PermissionError if cannot write config.json', async () => {
    await fs.chmod(localRexDir, 0o400); // read-only
    try {
      await expect(FileSystemManager.ensureConfigFile({ overwrite: true }))
        .rejects.toThrow(PermissionError);
    } finally {
      await fs.chmod(localRexDir, 0o700); // restore
    }
  });

  test('should get global rex directory path', () => {
    const globalDir = FileSystemManager.getGlobalRexDir();
    expect(globalDir).toBe(path.join(os.homedir(), '.rex'));
  });

  test('should get local rex directory path', () => {
    const localDir = FileSystemManager.getLocalRexDir();
    expect(localDir).toBe(path.resolve(process.cwd(), '.rex'));
  });

  test('should get project rex directory path', () => {
    const projectDir = FileSystemManager.getProjectRexDir();
    expect(projectDir).toBe(path.resolve(process.cwd(), '.rex'));
  });

  test('should handle permission error when creating .rex directories', async () => {
    const originalEnsureDir = fs.ensureDir;
    const permissionError = new Error('Permission denied');
    permissionError.code = 'EACCES';
    permissionError.path = '/restricted/path';

    fs.ensureDir = jest.fn().mockRejectedValue(permissionError);

    try {
      await expect(FileSystemManager.ensureRexDirs())
        .rejects.toThrow(PermissionError);
    } finally {
      fs.ensureDir = originalEnsureDir;
    }
  });

  test('should handle generic errors when creating .rex directories', async () => {
    const originalEnsureDir = fs.ensureDir;
    const genericError = new Error('Disk full');
    genericError.code = 'ENOSPC';

    fs.ensureDir = jest.fn().mockRejectedValue(genericError);

    try {
      await expect(FileSystemManager.ensureRexDirs())
        .rejects.toThrow('Failed to create .rex directories: Disk full');
    } finally {
      fs.ensureDir = originalEnsureDir;
    }
  });

  test('should handle generic errors when creating config file', async () => {
    const originalWriteJson = fs.writeJson;
    const genericError = new Error('Disk full');
    genericError.code = 'ENOSPC';

    fs.writeJson = jest.fn().mockRejectedValue(genericError);

    try {
      await expect(FileSystemManager.ensureConfigFile({ overwrite: true }))
        .rejects.toThrow('Failed to create config.json: Disk full');
    } finally {
      fs.writeJson = originalWriteJson;
    }
  });
});
