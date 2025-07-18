const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const FileSystemManager = require('../FileSystemManager');
const { PermissionError } = require('../errors');

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
});
