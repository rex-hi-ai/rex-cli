const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const GitHubCopilotUtility = require('../src/GitHubCopilotUtility');

describe('GitHubCopilotUtility', () => {
  let utility;
  let tempDir;

  beforeEach(async () => {
    utility = new GitHubCopilotUtility();
    tempDir = path.join(os.tmpdir(), `rex-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  describe('parseContent', () => {
    test('should parse content with YAML frontmatter', async () => {
      const content = `---
name: test-prompt
description: Test description
type: prompt
tags: [test, example]
---

This is the prompt content.`;

      const result = await utility.parseContent(content);
      
      expect(result.type).toBe('prompt');
      expect(result.metadata.name).toBe('test-prompt');
      expect(result.metadata.description).toBe('Test description');
      expect(result.metadata.tags).toEqual(['test', 'example']);
      expect(result.body).toBe('This is the prompt content.');
    });

    test('should parse content without frontmatter', async () => {
      const content = 'Simple prompt content without frontmatter.';

      const result = await utility.parseContent(content);
      
      expect(result.type).toBe('prompt');
      expect(result.metadata).toEqual({});
      expect(result.body).toBe('Simple prompt content without frontmatter.');
    });

    test('should detect instruction type from content', async () => {
      const content = 'You are a helpful assistant that provides coding instructions.';

      const result = await utility.parseContent(content);
      
      expect(result.type).toBe('instruction');
      expect(result.body).toBe('You are a helpful assistant that provides coding instructions.');
    });
  });

  describe('compilePrompt', () => {
    test('should compile prompt with metadata', async () => {
      const name = 'test-prompt';
      const parsedContent = {
        type: 'prompt',
        metadata: {
          description: 'Test prompt',
          tags: ['test']
        },
        body: 'This is a test prompt.'
      };

      const result = await utility.compilePrompt(name, parsedContent, tempDir);
      
      expect(result.success).toBe(true);
      expect(result.type).toBe('prompt');
      expect(result.outputPath).toContain(`${name}.prompt.md`);

      // 檢查輸出檔案
      const outputContent = await fs.readFile(result.outputPath, 'utf8');
      expect(outputContent).toMatch(/^---\n/);
      expect(outputContent).toContain('name: test-prompt');
      expect(outputContent).toContain('description: Test prompt');
      expect(outputContent).toContain('This is a test prompt.');
    });

    test('should compile prompt with default metadata', async () => {
      const name = 'simple-prompt';
      const parsedContent = {
        type: 'prompt',
        metadata: {},
        body: 'Simple prompt body.'
      };

      const result = await utility.compilePrompt(name, parsedContent, tempDir);
      
      expect(result.success).toBe(true);
      
      const outputContent = await fs.readFile(result.outputPath, 'utf8');
      expect(outputContent).toContain('name: simple-prompt');
      expect(outputContent).toContain('author: rex-cli');
      expect(outputContent).toContain('version: 1.0.0');
    });
  });

  describe('compileInstruction', () => {
    test('should compile instruction with metadata', async () => {
      const name = 'test-instruction';
      const parsedContent = {
        type: 'instruction',
        metadata: {
          description: 'Test instruction',
          scope: ['workspace'],
          priority: 'high'
        },
        body: 'This is a test instruction.'
      };

      const result = await utility.compileInstruction(name, parsedContent, tempDir);
      
      expect(result.success).toBe(true);
      expect(result.type).toBe('instruction');
      expect(result.outputPath).toContain(`${name}.instruction.md`);

      // 檢查輸出檔案
      const outputContent = await fs.readFile(result.outputPath, 'utf8');
      expect(outputContent).toContain('name: test-instruction');
      expect(outputContent).toContain('scope:');
      expect(outputContent).toContain('priority: high');
      expect(outputContent).toContain('This is a test instruction.');
    });
  });

  describe('execute', () => {
    test('should execute prompt compilation', async () => {
      const promptData = {
        name: 'test-prompt',
        content: `---
type: prompt
description: Test prompt
---

Test prompt content.`,
        outputDir: tempDir
      };

      const result = await utility.execute(promptData);
      
      expect(result.success).toBe(true);
      expect(result.type).toBe('prompt');
      expect(result.message).toContain('GitHub Copilot Prompt 編譯完成');
    });

    test('should execute instruction compilation', async () => {
      const promptData = {
        name: 'test-instruction',
        content: `---
type: instruction
description: Test instruction
---

You are a helpful coding assistant.`,
        outputDir: tempDir
      };

      const result = await utility.execute(promptData);
      
      expect(result.success).toBe(true);
      expect(result.type).toBe('instruction');
      expect(result.message).toContain('GitHub Copilot Instruction 編譯完成');
    });

    test('should handle compilation errors', async () => {
      // 測試無效的輸出目錄
      const promptData = {
        name: 'test-prompt',
        content: 'Test content',
        outputDir: '/invalid/path/that/does/not/exist'
      };

      const result = await utility.execute(promptData);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('validateFormat', () => {
    test('should validate prompt format', async () => {
      const testFile = path.join(tempDir, 'test.prompt.md');
      const validContent = `---
name: test-prompt
description: Test description
---

Valid prompt content.`;

      await fs.writeFile(testFile, validContent);
      
      const result = await utility.validateFormat(testFile, 'prompt');
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    test('should detect invalid prompt format', async () => {
      const testFile = path.join(tempDir, 'invalid.prompt.md');
      const invalidContent = `---
description: Missing name field
---

`;

      await fs.writeFile(testFile, invalidContent);
      
      const result = await utility.validateFormat(testFile, 'prompt');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('缺少必要的 name 欄位');
      expect(result.errors).toContain('內容不能為空');
    });

    test('validatePromptFormat should catch missing fields', () => {
      const parsed = {
        metadata: {},
        body: ''
      };

      const result = utility.validatePromptFormat(parsed);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('缺少必要的 name 欄位'); 
      expect(result.errors).toContain('缺少必要的 description 欄位');
      expect(result.errors).toContain('內容不能為空');
    });

    test('validateInstructionFormat should catch missing fields', () => {
      const parsed = {
        metadata: {},
        body: ''
      };

      const result = utility.validateInstructionFormat(parsed);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('缺少必要的 name 欄位'); 
      expect(result.errors).toContain('缺少必要的 description 欄位');
      expect(result.errors).toContain('缺少必要的 scope 欄位');
      expect(result.errors).toContain('內容不能為空');
    });

    test('should validate instruction format', async () => {
      const testFile = path.join(tempDir, 'test.instruction.md');
      const validContent = `---
name: test-instruction
description: Test description
scope: [workspace]
---

Valid instruction content.`;

      await fs.writeFile(testFile, validContent);
      
      const result = await utility.validateFormat(testFile, 'instruction');
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('generateCopilotStructure', () => {
    test('should generate GitHub Copilot directory structure', async () => {
      const result = await utility.generateCopilotStructure(tempDir);
      
      expect(result.success).toBe(true);
      expect(result.paths.copilotDir).toBe(path.join(tempDir, '.github', 'copilot'));
      expect(result.paths.promptsDir).toBe(path.join(tempDir, '.github', 'copilot', 'prompts'));
      expect(result.paths.instructionsDir).toBe(path.join(tempDir, '.github', 'copilot', 'instructions'));

      // 檢查目錄是否存在
      expect(await fs.pathExists(result.paths.copilotDir)).toBe(true);
      expect(await fs.pathExists(result.paths.promptsDir)).toBe(true);
      expect(await fs.pathExists(result.paths.instructionsDir)).toBe(true);

      // 檢查範例檔案是否存在
      const samplePromptPath = path.join(result.paths.promptsDir, 'code-review.prompt.md');
      const sampleInstructionPath = path.join(result.paths.instructionsDir, 'coding-standards.instruction.md');
      
      expect(await fs.pathExists(samplePromptPath)).toBe(true);
      expect(await fs.pathExists(sampleInstructionPath)).toBe(true);
    });
  });

  describe('error handling', () => {
    test('should handle unknown document type in execute', async () => {
      const promptData = {
        name: 'test',
        content: `---
type: unknown
---
Test content`,
        outputDir: tempDir
      };

      const result = await utility.execute(promptData);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('無法識別的 GitHub Copilot 文件類型');
    });

    test('should handle YAML parsing errors', async () => {
      // Mock yaml.load to throw an error
      const yaml = require('js-yaml');
      const originalLoad = yaml.load;
      yaml.load = jest.fn(() => {
        throw new Error('YAMLException: bad indentation of a mapping entry');
      });
      
      const contentWithFrontmatter = `---
name: test
---
Test content`;
      
      await expect(utility.parseContent(contentWithFrontmatter))
        .rejects.toThrow('解析內容失敗');
      
      // Restore original function
      yaml.load = originalLoad;
    });

    test('should handle compileInstruction errors', async () => {
      jest.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('Write failed'));
      
      const parsedContent = {
        type: 'instruction',
        metadata: { name: 'test' },
        body: 'Test body'
      };

      await expect(utility.compileInstruction('test', parsedContent, tempDir))
        .rejects.toThrow('編譯 instruction 失敗');
      
      fs.writeFile.mockRestore();
    });

    test('should handle unknown type in validateFormat', async () => {
      const testFile = path.join(tempDir, 'test.unknown.md');
      await fs.writeFile(testFile, 'test content');
      
      const result = await utility.validateFormat(testFile, 'unknown');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('未知的檔案類型');
    });

    test('should handle file read errors in validateFormat', async () => {
      const nonExistentFile = path.join(tempDir, 'non-existent.md');
      
      const result = await utility.validateFormat(nonExistentFile, 'prompt');
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('detectType', () => {
    test('should detect instruction type with Chinese keywords', async () => {
      const content = '你是一個專業的程式設計師助手';
      const result = await utility.parseContent(content);
      expect(result.type).toBe('instruction');
    });

    test('should detect instruction type with instructions keyword', async () => {
      const content = 'Follow these instructions carefully';
      const result = await utility.parseContent(content);
      expect(result.type).toBe('instruction');
    });

    test('should default to prompt type', async () => {
      const content = 'This is a regular prompt content';
      const result = await utility.parseContent(content);
      expect(result.type).toBe('prompt');
    });
  });
});
