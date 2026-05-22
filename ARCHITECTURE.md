# 架構文件 — LINE Notion 生活管理 Bot

> 最後更新：2026-05-22

---

## 1. 系統概覽

```
使用者（LINE App）
       │
       │ HTTPS POST /webhook
       ▼
┌──────────────────────────────┐
│  Render Web Service          │
│  Node.js 18 / Express 4      │
│                              │
│  index.js                    │
│  ├─ LINE Middleware（驗簽）  │
│  ├─ lineHandler.js           │
│  │   ├─ 指令路由             │
│  │   └─ 取得發訊者名稱       │
│  ├─ messageParser.js         │
│  │   └─ 品項 / 條件解析      │
│  └─ notionService.js         │
│      └─ Notion API 操作      │
└──────────────────────────────┘
       │                │
       ▼                ▼
Notion 採購清單 DB   Notion 代辦事項 DB
```

---

## 2. 元件說明

### 2.1 `src/index.js` — 伺服器入口

- 建立 Express 應用程式，監聽 `PORT`（由 Render 注入）
- `POST /webhook`：掛載 LINE Middleware 做簽章驗證，通過後交給 `lineHandler`
- `GET /`：health check 端點，回傳 `LINE Notion Bot is running!`
- 全域 Express 錯誤 handler，捕捉 LINE Middleware 驗簽失敗等例外

### 2.2 `src/lineHandler.js` — 事件路由與指令識別

**職責：**
1. 過濾非文字訊息（忽略貼圖、圖片等）
2. 以 `message.id` 做記憶體去重（防 Webhook retry 重複寫入）
3. 取得發訊者 LINE 顯示名稱（支援個人、群組、聊天室）
4. 依優先順序比對指令，呼叫對應服務

**指令比對優先順序：**

```
說明指令  →  採購清單指令  →  代辦清單指令
→  已買 / 已放棄  →  完成 / 取消  →  代辦（待辦/todo）
→  刪除  →  採購記錄（fallback）
```

### 2.3 `src/messageParser.js` — 訊息解析

將自由格式文字拆分為 `{ item, conditions }`：

1. 掃描訊息是否包含已知家電／家具關鍵字（KNOWN_ITEMS 清單）
   - 命中 → 以關鍵字為 `item`，其餘文字（去除頭尾標點）為 `conditions`
2. 未命中 → 以第一個空白前的字詞為 `item`，其餘為 `conditions`

**範例：**

| 輸入 | item | conditions |
|------|------|-----------|
| `冰箱 有冷凍庫 預算15000內` | 冰箱 | 有冷凍庫 預算15000內 |
| `沙發` | 沙發 | （空） |
| `找搬家公司 5月底前` | 找搬家公司 | 5月底前 |

### 2.4 `src/notionService.js` — Notion API 操作

使用 `@notionhq/client` 操作兩個獨立 Notion 資料庫：

| 函式 | 說明 |
|------|------|
| `addItemToNotion` | 採購品項 upsert：同品項（待購買）累加條件；否則新建列 |
| `addTodoToNotion` | 代辦事項新增（每次皆建新列） |
| `getRecentItems` | 查詢採購清單最近 N 筆（依新增日期降冪） |
| `getRecentTodos` | 查詢代辦事項最近 N 筆（依新增日期降冪） |
| `updateItemStatus` | 依狀態類型（已完成/已取消 → 代辦DB；其他 → 採購DB）更新最新符合列 |
| `deleteItem` | 先搜尋採購DB，再搜尋代辦DB，封存（archived）最新符合列 |

**時間處理：** 所有日期以 UTC+8 寫入 Notion（ISO 8601 + `+08:00` 後綴）

---

## 3. 資料流

### 採購記錄流程

```
使用者傳「沙發 預算20000」
  │
  ▼
lineHandler：不符合任何指令，進入 fallback
  │
  ▼
messageParser：包含已知關鍵字「沙發」
  → { item: "沙發", conditions: "預算20000" }
  │
  ▼
notionService.addItemToNotion：
  查詢採購DB 是否有 品項=沙發 且 狀態=待購買
  ├─ 有，且條件已存在 → 回傳 { exists: true }
  ├─ 有，且條件不同   → 累加條件，回傳 { updated: true }
  └─ 無              → 建新列，回傳 { created: true }
  │
  ▼
lineHandler：依回傳結果組成回覆訊息
LINE Bot 回覆使用者
```

### 代辦記錄流程

```
使用者傳「待辦 買菜」或「待辦：買菜」
  │
  ▼
lineHandler：符合 CMD_TODO_RE → 解析任務名稱與備註
  │
  ▼
notionService.addTodoToNotion：新增一列到代辦DB
  │
  ▼
LINE Bot 回覆確認訊息
```

---

## 4. 部署架構

### 平台：Render Free Web Service

```
GitHub (master branch)
       │ 自動部署（push 觸發）
       ▼
Render Build
  npm install
       │
       ▼
Render Start
  npm start → node src/index.js
       │
       ▼
Public URL：https://line-notion-bot-ou63.onrender.com
```

**Render Free 方案特性：**
- 閒置 15 分鐘後進入睡眠，首個請求需 30~60 秒冷啟動
- 不限月流量，HTTPS 自動啟用

### 環境變數

| 變數名稱 | 用途 |
|---------|------|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Bot 發送訊息用 |
| `LINE_CHANNEL_SECRET` | Webhook 簽章驗證用 |
| `NOTION_API_KEY` | Notion Integration Secret |
| `NOTION_DATABASE_ID` | 採購清單資料庫 ID |
| `NOTION_TODO_DATABASE_ID` | 代辦事項資料庫 ID |
| `PORT` | 由 Render 自動注入，不需手動設定 |

---

## 5. 專案結構

```
line-notion-bot/
├── src/
│   ├── index.js           # Express 伺服器、Webhook 入口、錯誤處理
│   ├── lineHandler.js     # 事件路由、指令識別、去重、名稱取得
│   ├── messageParser.js   # 自由格式訊息解析（品項 + 條件）
│   └── notionService.js   # Notion API（採購 DB + 代辦 DB）
├── .env.example           # 環境變數範本
├── .gitignore
├── package.json
├── REQUIREMENTS.md        # 需求文件
├── ARCHITECTURE.md        # 本文件
└── README.md              # 快速開始與使用說明
```

---

## 6. 依賴套件

| 套件 | 版本 | 用途 |
|------|------|------|
| `@line/bot-sdk` | ^9.3.0 | LINE Messaging API + Webhook Middleware |
| `@notionhq/client` | ^2.2.15 | Notion API |
| `express` | ^4.18.2 | HTTP 伺服器 |
| `dotenv` | ^16.4.5 | 本機開發載入 .env |
| `nodemon` | ^3.1.0 | 開發用熱重啟（devDependency） |

---

## 7. 安全設計

- **Webhook 驗簽**：所有進入 `/webhook` 的請求均由 `line.middleware()` 驗證 `X-Line-Signature`，偽造請求直接被拒
- **金鑰管理**：所有 API 金鑰存於環境變數，`.env` 已列入 `.gitignore`，不進版控
- **去重防護**：記憶體 Set 記錄已處理的 `message.id`，防止 LINE 重送 Webhook 造成重複寫入
