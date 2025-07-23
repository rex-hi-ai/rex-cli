const CursorUtility = require('../CursorUtility');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

describe('CursorUtility', () => {
  let cursorUtility;
  let tempDir;

  beforeEach(async () => {
    cursorUtility = new CursorUtility();
    tempDir = path.join(os.tmpdir(), `cursor-test-${Date.now()}-${Math.random().toString(36).substring(7)}`);
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  describe('constructor', () => {
    it('should initialize with correct name and description', () => {
      expect(cursorUtility.name).toBe('cursor');
      expect(cursorUtility.description).toBe('協助編譯符合 Cursor AI 的規則檔和配置');
    });
  });

  describe('detectType', () => {
    it('should detect rule type', () => {
      const content = 'Follow these coding rules for better quality';
      expect(cursorUtility.detectType(content)).toBe('rule');
    });

    it('should detect setting type', () => {
      const content = 'Configure the editor settings for optimal performance';
      expect(cursorUtility.detectType(content)).toBe('setting');
    });

    it('should default to prompt type', () => {
      const content = 'Help me write better code';
      expect(cursorUtility.detectType(content)).toBe('prompt');
    });
  });

  describe('parseContent', () => {
    it('should parse content with YAML frontmatter', async () => {
      const content = `---
type: rule
title: Code Quality Rules
description: Basic coding standards
priority: high
tags: [quality, standards]
---

1. Use meaningful variable names
2. Add comments for complex logic
3. Follow consistent indentation`;

      const parsed = await cursorUtility.parseContent(content);
      
      expect(parsed.type).toBe('rule');
      expect(parsed.metadata.title).toBe('Code Quality Rules');
      expect(parsed.metadata.priority).toBe('high');
      expect(parsed.metadata.tags).toEqual(['quality', 'standards']);
      expect(parsed.body).toContain('Use meaningful variable names');
    });

    it('should parse content without frontmatter', async () => {
      const content = 'Always write unit tests for new functionality';
      const parsed = await cursorUtility.parseContent(content);
      
      expect(parsed.type).toBe('prompt');
      expect(parsed.metadata).toEqual({});
      expect(parsed.body).toBe('Always write unit tests for new functionality');
    });

    it('should handle quoted string values in YAML', async () => {
      const content = `---
title: "Quoted Title"
description: Basic standards
---

Content here`;
      
      const parsed = await cursorUtility.parseContent(content);
      expect(parsed.metadata.title).toBe('Quoted Title');
    });

    it('should handle boolean values in YAML', async () => {
      const content = `---
enabled: true
disabled: false
---

Content here`;
      
      const parsed = await cursorUtility.parseContent(content);
      expect(parsed.metadata.enabled).toBe(true);
      expect(parsed.metadata.disabled).toBe(false);
    });

    it('should handle YAML parsing errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // Force a YAML parsing error by mocking String.prototype.split to throw
      const originalSplit = String.prototype.split;
      jest.spyOn(String.prototype, 'split').mockImplementationOnce(() => {
        throw new Error('YAML parsing error');
      });
      
      const content = `---
type: rule
title: Test
---

Content here`;
      
      const parsed = await cursorUtility.parseContent(content);
      expect(parsed.metadata).toEqual({});
      expect(consoleSpy).toHaveBeenCalledWith('YAML 解析失敗，使用預設解析:', 'YAML parsing error');
      
      // Restore mocks
      String.prototype.split = originalSplit;
      consoleSpy.mockRestore();
    });

    it('should throw error on parse failure', async () => {
      // Mock fs to throw an error
      jest.spyOn(String.prototype, 'match').mockImplementationOnce(() => {
        throw new Error('Parse error');
      });
      
      await expect(cursorUtility.parseContent('content')).rejects.toThrow('解析內容失敗');
      
      String.prototype.match.mockRestore();
    });
  });

  describe('compileRule', () => {
    it('should create .cursorrules file for rule type', async () => {
      const promptData = {
        name: 'coding-standards',
        content: `---
type: rule
title: Coding Standards
description: Project coding standards
---

1. Use TypeScript for type safety
2. Follow ESLint configuration
3. Write comprehensive tests`,
        outputDir: tempDir
      };

      const result = await cursorUtility.execute(promptData);

      expect(result.success).toBe(true);
      expect(result.type).toBe('rule');
      expect(result.message).toContain('Cursor 規則編譯完成');

      const outputPath = path.join(tempDir, '.cursorrules');
      expect(await fs.pathExists(outputPath)).toBe(true);

      const content = await fs.readFile(outputPath, 'utf8');
      expect(content).toContain('# Coding Standards');
      expect(content).toContain('## Description');
      expect(content).toContain('Project coding standards');
      expect(content).toContain('Use TypeScript for type safety');
    });

    it('should append to existing .cursorrules file', async () => {
      const outputPath = path.join(tempDir, '.cursorrules');
      const existingContent = '# Existing Rules\n\nSome existing rules here';
      await fs.writeFile(outputPath, existingContent, 'utf8');

      const promptData = {
        name: 'new-rules',
        content: `---
type: rule
title: New Rules
---

Additional rules here`,
        outputDir: tempDir
      };

      await cursorUtility.execute(promptData);

      const content = await fs.readFile(outputPath, 'utf8');
      expect(content).toContain('# Existing Rules');
      expect(content).toContain('---'); // Separator
      expect(content).toContain('# New Rules');
    });

    it('should handle read error when appending to existing file', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // Mock fs.pathExists to return true but fs.readFile to throw error
      jest.spyOn(fs, 'pathExists').mockResolvedValueOnce(true);
      jest.spyOn(fs, 'readFile').mockRejectedValueOnce(new Error('Read error'));
      
      const promptData = {
        name: 'test-rule',
        content: `---
type: rule
---
Test rule content`,
        outputDir: tempDir
      };

      const result = await cursorUtility.execute(promptData);
      
      expect(result.success).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith('讀取現有 .cursorrules 失敗，將建立新檔案');
      
      fs.pathExists.mockRestore();
      fs.readFile.mockRestore();
      consoleSpy.mockRestore();
    });

    it('should handle compilation error', async () => {
      // Mock writeFile to throw error
      jest.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('Write error'));
      
      const promptData = {
        name: 'test-rule',
        content: `---
type: rule
---
Test rule content`,
        outputDir: tempDir
      };

      const result = await cursorUtility.execute(promptData);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('編譯規則失敗');
      
      fs.writeFile.mockRestore();
    });
  });

  describe('compileSetting', () => {
    it('should create .cursor/settings.json for setting type', async () => {
      const promptData = {
        name: 'editor-config',
        content: `---
type: setting
---

{
  "cursor.ai.enabled": true,
  "cursor.ai.model": "gpt-4",
  "cursor.completions.enabled": true
}`,
        outputDir: tempDir
      };

      const result = await cursorUtility.execute(promptData);

      expect(result.success).toBe(true);
      expect(result.type).toBe('setting');

      const outputPath = path.join(tempDir, '.cursor', 'settings.json');
      expect(await fs.pathExists(outputPath)).toBe(true);

      const settings = await fs.readJson(outputPath);
      expect(settings['cursor.ai.enabled']).toBe(true);
      expect(settings['cursor.ai.model']).toBe('gpt-4');
    });

    it('should merge with existing settings', async () => {
      const cursorDir = path.join(tempDir, '.cursor');
      await fs.ensureDir(cursorDir);
      const settingsPath = path.join(cursorDir, 'settings.json');
      
      const existingSettings = { 'existing.setting': 'value' };
      await fs.writeJson(settingsPath, existingSettings);

      const promptData = {
        name: 'new-setting',
        content: `---
type: setting
---

{
  "cursor.new.setting": "new-value"
}`,
        outputDir: tempDir
      };

      await cursorUtility.execute(promptData);

      const settings = await fs.readJson(settingsPath);
      expect(settings['existing.setting']).toBe('value');
      expect(settings['cursor.new.setting']).toBe('new-value');
    });

    it('should handle read error when merging with existing settings', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const cursorDir = path.join(tempDir, '.cursor');
      await fs.ensureDir(cursorDir);
      const settingsPath = path.join(cursorDir, 'settings.json');
      
      // Create file but mock readJson to throw error
      await fs.writeFile(settingsPath, 'invalid json', 'utf8');
      jest.spyOn(fs, 'pathExists').mockResolvedValueOnce(true);
      jest.spyOn(fs, 'readJson').mockRejectedValueOnce(new Error('Parse error'));
      
      const promptData = {
        name: 'test-setting',
        content: `---
type: setting
---
{"test": "value"}`,
        outputDir: tempDir
      };

      const result = await cursorUtility.execute(promptData);
      
      expect(result.success).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith('讀取現有 Cursor settings.json 失敗，將建立新檔案');
      
      fs.pathExists.mockRestore();
      fs.readJson.mockRestore();
      consoleSpy.mockRestore();
    });

    it('should handle non-JSON content in buildSettingStructure', async () => {
      const promptData = {
        name: 'simple-setting',
        content: `---
type: setting
key: cursor.test.enabled
value: true
description: Test setting
---

Non-JSON content here`,
        outputDir: tempDir
      };

      const result = await cursorUtility.execute(promptData);
      
      expect(result.success).toBe(true);
      
      const outputPath = path.join(tempDir, '.cursor', 'settings.json');
      const settings = await fs.readJson(outputPath);
      
      expect(settings['cursor.test.enabled']).toBe(true);
      expect(settings['cursor.simple-setting.description']).toBe('Test setting');
    });

    it('should handle compilation error', async () => {
      jest.spyOn(fs, 'writeJson').mockRejectedValueOnce(new Error('Write error'));
      
      const promptData = {
        name: 'test-setting',
        content: `---
type: setting
---
{"test": "value"}`,
        outputDir: tempDir
      };

      const result = await cursorUtility.execute(promptData);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('編譯設定失敗');
      
      fs.writeJson.mockRestore();
    });
  });

  describe('compilePrompt', () => {
    it('should create .cursorrules file for general prompts', async () => {
      const promptData = {
        name: 'code-review',
        content: `---
title: Code Review Assistant
description: Help with code reviews
author: Test Author
tags: [review, quality]
---

Please review this code and provide suggestions for:
1. Code quality improvements
2. Performance optimizations
3. Security considerations`,
        outputDir: tempDir
      };

      const result = await cursorUtility.execute(promptData);

      expect(result.success).toBe(true);
      expect(result.type).toBe('prompt');

      const outputPath = path.join(tempDir, '.cursorrules');
      expect(await fs.pathExists(outputPath)).toBe(true);

      const content = await fs.readFile(outputPath, 'utf8');
      expect(content).toContain('# AI Assistant Rules: Code Review Assistant');
      expect(content).toContain('## Purpose');
      expect(content).toContain('Help with code reviews');
      expect(content).toContain('**Author:** Test Author');
      expect(content).toContain('**Tags:** review, quality');
      expect(content).toContain('## Instructions');
    });

    it('should append to existing .cursorrules file for prompt', async () => {
      const outputPath = path.join(tempDir, '.cursorrules');
      const existingContent = '# Existing Content';
      await fs.writeFile(outputPath, existingContent, 'utf8');
      
      const promptData = {
        name: 'test-prompt',
        content: 'Simple prompt content',
        outputDir: tempDir
      };

      const result = await cursorUtility.execute(promptData);
      
      expect(result.success).toBe(true);
      
      const content = await fs.readFile(outputPath, 'utf8');
      expect(content).toContain('# Existing Content');
      expect(content).toContain('---'); // Separator
      expect(content).toContain('# AI Assistant Rules: test-prompt');
    });

    it('should handle read error when appending to existing prompt file', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const outputPath = path.join(tempDir, '.cursorrules');
      
      // Mock pathExists to return true, then mock readFile to throw error
      jest.spyOn(fs, 'pathExists').mockResolvedValueOnce(true);
      jest.spyOn(fs, 'readFile').mockRejectedValueOnce(new Error('Read error'));
      
      const promptData = {
        name: 'test-prompt',
        content: 'Simple prompt content',
        outputDir: tempDir
      };

      const result = await cursorUtility.execute(promptData);
      
      expect(result.success).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith('讀取現有 .cursorrules 失敗，將建立新檔案');
      
      fs.pathExists.mockRestore();
      fs.readFile.mockRestore();
      consoleSpy.mockRestore();
    });

    it('should handle compilation error in compilePrompt', async () => {
      jest.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('Write error'));
      
      const promptData = {
        name: 'test-prompt',
        content: 'Simple prompt content',
        outputDir: tempDir
      };

      const result = await cursorUtility.execute(promptData);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('編譯 prompt 失敗');
      
      fs.writeFile.mockRestore();
    });

    it('should create prompt with version metadata', async () => {
      const promptData = {
        name: 'versioned-prompt',
        content: `---
title: Versioned Prompt
version: 2.0
---

Prompt with version info`,
        outputDir: tempDir
      };

      const result = await cursorUtility.execute(promptData);
      
      expect(result.success).toBe(true);
      
      const outputPath = path.join(tempDir, '.cursorrules');
      const content = await fs.readFile(outputPath, 'utf8');
      expect(content).toContain('**Version:** 2.0');
    });
  });

  describe('formatAsInstructions', () => {
    it('should keep existing list format', () => {
      const content = `1. First instruction
2. Second instruction
3. Third instruction`;
      
      const result = cursorUtility.formatAsInstructions(content);
      expect(result).toBe(content);
    });

    it('should convert single paragraph to instruction', () => {
      const content = 'Help me write better code with proper error handling.';
      const result = cursorUtility.formatAsInstructions(content);
      expect(result).toBe('You are an AI assistant. Help me write better code with proper error handling.');
    });

    it('should convert multiple paragraphs to numbered list', () => {
      const content = `Focus on code quality and maintainability.

Ensure proper error handling throughout the application.

Write comprehensive unit tests for new features.`;
      
      const result = cursorUtility.formatAsInstructions(content);
      expect(result).toContain('1. Focus on code quality and maintainability.');
      expect(result).toContain('2. Ensure proper error handling throughout the application.');
      expect(result).toContain('3. Write comprehensive unit tests for new features.');
    });
  });

  describe('validateFormat', () => {
    it('should validate rule format', async () => {
      const content = `---
type: rule
---

Follow these coding rules for better quality`;
      
      const tempFile = path.join(tempDir, 'test.md');
      await fs.writeFile(tempFile, content, 'utf8');
      
      const result = await cursorUtility.validateFormat(tempFile, 'rule');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should invalidate empty rule', async () => {
      const content = `---
type: rule
---

`;
      
      const tempFile = path.join(tempDir, 'test.md');
      await fs.writeFile(tempFile, content, 'utf8');
      
      const result = await cursorUtility.validateFormat(tempFile, 'rule');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('規則內容不能為空');
    });
  });

  describe('generateCursorStructure', () => {
    it('should create complete Cursor project structure', async () => {
      const result = await cursorUtility.generateCursorStructure(tempDir);
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('✅ Cursor 專案結構已建立');
      
      // Check .cursor directory exists
      const cursorDir = path.join(tempDir, '.cursor');
      expect(await fs.pathExists(cursorDir)).toBe(true);
      
      // Check .cursorrules file
      const rulesPath = path.join(tempDir, '.cursorrules');
      expect(await fs.pathExists(rulesPath)).toBe(true);
      
      const rulesContent = await fs.readFile(rulesPath, 'utf8');
      expect(rulesContent).toContain('# AI Assistant Rules');
      expect(rulesContent).toContain('## Code Quality Guidelines');
      
      // Check settings.json
      const settingsPath = path.join(cursorDir, 'settings.json');
      expect(await fs.pathExists(settingsPath)).toBe(true);
      
      const settings = await fs.readJson(settingsPath);
      expect(settings['cursor.ai.enabled']).toBe(true);
      expect(settings['cursor.ai.model']).toBe('gpt-4');
    });
  });

  describe('additional validation tests', () => {
    it('should validate setting format', async () => {
      const content = `---
type: setting
---
{"valid": "json"}`;
      
      const tempFile = path.join(tempDir, 'test-setting.md');
      await fs.writeFile(tempFile, content, 'utf8');
      
      const result = await cursorUtility.validateFormat(tempFile, 'setting');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should invalidate setting with invalid JSON and no key metadata', async () => {
      const content = `---
type: setting
---
invalid json content`;
      
      const tempFile = path.join(tempDir, 'test-setting.md');
      await fs.writeFile(tempFile, content, 'utf8');
      
      const result = await cursorUtility.validateFormat(tempFile, 'setting');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('設定內容必須是有效的 JSON 或提供 key metadata');
    });

    it('should validate setting with invalid JSON but key metadata', async () => {
      const content = `---
type: setting
key: my.setting
---
invalid json content`;
      
      const tempFile = path.join(tempDir, 'test-setting.md');
      await fs.writeFile(tempFile, content, 'utf8');
      
      const result = await cursorUtility.validateFormat(tempFile, 'setting');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return error for unknown file type validation', async () => {
      const content = `test content`;
      
      const tempFile = path.join(tempDir, 'test-unknown.md');
      await fs.writeFile(tempFile, content, 'utf8');
      
      const result = await cursorUtility.validateFormat(tempFile, 'unknown');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('未知的檔案類型');
    });

    it('should handle validation error when reading file', async () => {
      const tempFile = path.join(tempDir, 'nonexistent.md');
      
      const result = await cursorUtility.validateFormat(tempFile, 'rule');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should handle execution errors gracefully', async () => {
      const promptData = {
        name: 'test',
        content: null, // This should cause an error
        outputDir: tempDir
      };

      const result = await cursorUtility.execute(promptData);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
