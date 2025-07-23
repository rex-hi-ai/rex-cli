const fs = require('fs-extra');
const path = require('path');

/**
 * CursorUtility - 專為 Cursor 設計的工具
 * 支援生成 .cursorrules 和相關的 Cursor AI 配置
 */
class CursorUtility {
  constructor() {
    this.name = 'cursor';
    this.description = '協助編譯符合 Cursor AI 的規則檔和配置';
  }

  /**
   * 執行編譯
   */
  async execute(promptData) {
    try {
      const { name, content, outputDir } = promptData;
      
      // 解析內容以判斷類型和格式
      const parsedContent = await this.parseContent(content);
      
      if (parsedContent.type === 'rule') {
        return await this.compileRule(name, parsedContent, outputDir);
      } else if (parsedContent.type === 'setting') {
        return await this.compileSetting(name, parsedContent, outputDir);
      } else {
        // 預設為 AI 助手 prompt，儲存為 cursorrules
        return await this.compilePrompt(name, parsedContent, outputDir);
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
        let metadata = {};
        
        try {
          // 簡單的 YAML 解析
          const lines = yamlContent.split('\n');
          for (const line of lines) {
            const match = line.match(/^(\s*)([^:]+):\s*(.*)$/);
            if (match) {
              const key = match[2].trim();
              let value = match[3].trim();
              
              // 處理數組
              if (value.startsWith('[') && value.endsWith(']')) {
                value = value.slice(1, -1).split(',').map(item => item.trim().replace(/['"]/g, ''));
              }
              // 處理字符串
              else if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
              }
              // 處理布爾值
              else if (value === 'true' || value === 'false') {
                value = value === 'true';
              }
              
              metadata[key] = value;
            }
          }
        } catch (yamlError) {
          console.warn('YAML 解析失敗，使用預設解析:', yamlError.message);
        }
        
        return {
          type: metadata.type || this.detectType(content),
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
    const lowerContent = content.toLowerCase();
    
    // 檢查是否為規則配置
    if (lowerContent.includes('rule') || lowerContent.includes('guideline') || 
        lowerContent.includes('convention') || lowerContent.includes('standard')) {
      return 'rule';
    }
    
    // 檢查是否為設定配置
    if (lowerContent.includes('setting') || lowerContent.includes('config') ||
        lowerContent.includes('preference')) {
      return 'setting';
    }
    
    return 'prompt';
  }

  /**
   * 編譯 Cursor 規則文件
   */
  async compileRule(name, parsedContent, outputDir) {
    try {
      // Cursor 的規則通常直接放在專案根目錄的 .cursorrules 文件
      const outputPath = path.join(outputDir, '.cursorrules');
      
      const ruleContent = this.buildRuleStructure(name, parsedContent);
      
      // 如果已存在 .cursorrules，追加內容
      let existingRules = '';
      if (await fs.pathExists(outputPath)) {
        try {
          existingRules = await fs.readFile(outputPath, 'utf8');
          // 加上分隔線
          existingRules += '\n\n---\n\n';
        } catch (error) {
          console.warn('讀取現有 .cursorrules 失敗，將建立新檔案');
        }
      }
      
      await fs.writeFile(outputPath, existingRules + ruleContent, 'utf8');
      
      return {
        success: true,
        outputPath,
        message: `✅ Cursor 規則編譯完成: ${name}`,
        type: 'rule'
      };
    } catch (error) {
      throw new Error(`編譯規則失敗: ${error.message}`);
    }
  }

  /**
   * 編譯 Cursor 設定
   */
  async compileSetting(name, parsedContent, outputDir) {
    try {
      const cursorDir = path.join(outputDir, '.cursor');
      await fs.ensureDir(cursorDir);
      
      const settings = this.buildSettingStructure(name, parsedContent);
      const outputPath = path.join(cursorDir, 'settings.json');
      
      // 如果已存在 settings.json，合併設定
      let existingSettings = {};
      if (await fs.pathExists(outputPath)) {
        try {
          existingSettings = await fs.readJson(outputPath);
        } catch (error) {
          console.warn('讀取現有 Cursor settings.json 失敗，將建立新檔案');
        }
      }
      
      // 合併設定
      Object.assign(existingSettings, settings);
      
      await fs.writeJson(outputPath, existingSettings, { spaces: 2 });
      
      return {
        success: true,
        outputPath,
        message: `✅ Cursor 設定編譯完成: ${name}`,
        type: 'setting'
      };
    } catch (error) {
      throw new Error(`編譯設定失敗: ${error.message}`);
    }
  }

  /**
   * 編譯一般 Cursor Prompt (作為規則)
   */
  async compilePrompt(name, parsedContent, outputDir) {
    try {
      const outputPath = path.join(outputDir, '.cursorrules');
      
      const promptContent = this.buildPromptAsRule(name, parsedContent);
      
      // 如果已存在 .cursorrules，追加內容
      let existingContent = '';
      if (await fs.pathExists(outputPath)) {
        try {
          existingContent = await fs.readFile(outputPath, 'utf8');
          // 加上分隔線
          existingContent += '\n\n---\n\n';
        } catch (error) {
          console.warn('讀取現有 .cursorrules 失敗，將建立新檔案');
        }
      }
      
      await fs.writeFile(outputPath, existingContent + promptContent, 'utf8');
      
      return {
        success: true,
        outputPath,
        message: `✅ Cursor Prompt 編譯完成: ${name}`,
        type: 'prompt'
      };
    } catch (error) {
      throw new Error(`編譯 prompt 失敗: ${error.message}`);
    }
  }

  /**
   * 建構規則結構
   */
  buildRuleStructure(name, parsedContent) {
    const { metadata, body } = parsedContent;
    
    const header = [
      `# ${metadata.title || name}`,
      '',
      metadata.description ? `## Description\n${metadata.description}\n` : '',
      metadata.scope ? `## Scope\n${metadata.scope}\n` : '',
      metadata.priority ? `## Priority\n${metadata.priority}\n` : '',
      '## Rules',
      ''
    ].filter(line => line !== '').join('\n');
    
    return header + '\n' + body;
  }

  /**
   * 建構設定結構
   */
  buildSettingStructure(name, parsedContent) {
    const { metadata, body } = parsedContent;
    
    try {
      // 嘗試解析 body 為 JSON
      const settings = JSON.parse(body);
      return settings;
    } catch (error) {
      // 如果不是 JSON，建立基本設定結構
      const settingKey = metadata.key || `cursor.${name}.enabled`;
      const settingValue = metadata.value !== undefined ? metadata.value : true;
      
      return {
        [settingKey]: settingValue,
        [`cursor.${name}.description`]: metadata.description || parsedContent.body
      };
    }
  }

  /**
   * 建構 Prompt 作為規則
   */
  buildPromptAsRule(name, parsedContent) {
    const { metadata, body } = parsedContent;
    
    const sections = [
      `# AI Assistant Rules: ${metadata.title || name}`,
      ''
    ];
    
    if (metadata.description) {
      sections.push(`## Purpose\n${metadata.description}\n`);
    }
    
    if (metadata.author) {
      sections.push(`**Author:** ${metadata.author}`);
    }
    
    if (metadata.version) {
      sections.push(`**Version:** ${metadata.version}`);
    }
    
    if (metadata.tags) {
      sections.push(`**Tags:** ${metadata.tags.join(', ')}`);
    }
    
    sections.push('', '## Instructions', '');
    
    // 將 body 格式化為指令格式
    const instructions = this.formatAsInstructions(body);
    sections.push(instructions);
    
    return sections.join('\n');
  }

  /**
   * 格式化內容為 Cursor 指令格式
   */
  formatAsInstructions(content) {
    // 如果內容已經是清單格式，保持原樣
    if (content.includes('- ') || content.includes('* ') || content.includes('1. ')) {
      return content;
    }
    
    // 否則將段落轉換為指令清單
    const paragraphs = content.split('\n\n').filter(p => p.trim());
    
    if (paragraphs.length === 1) {
      // 單一段落，作為主要指令
      return `You are an AI assistant. ${paragraphs[0]}`;
    } else {
      // 多段落，轉換為清單
      return paragraphs.map((paragraph, index) => 
        `${index + 1}. ${paragraph.replace(/^\s*[-*]\s*/, '').trim()}`
      ).join('\n\n');
    }
  }

  /**
   * 驗證 Cursor 檔案格式
   */
  async validateFormat(filePath, type) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const parsed = await this.parseContent(content);
      
      if (type === 'rule') {
        return this.validateRuleFormat(parsed);
      } else if (type === 'setting') {
        return this.validateSettingFormat(parsed);
      }
      
      return { valid: false, errors: ['未知的檔案類型'] };
    } catch (error) {
      return { valid: false, errors: [error.message] };
    }
  }

  /**
   * 驗證規則格式
   */
  validateRuleFormat(parsed) {
    const errors = [];
    const { body } = parsed;
    
    if (!body || body.trim().length === 0) errors.push('規則內容不能為空');
    
    // 檢查是否包含基本的指導內容
    const lowerBody = body.toLowerCase();
    if (!lowerBody.includes('rule') && !lowerBody.includes('should') && 
        !lowerBody.includes('must') && !lowerBody.includes('guideline')) {
      console.warn('警告：規則內容可能缺少明確的指導語句');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 驗證設定格式
   */
  validateSettingFormat(parsed) {
    const errors = [];
    const { body } = parsed;
    
    try {
      JSON.parse(body);
    } catch (jsonError) {
      if (!parsed.metadata.key) {
        errors.push('設定內容必須是有效的 JSON 或提供 key metadata');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 生成 Cursor 專案結構
   */
  async generateCursorStructure(projectPath) {
    const cursorDir = path.join(projectPath, '.cursor');
    
    // 建立 .cursor 目錄
    await fs.ensureDir(cursorDir);
    
    // 建立範例 .cursorrules 文件
    const sampleRules = `# AI Assistant Rules

## Code Quality Guidelines
1. Write clean, readable, and maintainable code
2. Follow established coding conventions and patterns
3. Add meaningful comments for complex logic
4. Use descriptive variable and function names

## Development Practices
- Prioritize code clarity over cleverness
- Write comprehensive tests for new functionality
- Consider performance implications of code changes
- Ensure proper error handling and edge case coverage

## Communication
- Explain your reasoning when making significant changes
- Ask clarifying questions when requirements are unclear
- Provide helpful suggestions for code improvements
`;

    // 建立範例 settings.json
    const sampleSettings = {
      'cursor.ai.enabled': true,
      'cursor.ai.model': 'gpt-4',
      'cursor.ai.temperature': 0.7,
      'cursor.completions.enabled': true
    };
    
    const rulesPath = path.join(projectPath, '.cursorrules');
    const settingsPath = path.join(cursorDir, 'settings.json');
    
    await fs.writeFile(rulesPath, sampleRules, 'utf8');
    await fs.writeJson(settingsPath, sampleSettings, { spaces: 2 });
    
    return {
      success: true,
      message: '✅ Cursor 專案結構已建立',
      paths: {
        cursorDir,
        rulesPath,
        settingsPath
      }
    };
  }
}

module.exports = CursorUtility;
