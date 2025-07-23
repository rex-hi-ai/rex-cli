# GitHub Copilot Utility 使用指南

這個指南將幫助您了解如何使用 rex-cli 的 GitHub Copilot Utility，該工具專門用於編譯符合 GitHub Copilot 規範的 prompt 和 instruction 文件。

## 功能概述

GitHub Copilot Utility 提供以下功能：

1. **自動識別類型**：自動偵測內容是 prompt 還是 instruction
2. **YAML frontmatter 支援**：支援 YAML 格式的 metadata
3. **符合規範**：產生符合 GitHub Copilot 標準的 `.copilotprompt` 和 `.copilotinstruction` 檔案
4. **格式驗證**：驗證生成的檔案格式是否正確
5. **目錄結構生成**：自動建立 `.github/copilot` 目錄結構

## 基本使用方式

### 1. 編譯 Prompt

建立一個 markdown 檔案，例如 `code-review.md`：

```markdown
---
type: prompt
description: 協助進行程式碼審查的提示
tags: [code-review, javascript, best-practices]
version: 1.0.0
---

請協助審查這段程式碼，並提供以下建議：

1. 程式碼品質和最佳實踐
2. 效能最佳化機會
3. 安全性考量
4. 可維護性改進

請針對每個發現的問題提供具體的修改建議。
```

### 2. 編譯 Instruction

建立一個 instruction 檔案，例如 `coding-standards.md`：

```markdown
---
type: instruction
description: TypeScript 專案的編碼標準
scope: [workspace]
priority: high
version: 1.0.0
---

你是一個專精於 TypeScript 開發的助手。在協助撰寫程式碼時，請遵循以下規範：

## 程式碼風格
- 使用 2 個空格縮排
- 變數使用 camelCase 命名
- 類別使用 PascalCase 命名
- 常數使用 SCREAMING_SNAKE_CASE

## 型別定義
- 優先使用 interface 而非 type
- 為所有函式參數和回傳值定義型別
- 避免使用 any 型別

## 最佳實踐
- 為複雜邏輯添加註解
- 撰寫對應的單元測試
- 使用有意義的變數和函式名稱
```

### 3. 自動偵測類型

如果您不想在 frontmatter 中指定類型，工具會自動偵測：

```markdown
# 協助撰寫 API 文件

你是一個技術寫作專家，協助撰寫清晰易懂的 API 文件。

請確保文件包含：
- 清楚的端點描述
- 參數說明和範例
- 回應格式說明
- 錯誤處理資訊
```

（這會被自動識別為 instruction，因為包含了 "你是一個" 的描述）

## 進階功能

### 格式驗證

```javascript
const utility = new GitHubCopilotUtility();

// 驗證 prompt 格式
const validation = await utility.validateFormat('path/to/prompt.copilotprompt', 'prompt');
if (!validation.valid) {
  console.log('格式錯誤:', validation.errors);
}
```

### 生成目錄結構

```javascript
const utility = new GitHubCopilotUtility();

// 在專案中建立 GitHub Copilot 目錄結構
const result = await utility.generateCopilotStructure('/path/to/project');
console.log(result.message); // ✅ GitHub Copilot 目錄結構已建立
```

## 輸出格式

### Prompt 輸出格式 (`.copilotprompt`)

```yaml
---
name: code-review
description: 協助進行程式碼審查的提示
version: 1.0.0
author: rex-cli
tags:
  - code-review
  - javascript
  - best-practices
---

請協助審查這段程式碼，並提供以下建議：
...
```

### Instruction 輸出格式 (`.copilotinstruction`)

```yaml
---
name: coding-standards
description: TypeScript 專案的編碼標準
version: 1.0.0
author: rex-cli
scope:
  - workspace
priority: high
---

你是一個專精於 TypeScript 開發的助手...
```

## Metadata 欄位說明

### Prompt 必要欄位
- `name`: prompt 名稱
- `description`: prompt 描述

### Instruction 必要欄位
- `name`: instruction 名稱
- `description`: instruction 描述
- `scope`: 適用範圍（如：workspace, repository, global）

### 可選欄位
- `version`: 版本號
- `author`: 作者
- `tags`: 標籤列表（僅適用於 prompt）
- `priority`: 優先級（僅適用於 instruction）

## CLI 使用方式

使用 rex-cli 編譯：

```bash
# 編譯所有 prompts 使用 GitHub Copilot utility
rex compile --all --utility github-copilot

# 編譯特定檔案
rex compile code-review.md --utility github-copilot

# 清理後重新編譯
rex compile --all --clean --utility github-copilot
```

## 目錄結構

編譯後的檔案會輸出到：

```
.rex/
└── compiled/
    └── github-copilot/
        ├── prompt-name.copilotprompt
        └── instruction-name.copilotinstruction
```

建議的 GitHub Copilot 目錄結構：

```
.github/
└── copilot/
    ├── prompts/
    │   └── *.copilotprompt
    └── instructions/
        └── *.copilotinstruction
```

## 最佳實踐

1. **明確的 metadata**：提供清楚的 name 和 description
2. **適當的標籤**：為 prompt 添加相關標籤以便搜尋
3. **版本控制**：為您的 prompt 和 instruction 設定版本號
4. **範圍設定**：為 instruction 設定適當的 scope
5. **內容結構化**：使用清楚的標題和列表組織內容

## 錯誤處理

常見錯誤及解決方案：

- **缺少必要欄位**：確保包含所有必要的 metadata 欄位
- **內容為空**：確保 markdown 內容不為空
- **YAML 格式錯誤**：檢查 frontmatter 的 YAML 語法
- **檔案路徑問題**：確保輸出目錄存在且有寫入權限

這個工具讓您能夠輕鬆地管理和編譯 GitHub Copilot 的 prompt 和 instruction 檔案，確保符合最新的規範和最佳實踐。
