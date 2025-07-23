#!/usr/bin/env node

const { Command } = require('commander');
const FileSystemManager = require('./FileSystemManager');
const PromptManager = require('./PromptManager');
const { ErrorHandler, NotFoundError, ValidationError, PermissionError } = require('./errors');
const CompilationManager = require('./CompilationManager');
const DeploymentManager = require('./DeploymentManager');
const { logger } = require('./Logger');
const program = new Command();

program
  .name('rex-cli')
  .description('Rex CLI - Modular, extensible command line tool')
  .version('1.0.0')
  .option('--log-level <level>', 'Set logging level (debug, info, warn, error, silent)', 'info')
  .hook('preAction', (thisCommand, actionCommand) => {
    // 設置日誌等級
    const options = thisCommand.opts();
    if (options.logLevel) {
      logger.setLevel(options.logLevel);
    }
  });

program
  .command('init')
  .description('Initialize a new rex project')
  .option('-f, --force', 'Overwrite existing config.json if it exists')
  .action(async (options) => {
    try {
      await FileSystemManager.ensureRexDirs();
      const configPath = await FileSystemManager.ensureConfigFile({ overwrite: options.force });
      console.log(`rex-cli init: Project initialized.\nConfig created at: ${configPath}`);
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.error('Error: config.json already exists. Use --force to overwrite.');
      } else {
        console.error(`Error: ${err.message}`);
      }
      process.exit(1);
    }
  });

// Prompt management commands
const promptCommand = program
  .command('prompt')
  .description('Manage prompts in the global library');

promptCommand
  .command('import <path>')
  .description('Import a prompt file into the global library')
  .option('--overwrite', 'Overwrite existing prompt if it exists')
  .option('-n, --name <name>', 'Specify a custom name for the imported prompt')
  .action(async (sourcePath, options) => {
    try {
      let result;
      if (options.overwrite) {
        result = await PromptManager.importPromptWithForce(sourcePath, options.name);
        console.log(`Prompt imported successfully (overwritten): ${result.fileName}`);
      } else {
        result = await PromptManager.importPrompt(sourcePath, options.name);
        console.log(`Prompt imported successfully: ${result.fileName}`);
      }
      console.log(`Location: ${result.targetPath}`);
    } catch (err) {
      ErrorHandler.handleError(err, { command: 'rex-cli prompt import' });
    }
  });

promptCommand
  .command('list')
  .description('List all prompts in the global library')
  .action(async () => {
    try {
      const prompts = await PromptManager.listPrompts();
      const output = PromptManager.formatPromptList(prompts);
      console.log(output);
    } catch (err) {
      ErrorHandler.handleError(err, { command: 'rex-cli prompt list' });
    }
  });

promptCommand
  .command('remove <name>')
  .description('Remove a prompt from the global library')
  .option('-f, --force', 'Force removal without confirmation (required for safety)')
  .action(async (promptName, options) => {
    try {
      const result = await PromptManager.removePrompt(promptName, options.force);
      console.log(`✅ Prompt removed successfully: ${result.promptName}`);
      console.log(`Removed from: ${result.path}`);
    } catch (err) {
      ErrorHandler.handleError(err, { command: 'rex-cli prompt remove' });
    }
  });

promptCommand
  .command('rename <old-name> <new-name>')
  .description('Rename a prompt in the global library')
  .action(async (oldName, newName, options) => {
    try {
      const result = await PromptManager.renamePrompt(oldName, newName);
      console.log(`✅ Prompt renamed successfully`);
      console.log(`From: ${result.oldName} => To: ${result.newName}`);
      console.log(`Location: ${result.newPath}`);
    } catch (err) {
      ErrorHandler.handleError(err, { command: 'rex-cli prompt rename' });
    }
  });

promptCommand
  .command('export <name> <output>')
  .description('Export a prompt from the global library to an external file')
  .option('-f, --format <format>', 'Export format (currently only "copy" is supported)', 'copy')
  .option('--force', 'Force overwrite if output file already exists')
  .action(async (promptName, outputPath, options) => {
    try {
      let result;
      if (options.force) {
        result = await PromptManager.exportPromptWithForce(promptName, outputPath, options.format);
        console.log(`✅ Prompt exported successfully (overwritten): ${result.promptName}`);
      } else {
        result = await PromptManager.exportPrompt(promptName, outputPath, options.format);
        console.log(`✅ Prompt exported successfully: ${result.promptName}`);
      }
      console.log(`Exported to: ${result.outputPath}`);
      console.log(`Format: ${result.format}`);
    } catch (err) {
      ErrorHandler.handleError(err, { command: 'rex-cli prompt export' });
    }
  });

promptCommand
  .command('search <query>')
  .description('Search for prompts by name or content')
  .option('-r, --regex', 'Interpret query as a regular expression')
  .option('-c, --case-sensitive', 'Perform case-sensitive matching')
  .action(async (query, options) => {
    try {
      const searchOptions = {
        regex: options.regex || false,
        caseSensitive: options.caseSensitive || false
      };
      
      const results = await PromptManager.searchPrompts(query, searchOptions);
      const output = PromptManager.formatSearchResults(results, query, searchOptions);
      console.log(output);
    } catch (err) {
      ErrorHandler.handleError(err, { command: 'rex-cli prompt search' });
    }
  });


// Utility commands
const utilityCommand = program
  .command('utility')
  .description('Utility command management');

utilityCommand
  .command('list')
  .description('List available utilities and their status')
  .action(async () => {
    try {
      const UtilityRunner = require('./UtilityRunner');
      const ConfigurationManager = require('./ConfigurationManager');
      
      const utilityRunner = new UtilityRunner();
      const configManager = new ConfigurationManager();
      await configManager.loadConfiguration({});
      
      const availableUtilities = utilityRunner.getUtilityNames();
      const utilityStatus = configManager.get('utilities', {});
      
      console.log('\n📋 Available Utilities:');
      console.log('='.repeat(50));
      
      if (availableUtilities.length === 0) {
        console.log('❌ No utilities found');
        return;
      }
      
      for (const utilityName of availableUtilities) {
        const status = utilityStatus[utilityName]?.enabled !== false ? '✅ Enabled' : '❌ Disabled';
        const config = utilityStatus[utilityName] || {};
        
        console.log(`\n🔧 ${utilityName}`);
        console.log(`   Status: ${status}`);
        
        if (Object.keys(config).length > 1 || (Object.keys(config).length === 1 && !config.hasOwnProperty('enabled'))) {
          console.log('   Configuration:');
          for (const [key, value] of Object.entries(config)) {
            if (key !== 'enabled') {
              console.log(`     ${key}: ${JSON.stringify(value)}`);
            }
          }
        }
      }
      
    } catch (err) {
      logger.error('Failed to list utilities', err.message);
      process.exit(1);
    }
  });

utilityCommand
  .command('enable <utility-name>')
  .description('Enable a utility')
  .action(async (utilityName) => {
    try {
      const ConfigurationManager = require('./ConfigurationManager');
      const configManager = new ConfigurationManager();
      await configManager.loadConfiguration({});
      
      // 設定工具為啟用狀態
      await configManager.setUtilityConfig(utilityName, 'enabled', true);
      
      logger.success(`Utility "${utilityName}" has been enabled`);
      
    } catch (err) {
      logger.error(`Failed to enable utility "${utilityName}"`, err.message);
      process.exit(1);
    }
  });

utilityCommand
  .command('disable <utility-name>')
  .description('Disable a utility')
  .action(async (utilityName) => {
    try {
      const ConfigurationManager = require('./ConfigurationManager');
      const configManager = new ConfigurationManager();
      await configManager.loadConfiguration({});
      
      // 設定工具為停用狀態
      await configManager.setUtilityConfig(utilityName, 'enabled', false);
      
      logger.success(`Utility "${utilityName}" has been disabled`);
      
    } catch (err) {
      logger.error(`Failed to disable utility "${utilityName}"`, err.message);
      process.exit(1);
    }
  });

utilityCommand
  .command('set <utility-name> <key> [value]')
  .description('Set configuration for a utility')
  .action(async (utilityName, key, value) => {
    try {
      const ConfigurationManager = require('./ConfigurationManager');
      const configManager = new ConfigurationManager();
      await configManager.loadConfiguration({});
      
      // 解析 value（支援 JSON 格式）
      let parsedValue = value;
      if (value) {
        try {
          // 嘗試解析為 JSON
          parsedValue = JSON.parse(value);
        } catch {
          // 如果不是有效的 JSON，保持原始字串
          parsedValue = value;
        }
      } else {
        // 如果沒有提供 value，則移除該設定
        parsedValue = undefined;
      }
      
      await configManager.setUtilityConfig(utilityName, key, parsedValue);
      
      if (parsedValue === undefined) {
        logger.success(`Configuration "${key}" has been removed from utility "${utilityName}"`);
      } else {
        logger.success(`Configuration "${key}" has been set to "${JSON.stringify(parsedValue)}" for utility "${utilityName}"`);
      }
      
    } catch (err) {
      logger.error(`Failed to set configuration for utility "${utilityName}"`, err.message);
      process.exit(1);
    }
  });

utilityCommand
  .command('compile')
  .description('Compile specified prompts using available utilities')
  .option('-u, --utilities <names...>', 'Specify utilities to use for compilation', null)
  .option('-a, --all', 'Compile all available prompts', false)
  .option('-p, --prompts <names...>', 'Specify prompts to compile', null)
  .option('-i, --incremental', 'Use incremental compilation', true)
  .option('-c, --clean', 'Clean before compiling', false)
  .option('-w, --watch', 'Watch for changes and automatically recompile', false)
  .action(async (options) => {
    try {
      const compilationManager = new CompilationManager();

      if (options.watch) {
        // Watch mode
        await compilationManager.compileWithWatch({
          utilities: options.utilities,
          all: options.all,
          clean: options.clean,
          promptNames: options.prompts,
          incremental: options.incremental
        });
      } else {
        // Normal compilation mode
        const result = await compilationManager.compile({
          utilities: options.utilities,
          all: options.all,
          clean: options.clean,
          promptNames: options.prompts,
          incremental: options.incremental
        });

        console.log(`\n🚀 Compilation completed successfully!`);
        console.log(`Compiled ${result.compiledPrompts} prompts with utilities: ${result.compiledUtilities.join(', ')}`);
        if (result.skippedPrompts > 0) {
          console.log(`Skipped ${result.skippedPrompts} unchanged prompts.`);
        }
        console.log(`Output directory: ${result.outputDir}`);
      }

    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });



// Config management commands
const configCommand = program
  .command('config')
  .description('Manage configuration settings at global and project levels');

configCommand
  .command('get [key]')
  .description('Get configuration value(s). If no key specified, shows all configurations')
  .option('-g, --global', 'Get from global configuration (~/.rex/config.json)')
  .action(async (key, options) => {
    try {
      const ConfigurationManager = require('./ConfigurationManager');
      const configManager = new ConfigurationManager();
      
      if (options.global) {
        // Only load and show global config
        const globalConfig = await configManager._loadGlobalConfig();
        
        if (key) {
          const value = configManager._getNestedValue(globalConfig, key, undefined);
          if (value !== undefined) {
            console.log(JSON.stringify(value, null, 2));
          } else {
            console.log(`Configuration key "${key}" not found in global config.`);
            process.exit(1);
          }
        } else {
          console.log('\n📋 Global Configuration (~/.rex/config.json):');
          console.log('=' .repeat(50));
          if (Object.keys(globalConfig).length === 0) {
            console.log('No global configuration found.');
          } else {
            console.log(JSON.stringify(globalConfig, null, 2));
          }
        }
      } else {
        // Load merged configuration with hierarchy
        await configManager.loadConfiguration({});
        
        if (key) {
          const value = configManager.get(key, undefined);
          if (value !== undefined) {
            console.log(JSON.stringify(value, null, 2));
          } else {
            console.log(`Configuration key "${key}" not found.`);
            process.exit(1);
          }
        } else {
          const allConfig = configManager.getAll();
          console.log('\n📋 Merged Configuration (Global + Project + CLI):');
          console.log('=' .repeat(50));
          if (Object.keys(allConfig).length === 0) {
            console.log('No configuration found.');
          } else {
            console.log(JSON.stringify(allConfig, null, 2));
          }
        }
      }
      
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

configCommand
  .command('set <key> <value>')
  .description('Set a configuration key-value pair')
  .option('-g, --global', 'Set in global configuration (~/.rex/config.json) instead of project')
  .action(async (key, value, options) => {
    try {
      const ConfigurationManager = require('./ConfigurationManager');
      const configManager = new ConfigurationManager();
      
      // Load current configuration
      await configManager.loadConfiguration({});
      
      // Parse value (support JSON format)
      let parsedValue = value;
      try {
        // Try to parse as JSON for objects, arrays, booleans, numbers
        parsedValue = JSON.parse(value);
      } catch {
        // If not valid JSON, keep as string
        parsedValue = value;
      }
      
      if (options.global) {
        // Modify global config
        const globalConfig = await configManager._loadGlobalConfig();
        configManager._setNestedValue(globalConfig, key, parsedValue);
        await configManager.saveGlobalConfig(globalConfig);
        
        console.log(`✅ Global configuration updated:`);
        console.log(`   ${key} = ${JSON.stringify(parsedValue)}`);
        console.log(`   File: ~/.rex/config.json`);
      } else {
        // Modify project config
        const projectConfig = { ...configManager._projectConfig };
        configManager._setNestedValue(projectConfig, key, parsedValue);
        await configManager.saveProjectConfig(projectConfig);
        
        console.log(`✅ Project configuration updated:`);
        console.log(`   ${key} = ${JSON.stringify(parsedValue)}`);
        console.log(`   File: ./.rex/config.json`);
      }
      
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

configCommand
  .command('delete <key>')
  .description('Delete a configuration key')
  .option('-g, --global', 'Delete from global configuration (~/.rex/config.json) instead of project')
  .action(async (key, options) => {
    try {
      const ConfigurationManager = require('./ConfigurationManager');
      const configManager = new ConfigurationManager();
      
      // Load current configuration
      await configManager.loadConfiguration({});
      
      if (options.global) {
        // Modify global config
        const globalConfig = await configManager._loadGlobalConfig();
        
        // Check if key exists
        const existingValue = configManager._getNestedValue(globalConfig, key, undefined);
        if (existingValue === undefined) {
          console.log(`Configuration key "${key}" not found in global config.`);
          process.exit(1);
        }
        
        configManager._deleteNestedKey(globalConfig, key);
        await configManager.saveGlobalConfig(globalConfig);
        
        console.log(`✅ Global configuration key deleted:`);
        console.log(`   ${key}`);
        console.log(`   File: ~/.rex/config.json`);
      } else {
        // Modify project config
        const projectConfig = { ...configManager._projectConfig };
        
        // Check if key exists
        const existingValue = configManager._getNestedValue(projectConfig, key, undefined);
        if (existingValue === undefined) {
          console.log(`Configuration key "${key}" not found in project config.`);
          process.exit(1);
        }
        
        configManager._deleteNestedKey(projectConfig, key);
        await configManager.saveProjectConfig(projectConfig);
        
        console.log(`✅ Project configuration key deleted:`);
        console.log(`   ${key}`);
        console.log(`   File: ./.rex/config.json`);
      }
      
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });


// Deploy command
program
  .command('deploy [prompt-names...]')
  .description('Deploy compiled prompts to the current project directory')
  .option('--utility <utility-name>', 'Specify which utility\'s compiled output to deploy', null)
  .option('--output <path>', 'Custom output directory (relative to current directory)', null)
  .option('--tags <tags...>', 'Filter by tags (multiple tags supported)', [])
  .option('--category <category>', 'Filter by category', null)
  .option('--exclude-tags <tags...>', 'Exclude prompts with these tags (multiple tags supported)', [])
  .option('--dry-run', 'Show what would be deployed without actually deploying', false)
  .option('-f, --force', 'Force overwrite existing files', false)
  .action(async (promptNames, options) => {
    try {
      const deploymentManager = new DeploymentManager();
      
      // Use configuration-aware deployment
      const cliOptions = {
        promptNames: promptNames || [],
        utility: options.utility,
        output: options.output,
        tags: options.tags || [],
        category: options.category,
        excludeTags: options.excludeTags || [],
        dryRun: options.dryRun,
        force: options.force
      };
      
      const result = await deploymentManager.deployWithConfig(cliOptions);

      // Output results (unless dry-run handled it)
      if (!result.dryRun) {
        const output = deploymentManager.formatDeploymentResult(result);
        console.log(output);
      }

    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program.parse(process.argv);
