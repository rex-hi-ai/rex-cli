# Configuration System

Rex CLI 支援多層級配置系統，配置的優先順序為：

1. **CLI flags** (最高優先級)
2. **Project settings** (`./.rex/config.json`)
3. **Global settings** (`~/.rex/config.json`) (最低優先級)

## 配置文件範例

### 全域配置 (`~/.rex/config.json`)

```json
{
  "deploy": {
    "defaultUtility": "github-copilot",
    "defaultOutput": ".github",
    "force": false,
    "dryRun": false
  },
  "ai": {
    "provider": "openai",
    "apiKey": "${OPENAI_API_KEY}"
  }
}
```

### 專案配置 (`./.rex/config.json`)

```json
{
  "deploy": {
    "defaultOutput": ".vscode",
    "dryRun": true,
    "prompts": ["code-review", "test-helper"]
  },
  "compilation": {
    "incremental": true,
    "clean": false
  }
}
```

## 使用方式

### 在 CLI 命令中

```bash
# 使用配置中的預設設定
rex-cli deploy

# CLI flags 會覆蓋配置文件
rex-cli deploy --utility github-copilot --output custom-dir --force

# 顯示當前生效的配置
rex-cli config show
```

### 在程式中使用

```javascript
const ConfigurationManager = require('./ConfigurationManager');

async function deployWithConfiguration() {
  const configManager = new ConfigurationManager();
  
  // 載入配置（會自動合併全域、專案和 CLI 選項）
  await configManager.loadConfiguration({ 
    force: true,  // CLI 選項
    output: 'custom-output' 
  });
  
  // 取得配置值（支援點記法）
  const utility = configManager.get('deploy.defaultUtility');
  const outputDir = configManager.get('deploy.defaultOutput', '.');
  const isDryRun = configManager.get('deploy.dryRun', false);
  
  // 驗證必要配置
  configManager.validateRequiredConfig(['deploy.defaultUtility']);
  
  // 取得所有配置
  const allConfig = configManager.getAll();
  
  console.log('Current configuration:', allConfig);
}
```

## 配置項目說明

### Deploy 相關

- `deploy.defaultUtility`: 預設使用的工具（如 'github-copilot'）
- `deploy.defaultOutput`: 預設輸出目錄
- `deploy.force`: 是否強制覆蓋現有文件
- `deploy.dryRun`: 是否為乾運行模式
- `deploy.prompts`: 預設要部署的 prompts 清單

### AI 相關

- `ai.provider`: AI 提供者（如 'openai', 'anthropic'）
- `ai.apiKey`: API 金鑰（支援環境變數）

### 編譯相關

- `compilation.incremental`: 是否使用增量編譯
- `compilation.clean`: 編譯前是否清理

## 配置優先順序範例

假設有以下配置：

**全域配置**: `deploy.defaultUtility = "github-copilot"`
**專案配置**: `deploy.defaultUtility = "vscode"`
**CLI 選項**: `--utility cursor`

最終生效的配置會是：`deploy.defaultUtility = "cursor"`

CLI 選項具有最高優先級，其次是專案配置，最後是全域配置。

## 配置管理指令

```bash
# 初始化專案配置
rex-cli init

# 設定全域配置
rex-cli config set global deploy.defaultUtility github-copilot

# 設定專案配置
rex-cli config set project deploy.dryRun true

# 檢視當前配置
rex-cli config show

# 重設配置
rex-cli config reset
```

## 配置文件自動生成

當你運行 `rex-cli init` 時，會自動在專案目錄建立 `./.rex/config.json` 配置文件。
全域配置文件會在首次使用時自動建立在 `~/.rex/config.json`。

## 進階用法

### 動態配置

你可以在程式中動態修改配置：

```javascript
const configManager = new ConfigurationManager();
await configManager.loadConfiguration();

// 動態設定值
configManager.set('deploy.customSetting', 'value');

// 儲存到專案配置
await configManager.saveProjectConfig({
  deploy: {
    defaultUtility: 'new-utility'
  }
});
```

### 配置驗證

```javascript
// 驗證必要的配置項目
try {
  configManager.validateRequiredConfig([
    'deploy.defaultUtility',
    'ai.provider'
  ]);
} catch (error) {
  console.error('Missing configuration:', error.message);
}
```
