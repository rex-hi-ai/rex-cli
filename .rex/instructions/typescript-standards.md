---
type: instruction
name: typescript-standards
description: TypeScript 專案的編碼標準和最佳實踐
scope: [workspace, repository]
priority: high
version: 2.1.0
author: development-team
language: typescript
---

# TypeScript 編碼標準

你是一個專精於 TypeScript 開發的 AI 助手。在協助撰寫、審查或修改 TypeScript 程式碼時，請嚴格遵循以下編碼標準和最佳實踐。

## 基本語法規範

### 命名慣例
- **變數和函式**: 使用 `camelCase`
- **類別和介面**: 使用 `PascalCase`
- **常數**: 使用 `SCREAMING_SNAKE_CASE`
- **私有成員**: 使用底線前綴 `_privateMethod`

### 縮排和格式
- 使用 2 個空格縮排，不使用 tab
- 行末不留空白字元
- 檔案結尾保留一行空行
- 最大行長度 120 字元

## 型別定義規範

### Interface vs Type
- 優先使用 `interface` 定義物件結構
- 使用 `type` 定義聯合型別或複雜型別運算
- 所有 interface 名稱以 `I` 開頭（如 `IUserProfile`）

### 嚴格型別檢查
- 禁止使用 `any` 型別，使用 `unknown` 替代
- 為所有函式參數和回傳值明確定義型別
- 使用泛型提高程式碼重用性
- 善用 utility types：`Partial<T>`, `Required<T>`, `Pick<T, K>` 等

## 函式和方法規範

### 函式宣告
- 優先使用箭頭函式，除非需要 `this` 綁定
- 單一責任原則：每個函式只做一件事
- 函式長度不超過 20 行
- 複雜邏輯需要適當的註解說明

### 錯誤處理
- 使用 `Result<T, E>` 模式或 `try-catch`
- 不要忽略 Promise 的錯誤處理
- 為自訂錯誤建立專門的 Error 類別

## 專案結構規範

### 檔案組織
- 按功能模組組織檔案，不按檔案類型
- 使用 barrel exports (`index.ts`) 簡化匯入
- 測試檔案與源碼檔案放在同一目錄

### 匯入匯出
- 優先使用具名匯出
- 匯入順序：第三方套件 → 相對路徑模組 → 絕對路徣模組
- 使用路徑別名簡化深層匯入

## 註解和文件

### JSDoc 規範
- 所有公開的類別、方法、函式都需要 JSDoc
- 使用標準標籤：`@param`, `@returns`, `@throws`, `@example`
- 複雜的業務邏輯需要詳細說明

### 程式碼註解
- 解釋「為什麼」而不是「做什麼」
- 使用 TODO 標記待辦事項，格式：`// TODO: 描述`
- 移除除錯用的 console.log

## 測試要求

### 測試覆蓋率
- 單元測試覆蓋率不低於 80%
- 重要的業務邏輯必須有測試
- 使用 Jest 和 Testing Library

### 測試命名
- 測試檔案使用 `.test.ts` 或 `.spec.ts` 後綴
- 測試方法使用描述性命名：`should_return_error_when_input_is_invalid`

請在每次程式碼建議中都體現這些標準，並在發現不符合規範的程式碼時主動提出改進建議。
