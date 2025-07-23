const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');

/**
 * GitHubCopilotUtility - 專為 GitHub Copilot 設計的工具
 * 支援 .github/copilot/prompts 和 .github/copilot/instructions 編譯
 */
class GitHubCopilotUtility {
  constructor() {
    this.name = 'github-copilot';
    this.description = '協助編譯符合 GitHub Copilot 的 prompt 和 instruction';
  }

  /**
   * 執行編譯
   */
  async execute(promptData) {
    try {
      const { name, content, outputDir } = promptData;
      
      // 解析內容以判斷類型和格式
      const parsedContent = await this.parseContent(content);
      
      // 根據類型設定正確的 GitHub Copilot 目錄結構
      let targetDir;
      if (parsedContent.type === 'prompt') {
        targetDir = path.join(outputDir, '.github', 'copilot', 'prompts');
        return await this.compilePrompt(name, parsedContent, targetDir);
      } else if (parsedContent.type === 'instruction') {
        targetDir = path.join(outputDir, '.github', 'copilot', 'instructions');
        return await this.compileInstruction(name, parsedContent, targetDir);
      } else {
        throw new Error('無法識別的 GitHub Copilot 文件類型');
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 解析內容並判斷類型
   */
  async parseContent(content) {
    try {
      // 嘗試解析 YAML frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      
      if (frontmatterMatch) {
        const yamlContent = frontmatterMatch[1];
        const bodyContent = frontmatterMatch[2];
        const metadata = yaml.load(yamlContent);
        
        return {
          type: metadata.type || 'prompt',
          metadata,
          body: bodyContent.trim()
        };
      } else {
        // 沒有 frontmatter，根據內容判斷
        return {
          type: this.detectType(content),
          metadata: {},
          body: content.trim()
        };
      }
    } catch (error) {
      throw new Error(`解析內容失敗: ${error.message}`);
    }
  }

  /**
   * 根據內容自動偵測類型
   */
  detectType(content) {
    // 檢查是否包含 instruction 關鍵字
    if (content.toLowerCase().includes('instruction') || 
        content.toLowerCase().includes('instructions') ||
        content.includes('你是一個') ||
        content.includes('You are a')) {
      return 'instruction';
    }
    return 'prompt';
  }

  /**
   * 編譯 GitHub Copilot Prompt
   */
  async compilePrompt(name, parsedContent, outputDir) {
    try {
      // 確保輸出目錄存在
      await fs.ensureDir(outputDir);
      
      // 建構符合 GitHub Copilot 的 prompt 格式
      const prompt = this.buildPromptStructure(name, parsedContent);
      
      // 輸出到 Markdown 檔案
const outputFileName = `${name}.prompt.md`;
      const outputPath = path.join(outputDir, outputFileName);
      
      await fs.writeFile(outputPath, prompt, 'utf8');
      
      return {
        success: true,
        outputPath: outputPath,
        message: `✅ GitHub Copilot Prompt 編譯完成: ${outputFileName}`,
        type: 'prompt'
      };
    } catch (error) {
      throw new Error(`編譯 prompt 失敗: ${error.message}`);
    }
  }

  /**
   * 編譯 GitHub Copilot Instruction
   */
  async compileInstruction(name, parsedContent, outputDir) {
    try {
      // 確保輸出目錄存在
      await fs.ensureDir(outputDir);
      
      // 建構符合 GitHub Copilot 的 instruction 格式
      const instruction = this.buildInstructionStructure(name, parsedContent);
      
      // 輸出到 Markdown 檔案
const outputFileName = `${name}.instruction.md`;
      const outputPath = path.join(outputDir, outputFileName);
      
      await fs.writeFile(outputPath, instruction, 'utf8');
      
      return {
        success: true,
        outputPath: outputPath,
        message: `✅ GitHub Copilot Instruction 編譯完成: ${outputFileName}`,
        type: 'instruction'
      };
    } catch (error) {
      throw new Error(`編譯 instruction 失敗: ${error.message}`);
    }
  }

  /**
   * 建構 GitHub Copilot Prompt 結構
   */
  buildPromptStructure(name, parsedContent) {
    const { metadata, body } = parsedContent;
    
    // 建構 YAML frontmatter
    const promptMetadata = {
      name: metadata.name || name,
      description: metadata.description || `GitHub Copilot prompt for ${name}`,
      version: metadata.version || '1.0.0',
      author: metadata.author || 'rex-cli',
      tags: metadata.tags || ['general'],
      ...metadata
    };
    
    // 移除不必要的欄位
    delete promptMetadata.type;
    
    const yamlHeader = yaml.dump(promptMetadata, { 
      indent: 2,
      lineWidth: -1 
    });
    
    return `---\n${yamlHeader}---\n\n${body}`;
  }

  /**
   * 建構 GitHub Copilot Instruction 結構
   */
  buildInstructionStructure(name, parsedContent) {
    const { metadata, body } = parsedContent;
    
    // 建構 YAML frontmatter
    const instructionMetadata = {
      name: metadata.name || name,
      description: metadata.description || `GitHub Copilot instruction for ${name}`,
      version: metadata.version || '1.0.0',
      author: metadata.author || 'rex-cli',
      scope: metadata.scope || ['workspace'],
      priority: metadata.priority || 'normal',
      ...metadata
    };
    
    // 移除不必要的欄位
    delete instructionMetadata.type;
    
    const yamlHeader = yaml.dump(instructionMetadata, { 
      indent: 2,
      lineWidth: -1 
    });
    
    return `---\n${yamlHeader}---\n\n${body}`;
  }

  /**
   * 驗證 GitHub Copilot 檔案格式
   */
  async validateFormat(filePath, type) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const parsed = await this.parseContent(content);
      
      if (type === 'prompt') {
        return this.validatePromptFormat(parsed);
      } else if (type === 'instruction') {
        return this.validateInstructionFormat(parsed);
      }
      
      return { valid: false, errors: ['未知的檔案類型'] };
    } catch (error) {
      return { valid: false, errors: [error.message] };
    }
  }

  /**
   * 驗證 Prompt 格式
   */
  validatePromptFormat(parsed) {
    const errors = [];
    const { metadata, body } = parsed;
    
    if (!metadata.name) errors.push('缺少必要的 name 欄位');
    if (!metadata.description) errors.push('缺少必要的 description 欄位');
    if (!body || body.trim().length === 0) errors.push('內容不能為空');
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 驗證 Instruction 格式
   */
  validateInstructionFormat(parsed) {
    const errors = [];
    const { metadata, body } = parsed;
    
    if (!metadata.name) errors.push('缺少必要的 name 欄位');
    if (!metadata.description) errors.push('缺少必要的 description 欄位');
    if (!metadata.scope) errors.push('缺少必要的 scope 欄位');
    if (!body || body.trim().length === 0) errors.push('內容不能為空');
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 生成 GitHub Copilot 目錄結構
   */
  async generateCopilotStructure(projectPath) {
    const copilotDir = path.join(projectPath, '.github', 'copilot');
    const promptsDir = path.join(copilotDir, 'prompts');
    const instructionsDir = path.join(copilotDir, 'instructions');
    
    // 建立目錄結構
    await fs.ensureDir(promptsDir);
    await fs.ensureDir(instructionsDir);
    
    // 建立範例檔案
    const samplePrompt = `---
name: code-review
description: Help with code review suggestions
version: 1.0.0
author: rex-cli
tags: [code-review, development]
---

Please review this code and provide suggestions for improvement, focusing on:
1. Code quality and best practices
2. Performance optimizations
3. Security considerations
4. Maintainability
`;

    const sampleInstruction = `---
name: coding-standards
description: Enforce coding standards and conventions
version: 1.0.0
author: rex-cli
scope: [workspace]
priority: high
---

When writing code, please follow these guidelines:
- Use consistent indentation (2 spaces for JavaScript/TypeScript)
- Add meaningful comments for complex logic
- Follow naming conventions (camelCase for variables, PascalCase for classes)
- Write unit tests for new functionality
`;

    await fs.writeFile(path.join(promptsDir, 'code-review.prompt.md'), samplePrompt);
    await fs.writeFile(path.join(instructionsDir, 'coding-standards.instruction.md'), sampleInstruction);
    
    return {
      success: true,
      message: '✅ GitHub Copilot 目錄結構已建立',
      paths: {
        copilotDir,
        promptsDir,
        instructionsDir
      }
    };
  }
}

module.exports = GitHubCopilotUtility;
