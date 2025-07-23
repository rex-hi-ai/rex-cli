# rex-cli: Product Requirements Document (PRD)

# Overview
rex-cli is a next-generation command-line interface (CLI) tool designed for Human-Integrated AI (HI AI) development. It aims to solve the problem of fragmented and inconsistent development workflows across different AI IDEs, CLIs, and toolchains. Its target users are developers engaged in prompt engineering, model orchestration, and agent pipeline creation. The core value of rex-cli is to enhance productivity, ensure consistency, and improve code quality by providing a unified, centralized system for managing, converting, and deploying AI prompts.

# Core Features

## 1. Global Prompt Library
**Function:** Provides a single, centralized repository (~/.rex/prompts/) to store all user-created prompts.

**Importance:** Avoids prompt duplication across different projects, simplifies maintenance, and ensures a single source of truth for all prompts.

**How it works:** Users import their prompt files (e.g., Markdown files) into the global library using the rex-cli prompt import command. All other operations will reference the content in the library by the prompt's name.

## 2. Modular Prompt Utilities
**Function:** A system of pluggable modules, called "Utilities" (e.g., github-copilot, cursor), responsible for converting standard prompts from the library into the formats required by specific target tools (like GitHub Copilot, Cursor, etc.).

**Importance:** Decouples the core prompt logic from the specific format of the target application. This makes the system highly extensible, allowing new tools to be supported simply by adding a new Utility.

**How it works:** When a prompt is imported or compiled, rex-cli runs it through all enabled Utilities. Each Utility reads the standard prompt and outputs a converted version to a corresponding subdirectory within ~/.rex/compiled/.

## 3. Project-Level Deployment
**Function:** Deploys prompts from the global library into a local project's directory structure.

**Importance:** This is the core workflow for integrating managed prompts into an active development project. It bridges the gap between the central library and the tools actually being used in a project.

**How it works:** The user runs rex-cli deploy [prompt-name] within their project. The tool identifies the required Utilities (via flags, project configuration files, or auto-detection), finds the corresponding compiled prompt versions, and copies them to the correct location within the project (e.g., .vscode/).

## 4. Multi-Level Configuration & Smart Detection
**Function:** A hierarchical configuration system (CLI flags > project settings > global settings) that manages the tool's behavior. It also includes a smart detection feature to identify which Utilities are relevant to the current project.

**Importance:** Provides flexibility and reduces manual setup. Users can set project-wide defaults while still being able to override them for specific tasks. Smart detection allows the tool to "just work" out of the box in many cases.

**How it works:** The tool merges settings from ~/.rex/config.json, ./.rex/config.json, and command-line flags. During deployment, if no Utility is specified, it scans for known configuration files in the project (like .vscode/settings.json) to determine which Utilities to use.

# User Experience

## User Personas
**Alex, the AI Application Developer:** Alex works on multiple projects that use AI prompts for different tasks. He needs a way to reuse and version control his best prompts without copying and pasting. He uses tools like GitHub Copilot and Cursor and wants a seamless way to integrate prompts into his IDE.

## Key User Flows

### Initial Setup:
- Alex installs the tool: npm install -g rex-cli.
- In his project, he runs rex-cli init to create a local .rex/config.json file.

### Managing Prompts (The "Librarian" Flow):
- Alex writes a new prompt in a Markdown file: ~/prompts/my-new-prompt.md.
- He imports it into the global library: rex-cli prompt import ~/prompts/my-new-prompt.md.
- He lists the prompts to confirm: rex-cli prompt list.
- Later, for clarity, he renames it: rex-cli prompt rename my-new-prompt awesome-prompt.

### Using Prompts (The "Developer" Flow):
- Alex navigates to his project directory: cd /path/to/my-project.
- He deploys the prompt: rex-cli deploy awesome-prompt.
- rex-cli auto-detects that he is using GitHub Copilot and Cursor and copies the correctly formatted prompts into ./.github/copilot/ and other relevant directories. The prompt is now available in his IDE's prompt panel.

## UI/UX Considerations
- **CLI First:** The entire experience is centered around a clean, predictable command-line interface.
- **Convention over Configuration:** In common cases, the tool should work without any configuration (e.g., by auto-detecting Utilities).
- **Clear Feedback:** Commands should provide clear, concise feedback on success or failure.
- **Discoverability:** The --help flag on all commands and subcommands is crucial for users to explore functionality.
- **Safety:** Destructive operations like remove and overwrite should require a --force flag to prevent accidental data loss.


# Technical Architecture
# Technical Architecture

## System Components
- **CLI Application (rex-cli):** The main entry point, built with Node.js and Commander.js. It is responsible for parsing commands and coordinating other components.
- **File System Manager:** A module responsible for all interactions with the file system, including managing the ~/.rex and ./.rex directories.
- **Configuration Manager:** Handles loading and merging settings from global, project, and command-line sources.
- **Prompt Manager:** Manages the lifecycle of prompts within the global library (import, remove, rename, list).
- **Utility Runner:** Discovers and executes the compile logic for each enabled Utility.
- **Cache Manager:** Manages the ./.rex/cache/ directory to store file hashes (hashes.json) for incremental builds and detection results (detection.json) to accelerate subsequent runs.

## Data Models

### config.json:
```json
{
  "deploy": {
    "utilities": ["string"],
    "prompts": ["string"]
  },
  "utilities": {
    "utility-name": {
      "key": "value"
    }
  }
}
```

### Other Models:
- **Prompt (on disk):** A text file, usually Markdown, representing the source of truth.
- **hashes.json (cache):** A key-value store that maps prompt file paths to their content hashes to avoid redundant compilations.
- **detection.json (cache):** A file that stores the results of project environment scans to avoid re-scanning on every run.

## APIs and Integrations
The system is self-contained but is designed to integrate with other tools' file-based configurations. Each Utility acts as an adapter for a specific tool's "API" (i.e., its expected file format and location).

## Infrastructure Requirements
- **Node.js:** The necessary runtime environment.
- **npm:** Required for installation.
- **Standard File System:** Requires access to the user's home directory and the local project directory.

# Development Roadmap

## MVP: Core Workflow
The goal of the MVP is to deliver the main user flow: getting a prompt from a file into a project.

### Foundation:
- Create the CLI structure using Commander.js.
- Create a file system manager to handle the creation of ~/.rex and ./.rex.
- The rex-cli init command.

### Core Prompt Management:
- rex-cli prompt import <path>: Implement adding a prompt to ~/.rex/prompts/.
- rex-cli prompt list: A simple command to see what's in the library.

### First Utility and Compilation:
- Create a single, practical Utility (e.g., a "GitHub Copilot" Utility that converts prompts into GitHub Copilot format).
- rex-cli utility compile: Manually trigger the compilation of all prompts for that Utility, storing the results in ~/.rex/compiled/.

### Deployment:
- rex-cli deploy <prompt-name>: Implement copying the compiled prompt from ~/.rex/compiled/ to the current directory. Must support the --utility and --output flags.

## V2: Enhancements and Automation

### Advanced Prompt Management:
- rex-cli prompt remove, rename, export, search.

### Configuration and Automation:
- Implement full multi-level config.json loading.
- Implement smart Utility detection.
- Implement caching (hashes.json and detection.json) for incremental compilation and faster detection.

### Developer Experience:
- rex-cli utility compile --watch to provide real-time feedback during development.
- rex-cli deploy --dry-run for safer deployments.

### Additional Utilities:
- Develop and integrate official Utilities for key tools like GitHub Copilot and Cursor.

## V3: Extensibility and Polish

### Utility Management:
- rex-cli utility enable|disable|set.

### Robustness:
- Add comprehensive testing using Jest.
- Implement detailed logging with --log-level.

### Ecosystem:
- Create clear documentation for third-party Utility development.

# Logical Dependency Chain
- **File System Foundation:** The absolute first step is to establish the directory structure (~/.rex, ./.rex) and the logic to manage it. This is the cornerstone of the entire system. The init command is the visible part of this.
- **Core prompt import:** The system is useless without prompts. The import command is the sole entry point for data. This must be built immediately after the file system logic.
- **Core utility compile:** Once prompts exist, they need to be transformed. A basic, manual compile command can prove that the transformation concept is viable.
- **Core deploy:** This completes the MVP loop. It makes the transformed prompts usable by placing them where they are needed. This provides the first tangible value to the end-user.
- **Add list command:** This provides necessary visibility into the system's state, making it usable without manually checking directories.
- **Build out remaining prompt commands:** With the core workflow in place, flesh out the prompt management features (remove, rename, etc.) to improve usability.
- **Layer on Automation:** Implement caching and smart detection. These are enhancements built on top of the existing, functional core.
- **Finalize with DX/Safety features:** Add --watch, --dry-run, --force, etc. These are polishing features that make the tool more professional and safer to use.

# Risks and Mitigations

## Risk: File System Complexity
Managing files and handling permissions across different operating systems (Windows, macOS, Linux) can be tricky.

**Mitigation:** Use robust, cross-platform Node.js libraries like fs-extra. Write comprehensive unit tests for all file operations on different platforms.

## Risk: MVP Scope Creep
The temptation to add "just one more feature" to the MVP is high, which could delay the initial release.

**Mitigation:** Strictly adhere to the development roadmap. The MVP is defined as the single, linear path from import to deploy. All other features (search, --watch, etc.) are explicitly designated as post-MVP.

## Risk: Utility Integration is Difficult
The design for how Utilities are defined and executed might be flawed, making it difficult to add new ones.

**Mitigation:** Develop two distinct Utilities (e.g., for GitHub Copilot and Cursor) during the V2 phase. The process of building two will expose any flaws in the core integration logic, allowing for refinement before the design is locked in.

## Risk: Poor Performance on Large Libraries
With thousands of prompts, compilation and deployment could become slow.

**Mitigation:** The caching system (hashes.json) is the primary mitigation. By only recompiling changed files, performance should remain acceptable. This must be a core part of the V2 implementation.

# Appendix

## Command-Line Interface Specifications
This section is a direct mapping of the CLI reference from the original document.

- `rex-cli prompt import <path> [--overwrite]`
- `rex-cli prompt rename <old-name> <new-name>`
- `rex-cli prompt remove <name> [-f, --force]`
- `rex-cli prompt list [-f <format>] [--sort <field>]`
- `rex-cli prompt search <query> [-r, --regex] [-c, --case-sensitive]`
- `rex-cli prompt export <name> <output> [-f <format>]`
- `rex-cli utility enable|disable|set|list <utility-name> [key] [value]`
- `rex-cli utility compile [utility-name...] [-w, --watch] [--clean] [--all]`
- `rex-cli deploy [prompt-name...] [--utility <utility-name>] [--output <path>] [--dry-run] [-f, --force]`
- `rex-cli init [-f, --force]`
- `rex-cli config get [key] [-g, --global]`
- `rex-cli config set <key> <value> [-g, --global]`
- `rex-cli config delete <key> [-g, --global]`
