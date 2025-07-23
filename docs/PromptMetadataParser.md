# PromptMetadataParser 使用指南

## 概述

`PromptMetadataParser` 是 rex-cli 中負責解析 prompt 檔案 YAML frontmatter 的核心模組。它能夠從原始 prompt 檔案中提取 `tags`、`category` 等 metadata，並提供強大的過濾和快取功能。

## 功能特色

- 🔍 **解析 YAML frontmatter**: 支援複雜的 frontmatter 格式
- 🏷️ **靈活的 tags 處理**: 支援陣列和逗號分隔字串格式
- ⚡ **智慧快取**: 基於檔案修改時間的高效快取機制
- 🔄 **批次處理**: 並行解析多個檔案以提升效能
- 🎯 **進階過濾**: 根據 tags 和 category 進行複雜過濾

## 基本使用

### 初始化

```javascript
const PromptMetadataParser = require('./PromptMetadataParser');
const parser = new PromptMetadataParser();
```

### 解析單個檔案

```javascript
const metadata = await parser.parseMetadata('code-review.md');
console.log(metadata);
// {
//   tags: ['javascript', 'typescript', 'code-review'],
//   category: 'development',
//   type: 'prompt',
//   name: 'code-review',
//   description: '程式碼審查助手',
//   version: '1.0.0',
//   author: 'rex-cli-user'
// }
```

### 批次解析多個檔案

```javascript
const promptNames = ['web-dev.md', 'api-design.md', 'testing.md'];
const results = await parser.parseMultiple(promptNames);

Object.entries(results).forEach(([promptName, metadata]) => {
  console.log(`${promptName}:`, metadata.tags);
});
```

## 支援的 Frontmatter 格式

### 1. 陣列格式 tags
```yaml
---
type: prompt
name: example
tags: [javascript, react, frontend]
category: web-development
---
```

### 2. 字串格式 tags
```yaml
---
type: prompt  
name: example
tags: "javascript, react, frontend"
category: web-development
---
```

### 3. 混合格式
```yaml
---
type: prompt
name: example
description: 範例 prompt
tags: [typescript, "node.js", backend]
category: server-side
version: 2.1.0
author: developer
---
```

## 進階功能

### 過濾功能

```javascript
const promptNames = ['react-app.md', 'node-api.md', 'vue-component.md'];

// 根據 tags 過濾
const frontendPrompts = await parser.filterPrompts(promptNames, {
  tags: ['frontend', 'javascript']
});

// 根據 category 過濾  
const webPrompts = await parser.filterPrompts(promptNames, {
  category: 'web-development'
});

// 排除特定 tags
const stablePrompts = await parser.filterPrompts(promptNames, {
  excludeTags: ['experimental', 'draft']
});

// 組合過濾條件
const filtered = await parser.filterPrompts(promptNames, {
  tags: ['react'],
  category: 'frontend', 
  excludeTags: ['deprecated']
});
```

### 快取管理

```javascript
// 取得快取統計
const stats = parser.getCacheStats();
console.log('快取檔案數:', stats.cacheSize);
console.log('快取檔案列表:', stats.cachedFiles);

// 清除特定檔案快取
parser.clearCache('outdated-prompt.md');

// 清除所有快取
parser.clearCache();
```

## 在 DeploymentManager 中的整合

這是 Task 13.3 將會實作的核心整合邏輯：

```javascript
// 在 DeploymentManager.getCompiledFiles() 中使用
const PromptMetadataParser = require('./PromptMetadataParser');

class DeploymentManager {
  constructor() {
    this.metadataParser = new PromptMetadataParser();
  }

  async getCompiledFiles(utilityDir, promptNames = [], utility, filters = {}) {
    // 取得所有編譯檔案
    const compiledFiles = await this._scanCompiledFiles(utilityDir, promptNames);
    
    // 如果有 tag/category 過濾條件
    if (filters.tags || filters.excludeTags || filters.category) {
      // 提取對應的原始 prompt 名稱
      const sourcePromptNames = compiledFiles.map(file => 
        this._getSourcePromptName(file.fileName)
      );
      
      // 使用 metadata parser 過濾
      const filteredPromptNames = await this.metadataParser.filterPrompts(
        sourcePromptNames, 
        filters
      );
      
      // 過濾編譯檔案列表
      return compiledFiles.filter(file => 
        filteredPromptNames.includes(this._getSourcePromptName(file.fileName))
      );
    }
    
    return compiledFiles;
  }
}
```

## 效能考量

### 快取機制
- 使用 `Map` 儲存解析結果
- 基於檔案 `mtime` 判斷快取是否有效
- 自動快取失效，確保資料一致性

### 並行處理
- `parseMultiple()` 使用 `Promise.all` 並行解析
- 大量檔案處理時效能顯著提升
- 錯誤隔離，單一檔案失敗不影響其他檔案

### 記憶體管理  
- 提供 `clearCache()` 方法手動清理
- 快取只儲存必要的 metadata 資訊
- 使用 WeakMap 考慮未來版本的自動 GC

## 錯誤處理

### 檔案不存在
```javascript
try {
  const metadata = await parser.parseMetadata('nonexistent.md');
} catch (error) {
  console.error('檔案錯誤:', error.message);
  // Prompt 檔案不存在: ~/.rex/prompts/nonexistent.md
}
```

### YAML 格式錯誤
```javascript
try {
  const metadata = await parser.parseMetadata('invalid-yaml.md');
} catch (error) {
  console.error('解析錯誤:', error.message);
  // 解析 metadata 失敗 (invalid-yaml.md): YAML 解析錯誤: ...
}
```

### 批次處理中的錯誤
```javascript
const results = await parser.parseMultiple(['valid.md', 'invalid.md']);
// 錯誤檔案會包含 error 屬性，但不會中斷整個處理流程
console.log(results['invalid.md'].error); // 錯誤訊息
```

## 測試覆蓋

PromptMetadataParser 包含完整的測試套件，涵蓋：

- ✅ 各種 frontmatter 格式解析
- ✅ 快取機制驗證
- ✅ 批次處理功能
- ✅ 過濾邏輯正確性
- ✅ 錯誤處理機制
- ✅ 邊界條件測試

執行測試：
```bash
npm test PromptMetadataParser
```

## 後續整合

這個模組是 Task 13.2 的產出，後續將整合到：

- **Task 13.1**: CLI 參數解析
- **Task 13.3**: DeploymentManager 過濾邏輯
- **Task 13.4**: 配置系統整合
- **Task 13.5**: 完整功能驗證

通過這個強大的 metadata 解析器，rex-cli 將支援基於 tags 和 category 的靈活部署過濾功能！
