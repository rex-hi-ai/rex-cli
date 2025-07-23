const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { PermissionError } = require('./errors');

class FileSystemManager {
  static getGlobalRexDir() {
    return path.join(os.homedir(), '.rex');
  }

  static getLocalRexDir() {
    return path.resolve(process.cwd(), '.rex');
  }

  static getProjectRexDir() {
    return path.resolve(process.cwd(), '.rex');
  }

  static async ensureRexDirs() {
    try {
      await fs.ensureDir(this.getGlobalRexDir());
      await fs.ensureDir(this.getLocalRexDir());
      // Also ensure the prompts directory exists in global .rex
      await fs.ensureDir(path.join(this.getGlobalRexDir(), 'prompts'));
    } catch (err) {
      if (err.code === 'EACCES') {
        throw new PermissionError(err.path, 'Cannot create .rex directory.');
      }
      throw new Error(`Failed to create .rex directories: ${err.message}`);
    }
  }

  static async ensureConfigFile({ overwrite = false } = {}) {
    const configPath = path.join(this.getLocalRexDir(), 'config.json');
    try {
      const exists = await fs.pathExists(configPath);
      if (exists && !overwrite) {
        throw new Error('config.json already exists. Use overwrite option to replace it.');
      }
      await fs.writeJson(configPath, { created: new Date().toISOString() }, { spaces: 2 });
      return configPath;
    } catch (err) {
      if (err.code === 'EACCES') {
        throw new PermissionError(configPath, 'Cannot write config.json.');
      }
      throw new Error(`Failed to create config.json: ${err.message}`);
    }
  }
}

module.exports = FileSystemManager;
