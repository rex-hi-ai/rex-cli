const fs = require('fs-extra');
const path = require('path');
const GitHubCopilotUtility = require('./GitHubCopilotUtility');
const CursorUtility = require('./CursorUtility');

/**
 * UtilityRunner - Discover and execute utilities in a pluggable manner.
 */
class UtilityRunner {
  constructor() {
    this.utilities = {
      // Utilities will be loaded here
    };
    
    this.loadUtilities();
  }

  /**
   * Load available utilities
   */
  loadUtilities() {
    // For future extensions, utilities can be dynamically loaded
    // Adding GitHub Copilot Utility (for VS Code)
    this.utilities['github-copilot'] = new GitHubCopilotUtility();
    
    // Adding Cursor Utility (for Cursor AI IDE)
    this.utilities['cursor'] = new CursorUtility();
  }

  /**
   * Get all utility names
   */
  getUtilityNames() {
    return Object.keys(this.utilities);
  }

  /**
   * Execute a specific utility
   */
  async runUtility(name, prompts) {
    const utility = this.utilities[name];
    if (!utility) {
      throw new Error(`Utility not found: ${name}. Available utilities: ${this.getUtilityNames().join(', ')}`);
    }
    return await utility.execute(prompts);
  }
}

/**
 * Base class for utilities
 */
class Utility {
  async execute(prompts) {
    throw new Error('execute method not implemented');
  }
}


module.exports = UtilityRunner;
