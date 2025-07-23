# rex-cli

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

`rex-cli` is a next-generation command-line interface (CLI) tool designed for Human-Integrated AI (HI AI) development. It aims to solve the problem of fragmented and inconsistent development workflows across different AI IDEs, CLIs, and toolchains. Its target users are developers engaged in prompt engineering, model orchestration, and agent pipeline creation. 

The core value of `rex-cli` is to enhance productivity, ensure consistency, and improve code quality by providing a unified, centralized system for managing, converting, and deploying AI prompts.

## Core Features

### 1. Global Prompt Library
- **Function:** Provides a single, centralized repository (`~/.rex/prompts/`) to store all user-created prompts.
- **Importance:** Avoids prompt duplication across different projects, simplifies maintenance, and ensures a single source of truth for all prompts.

### 2. Modular Prompt Utilities
- **Function:** A system of pluggable modules, called "Utilities" (e.g., `github-copilot`, `cursor`), responsible for converting standard prompts from the library into the formats required by specific target tools.
- **Importance:** Decouples the core prompt logic from the specific format of the target application, making the system highly extensible.

### 3. Project-Level Deployment
- **Function:** Deploys prompts from the global library into a local project’s directory structure.
- **Importance:** This is the core workflow for integrating managed prompts into an active development project, bridging the gap between the central library and the tools being used.

## Development Status: MVP Complete

The core user journey is now fully implemented:
1.  **Import**: `rex-cli prompt import <path>` - Add prompts to the global library.
2.  **Compile**: `rex-cli utility compile` - Transform prompts for specific utilities.
3.  **Deploy**: `rex-cli deploy --utility <name>` - Deploy compiled prompts to your project.
4.  **Config Management**: `rex-cli config` - Manage configuration at both the global and project level.

## Getting Started: The Core Workflow

Here’s how a developer would use `rex-cli`:

### 1. Initial Setup
Install the tool globally:
```bash
npm install -g rex-cli
```
Initialize a project (optional, for project-level configuration):
```bash
rex-cli init
```

### 2. Manage Prompts
Import a prompt you've written into the global library:
```bash
rex-cli prompt import ~/prompts/my-awesome-prompt.md
```
List your available prompts:
```bash
rex-cli prompt list
```

### 3. Use Prompts in a Project
Navigate to your project directory:
```bash
cd /path/to/my-project
```
Compile your prompts. This runs them through the installed "Utilities" to generate tool-specific versions.
```bash
# Compile all prompts for all utilities
rex-cli utility compile --all
```
Deploy the prompt to your project. `rex-cli` copies the correctly formatted prompt into the right directory (e.g., `.github/copilot/prompts/`).
```bash
# Deploy a specific prompt using the github-copilot utility
rex-cli deploy my-awesome-prompt --utility github-copilot
```
The prompt is now available in your IDE's prompt panel.

Manage configurations:
```bash
# Get all configurations
rex-cli config get

# Set a configuration globally
rex-cli config set defaultUtility github-copilot --global

# Delete a configuration locally
rex-cli config delete defaultUtility
```

## Advanced Features

### Smart Detection
`rex-cli` can automatically detect which AI tools are configured in your project and suggest the appropriate utilities to use. This means less manual configuration and faster setup.

### Hierarchical Configuration
Configuration follows a hierarchy: CLI flags > project settings > global settings. This allows for flexible configuration management while maintaining sensible defaults.

### Metadata and Filtering
Prompts support metadata tags and categories, allowing you to filter and organize your prompts effectively:
```bash
# Deploy only prompts tagged with 'code-review'
rex-cli deploy --tags code-review

# Exclude prompts tagged with 'experimental'
rex-cli deploy --exclude-tags experimental
```

### Watch Mode
During development, you can use watch mode to automatically recompile prompts when they change:
```bash
rex-cli utility compile --watch
```

### Dry Run Mode
Preview what would be deployed without actually making changes:
```bash
rex-cli deploy --dry-run
```

## Command-Line Interface

Here is a summary of the available commands:

### Core Commands
| Command                                    | Description                                               |
| ------------------------------------------ | --------------------------------------------------------- |
| `rex-cli init`                             | Initialize a new project with a `.rex/config.json` file.  |

### Prompt Management
| Command                                    | Description                                               |
| ------------------------------------------ | --------------------------------------------------------- |
| `rex-cli prompt import <path>`             | Import a prompt into the global library.                  |
| `rex-cli prompt list`                      | List all available prompts in the global library.         |
| `rex-cli prompt rename <old> <new>`        | Rename a prompt.                                          |
| `rex-cli prompt remove <name>`             | Remove a prompt from the library.                         |
| `rex-cli prompt export <name> <output>`    | Export a prompt from the library to an external file.     |
| `rex-cli prompt search <query>`            | Search for prompts by name or content.                    |

### Utility Management  
| Command                                    | Description                                               |
| ------------------------------------------ | --------------------------------------------------------- |
| `rex-cli utility list`                     | List available utilities and their status.                |
| `rex-cli utility enable <name>`            | Enable a utility.                                         |
| `rex-cli utility disable <name>`           | Disable a utility.                                        |
| `rex-cli utility set <name> <key> [value]` | Set configuration for a utility.                        |
| `rex-cli utility compile [names...]`       | Compile prompts using the specified utilities.            |

### Deployment
| Command                                    | Description                                               |
| ------------------------------------------ | --------------------------------------------------------- |
| `rex-cli deploy [prompts...]`              | Deploy prompts to the current project.                    |

### Configuration Management
| Command                                    | Description                                               |
| ------------------------------------------ | --------------------------------------------------------- |
| `rex-cli config get [key]`                 | Get configuration value(s).                               |
| `rex-cli config set <key> <value>`         | Set a configuration key-value pair.                       |
| `rex-cli config delete <key>`              | Delete a configuration key.                               |

For more detailed options for each command, use the `--help` flag. For example: `rex-cli deploy --help`.

## Supported Utilities

`rex-cli` currently supports the following AI development tools:

### GitHub Copilot (`github-copilot`)
- **Target Directory**: `.github/copilot/prompts/` and `.github/copilot/instructions/`
- **Format**: Markdown files with YAML frontmatter
- **Features**: Automatic detection of prompt vs instruction type, metadata preservation

### Cursor AI (`cursor`)
- **Target Directory**: `.cursor/prompts/`
- **Format**: Cursor-specific prompt format
- **Features**: Optimized for Cursor AI IDE integration

## Project Structure

`rex-cli` organizes files in the following structure:

```
~/.rex/                     # Global rex-cli directory
├── config.json            # Global configuration
├── prompts/               # Global prompt library
│   ├── my-prompt.md
│   └── another-prompt.md
└── compiled/              # Compiled prompts by utility
    ├── github-copilot/
    │   └── .github/copilot/prompts/
    └── cursor/
        └── .cursor/prompts/

./.rex/                     # Project-level rex-cli directory
├── config.json            # Project configuration
└── cache/                 # Project cache files
    ├── hashes.json        # File hashes for incremental builds
    └── detection.json     # Smart detection cache
```

## Architecture

`rex-cli` is built with a modular architecture consisting of:

- **CLI Application**: Main entry point using Commander.js
- **File System Manager**: Handles all file system operations across platforms
- **Configuration Manager**: Manages hierarchical configuration loading and merging
- **Prompt Manager**: Manages the lifecycle of prompts in the global library
- **Utility Runner**: Discovers and executes utility-specific compilation logic
- **Deployment Manager**: Handles deployment of compiled prompts to projects
- **Cache Manager**: Manages incremental builds and smart detection caching
- **Smart Detection Manager**: Automatically detects project tools and suggests utilities

## Contributing

We welcome contributions! The codebase is designed to be modular and extensible:

- **Adding New Utilities**: Create a new utility class implementing the base utility interface
- **Extending Features**: The modular architecture makes it easy to add new functionality
- **Testing**: Comprehensive Jest test suite ensures stability

## License
[MIT](./LICENSE)
