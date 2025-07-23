const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const ConfigurationManager = require('./ConfigurationManager');
const SmartDetectionManager = require('./SmartDetectionManager');
const CacheManager = require('./CacheManager');
const PromptMetadataParser = require('./PromptMetadataParser');

class DeploymentManager {
  constructor() {
    this.homeDir = os.homedir();
    this.compiledDir = path.join(this.homeDir, '.rex', 'compiled');
  }

  /**
   * Deploy compiled prompts using configuration-aware options
   * This method loads configuration and resolves options based on hierarchy:
   * CLI flags > project settings > global settings
   * @param {Object} cliOptions - Options from CLI
   * @returns {Object} Result of deployment operation
   */
  async deployWithConfig(cliOptions = {}) {
    // Load configuration
    const configManager = new ConfigurationManager();
    await configManager.loadConfiguration(cliOptions);
    
    // Resolve deployment options from configuration
    const resolvedOptions = await this._resolveDeploymentOptions(configManager, cliOptions);
    
    return this.deploy(resolvedOptions);
  }

  /**
   * Deploy compiled prompts to the current project directory
   * @param {Object} options - Deployment options
   * @param {string[]} options.promptNames - Specific prompts to deploy (if empty, deploy all)
   * @param {string} options.utility - Utility name to use for deployment
   * @param {string} options.output - Custom output path (relative to current directory)
   * @param {string[]} options.tags - Filter by tags (include prompts with these tags)
   * @param {string} options.category - Filter by category
   * @param {string[]} options.excludeTags - Exclude prompts with these tags
   * @param {boolean} options.dryRun - If true, only show what would be deployed
   * @param {boolean} options.force - Force overwrite existing files
   * @returns {Object} Result of deployment operation
   */
  async deploy(options = {}) {
    const {
      promptNames = [],
      utility,
      output,
      tags = [],
      category,
      excludeTags = [],
      dryRun = false,
      force = false
    } = options;

    // Validate utility is specified
    if (!utility) {
      throw new Error('Utility must be specified using --utility flag');
    }

    // Check if utility directory exists
    const utilityCompiledDir = path.join(this.compiledDir, utility);
    if (!await fs.pathExists(utilityCompiledDir)) {
      throw new Error(`No compiled files found for utility: ${utility}. Run 'rex-cli utility compile' first.`);
    }

    // Get all compiled files for the utility with filtering
    const filterOptions = {
      tags,
      category,
      excludeTags
    };
    const compiledFiles = await this.getCompiledFiles(utilityCompiledDir, promptNames, utility, filterOptions);

    if (compiledFiles.length === 0) {
      throw new Error('No matching compiled prompts found');
    }

    // Dry run mode
    if (dryRun) {
      console.log('\n🔍 Dry run mode - no files will be written');
      
      // Display filter information if filters are applied
      const hasFilters = tags.length > 0 || category || excludeTags.length > 0;
      if (hasFilters) {
        console.log('\n📋 Applied filters:');
        if (tags.length > 0) {
          console.log(`   Tags: [${tags.join(', ')}]`);
        }
        if (category) {
          console.log(`   Category: ${category}`);
        }
        if (excludeTags.length > 0) {
          console.log(`   Exclude tags: [${excludeTags.join(', ')}]`);
        }
      }
      
      console.log(`\nFiles that would be deployed (${compiledFiles.length} files):`);
      for (const file of compiledFiles) {
        const destPath = this.getDestinationPath(file.relativePath, output, utility);
        console.log(`  ${file.sourcePath} → ${destPath}`);
      }
      return { dryRun: true, files: compiledFiles, appliedFilters: { tags, category, excludeTags } };
    }

    // Perform actual deployment
    const deployedFiles = [];
    const skippedFiles = [];
    const overwrittenFiles = [];

    for (const file of compiledFiles) {
      const destPath = this.getDestinationPath(file.relativePath, output, utility);
      const absoluteDestPath = path.resolve(destPath);

      // Check if file exists
      const fileExists = await fs.pathExists(absoluteDestPath);
      
      if (fileExists && !force) {
        skippedFiles.push({
          source: file.sourcePath,
          destination: destPath,
          reason: 'File already exists (use --force to overwrite)'
        });
        continue;
      }

      // Ensure destination directory exists
      await fs.ensureDir(path.dirname(absoluteDestPath));

      // Copy file
      await fs.copy(file.absolutePath, absoluteDestPath);

      if (fileExists) {
        overwrittenFiles.push({
          source: file.sourcePath,
          destination: destPath
        });
      } else {
        deployedFiles.push({
          source: file.sourcePath,
          destination: destPath
        });
      }
    }

    return {
      deployed: deployedFiles.length,
      overwritten: overwrittenFiles.length,
      skipped: skippedFiles.length,
      deployedFiles,
      overwrittenFiles,
      skippedFiles,
      utility,
      outputDir: output || process.cwd()
    };
  }

  /**
   * Get compiled files from utility directory
   * @param {string} utilityDir - Path to utility compiled directory
   * @param {string[]} promptNames - Filter by prompt names (if empty, get all)
   * @param {string} utility - Utility name
   * @param {Object} filterOptions - Tag/category filtering options
   * @param {string[]} filterOptions.tags - Include prompts with these tags
   * @param {string} filterOptions.category - Include prompts with this category
   * @param {string[]} filterOptions.excludeTags - Exclude prompts with these tags
   * @returns {Array} List of compiled files with metadata
   */
  async getCompiledFiles(utilityDir, promptNames = [], utility, filterOptions = {}) {
    const files = [];
    
    async function scanDirectory(dir, baseDir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          await scanDirectory(fullPath, baseDir);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          const relativePath = path.relative(baseDir, fullPath);
          const promptName = path.basename(entry.name, path.extname(entry.name))
            .replace(/\.(prompt|instruction)$/, '');
          
          // If prompt names are specified, filter by them
          if (promptNames.length === 0 || promptNames.includes(promptName)) {
            files.push({
              absolutePath: fullPath,
              relativePath,
              sourcePath: relativePath, // Store original path for display
              promptName,
              fileName: entry.name
            });
          }
        }
      }
    }

    await scanDirectory(utilityDir, utilityDir);
    
    // Apply tag/category filtering if any filter options are provided
    const { tags = [], category, excludeTags = [] } = filterOptions;
    if (tags.length > 0 || category || excludeTags.length > 0) {
      return await this._applyMetadataFiltering(files, filterOptions);
    }
    
    return files;
  }

  /**
   * Get destination path for a file
   * @param {string} relativePath - Relative path from utility directory
   * @param {string} customOutput - Custom output directory
   * @param {string} utility - Utility name
   * @returns {string} Destination path
   */
  getDestinationPath(relativePath, customOutput, utility) {
    // For github-copilot utility, the compiled structure already contains .github/
    // So we use the path as-is
    if (customOutput) {
      // If custom output is specified, maintain the directory structure under it
      return path.join(customOutput, relativePath);
    } else {
      // Default: deploy to current directory maintaining structure
      return relativePath;
    }
  }

  /**
   * Resolve deployment options from configuration hierarchy with smart detection
   * @param {ConfigurationManager} configManager - Loaded configuration manager
   * @param {Object} cliOptions - CLI options
   * @returns {Object} Resolved deployment options
   */
  async _resolveDeploymentOptions(configManager, cliOptions) {
    let resolvedUtility = cliOptions.utility || configManager.get('deploy.defaultUtility');
    let resolvedTags = cliOptions.tags || configManager.get('deploy.defaultTags', []);
    let resolvedCategory = cliOptions.category || configManager.get('deploy.defaultCategory');
    let resolvedExcludeTags = cliOptions.excludeTags || configManager.get('deploy.defaultExcludeTags', []);
    
    // 如果沒有指定 utility，使用智慧偵測
    if (!resolvedUtility) {
      const cacheManager = new CacheManager();
      const detectionManager = new SmartDetectionManager();
      
      const { detectionCache } = await cacheManager.loadCache();
      const cacheKey = path.resolve(process.cwd());
      const cachedResult = detectionCache[cacheKey];
      const detectionResult = await detectionManager.detectWithCache(process.cwd(), detectionCache);
      
      if (detectionResult.detectedUtilities.length > 0) {
        const suggestions = detectionManager.suggestUtilities(detectionResult);
        resolvedUtility = suggestions[0].utility;
        console.log(`🎯 智慧偵測建議使用工具: ${resolvedUtility}`);
        
        // 更新快取（如果使用了快取，則不需要重新儲存）
        if (!detectionManager.isCacheValid(cachedResult)) {
          const { hashCache } = await cacheManager.loadCache();
          await cacheManager.saveCache(hashCache, detectionCache);
        }
      }
    }

    return {
      promptNames: cliOptions.promptNames || configManager.get('deploy.prompts', []),
      utility: resolvedUtility,
      output: cliOptions.output || configManager.get('deploy.defaultOutput'),
      tags: resolvedTags,
      category: resolvedCategory,
      excludeTags: resolvedExcludeTags,
      dryRun: cliOptions.dryRun || configManager.get('deploy.dryRun', false),
      force: cliOptions.force || configManager.get('deploy.force', false)
    };
  }


  /**
   * Apply metadata-based filtering to compiled files
   * @private
   * @param {Array} files - Array of compiled file objects
   * @param {Object} filterOptions - Filtering options
   * @returns {Array} Filtered array of compiled files
   */
  async _applyMetadataFiltering(files, filterOptions) {
    const { tags = [], category, excludeTags = [] } = filterOptions;
    const metadataParser = new PromptMetadataParser();
    
    // Extract prompt names from compiled files and map to original prompt filenames
    // The promptName in compiled files doesn't include .md, but the parser expects .md
    const promptFileNames = files.map(file => {
      // The parser expects the original .md filename
      return file.promptName + '.md';
    });
    
    try {
      // Use the PromptMetadataParser to filter the prompt names
      const filteredPromptNames = await metadataParser.filterPrompts(promptFileNames, {
        tags,
        excludeTags,
        category
      });
      
      // Convert back to prompt names without .md extension for matching
      const filteredNamesSet = new Set(
        filteredPromptNames.map(name => name.replace(/\.md$/, ''))
      );
      
      // Filter the original files array based on the filtered prompt names
      return files.filter(file => filteredNamesSet.has(file.promptName));
      
    } catch (error) {
      console.warn(`Warning: Failed to apply metadata filtering: ${error.message}`);
      // If filtering fails, return original files to avoid breaking deployment
      return files;
    }
  }

  /**
   * Format deployment result for CLI output
   * @param {Object} result - Deployment result
   * @returns {string} Formatted output
   */
  formatDeploymentResult(result) {
    const lines = [];

    if (result.dryRun) {
      return ''; // Dry run output is handled in deploy method
    }

    lines.push('\n✨ Deployment completed!');
    lines.push(`\nUtility: ${result.utility}`);
    lines.push(`Output directory: ${result.outputDir}`);
    
    if (result.deployed > 0) {
      lines.push(`\n✅ Deployed ${result.deployed} file(s):`);
      result.deployedFiles.forEach(file => {
        lines.push(`   ${file.source} → ${file.destination}`);
      });
    }

    if (result.overwritten > 0) {
      lines.push(`\n🔄 Overwritten ${result.overwritten} file(s):`);
      result.overwrittenFiles.forEach(file => {
        lines.push(`   ${file.source} → ${file.destination}`);
      });
    }

    if (result.skipped > 0) {
      lines.push(`\n⚠️  Skipped ${result.skipped} file(s):`);
      result.skippedFiles.forEach(file => {
        lines.push(`   ${file.source} → ${file.destination}`);
        lines.push(`   Reason: ${file.reason}`);
      });
    }

    return lines.join('\n');
  }
}

module.exports = DeploymentManager;
