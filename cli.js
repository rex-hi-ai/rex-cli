#!/usr/bin/env node

const { Command } = require('commander');
const FileSystemManager = require('./FileSystemManager');
const program = new Command();

program
  .name('rex-cli')
  .description('Rex CLI - Modular, extensible command line tool')
  .version('1.0.0');

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

program.parse(process.argv);
