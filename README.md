# LINE Notion 採購清單 Bot

在 LINE 隨時輸入家電或家具，自動記錄到 Notion 採購清單；也支援代辦事項。

---

## 功能設計

### 採購清單

- 直接輸入品項名稱（含已知家電／家具關鍵字）即自動記錄
- **同一品項只建一列**：若清單中已有相同品項（狀態為待購買），再次輸入時會把新條件**累加**到現有記錄，不會建新列
- 條件以「；」分隔，任何人新增的條件都會保留

```
第一次：冰箱 預算15000內        → 建立新列，條件：預算15000內
第二次：冰箱 要滾筒式           → 更新同列，條件：預算15000內；要滾筒式
```

### 訊息解析規則

1. 訊息含已知家電／家具關鍵字 → 以關鍵字為品項，其餘為條件
2. 無已知關鍵字 → 第一個空白前的字詞為品項，其餘為條件
3. 指令前綴（清單、說明、已買、已放棄、待辦、todo、完成、取消、刪除）不觸發記錄

### 指令一覽

| 輸入 | 效果 |
|------|------|
| `冰箱 預算15000內` | 記錄採購品項 |
| `清單` | 顯示最近 10 筆採購記錄 |
| `已買 冰箱` | 標記冰箱為已購買 |
| `已放棄 沙發` | 標記沙發為已放棄 |
| `刪除 冰箱` | 從清單移除（Notion 封存） |
| `待辦 買菜` | 記錄代辦事項 |
| `todo 繳費 本月底前` | 記錄代辦（任務=繳費，備註=本月底前） |
| `待辦清單` | 顯示最近 10 筆代辦事項 |
| `完成 買菜` | 標記代辦為已完成 |
| `取消 買菜` | 標記代辦為已取消 |
| `刪除 買菜` | 從代辦移除（Notion 封存） |
| `說明` | 顯示使用說明 |

> `清單` / `列表` / `list` 三者等效；`說明` / `help` / `幫助` 三者等效。

---

## 系統架構

```
使用者 LINE App
      |
      | (Webhook HTTP POST)
      v
Express.js 伺服器（Node.js 18+）
      |
      |-- lineHandler.js   事件路由、指令識別、取得發訊者名稱
      |-- messageParser.js 解析品項與條件（關鍵字優先，fallback 首字詞）
      |-- notionService.js 操作 Notion API（採購 DB / 代辦 DB）
      |
      +--> Notion 採購清單資料庫
      +--> Notion 代辦事項資料庫
```

### Notion 資料庫欄位

**採購清單**

| 欄位 | 類型 | 說明 |
|------|------|------|
| 品項 | Title | 家電/家具名稱 |
| 條件說明 | Text | 累加的預算、尺寸等條件（以；分隔） |
| 原始訊息 | Text | 第一次輸入的完整原文 |
| 加入者 | Text | 建立者的 LINE 顯示名稱 |
| 狀態 | Select | 待購買 / 已購買 / 已放棄 |
| 新增日期 | Date | 建立時間（UTC+8） |

**代辦事項**

| 欄位 | 類型 | 說明 |
|------|------|------|
| 任務 | Title | 任務名稱 |
| 備註 | Text | 補充說明 |
| 原始訊息 | Text | 完整原文 |
| 加入者 | Text | LINE 顯示名稱 |
| 狀態 | Select | 待辦 / 已完成 / 已取消 |
| 新增日期 | Date | 建立時間（UTC+8） |

---

## 快速開始

### 前置需求

- Node.js 18+
- LINE Developers 帳號
- Notion 帳號
- Railway 帳號（部署用）

---

### Step 1 — 建立 LINE Bot

1. 前往 [LINE Developers Console](https://developers.line.biz/)
2. 建立 **Messaging API Channel**
3. 複製 **Channel secret** 與 **Channel access token**
4. 關閉「Auto-reply messages」與「Greeting messages」
5. 開啟「Allow bot to join group chats」（群組功能）

---

### Step 2 — 建立 Notion Integration 與兩個資料庫

#### 2-1 建立 Integration

1. 前往 [Notion Integrations](https://www.notion.so/my-integrations)，建立新 Integration
2. 複製 **Internal Integration Secret**（即 `NOTION_API_KEY`）

#### 2-2 建立「採購清單」資料庫

1. 在 Notion 新增 **Database（Full page）**，命名「採購清單」
2. 建立以下欄位：

   | 欄位 | 類型 | 狀態選項 |
   |------|------|---------|
   | 品項 | Title | — |
   | 條件說明 | Text | — |
   | 原始訊息 | Text | — |
   | 加入者 | Text | — |
   | 狀態 | Select | 待購買、已購買、已放棄 |
   | 新增日期 | Date | — |

3. 右上角「⋯」→「Connections」→ 加入剛建立的 Integration
4. 複製資料庫 URL 中的 ID（即 `NOTION_DATABASE_ID`）

#### 2-3 建立「代辦事項」資料庫

1. 新增另一個 **Database（Full page）**，命名「代辦事項」
2. 建立以下欄位：

   | 欄位 | 類型 | 狀態選項 |
   |------|------|---------|
   | 任務 | Title | — |
   | 備註 | Text | — |
   | 原始訊息 | Text | — |
   | 加入者 | Text | — |
   | 狀態 | Select | 待辦、已完成、已取消 |
   | 新增日期 | Date | — |

3. 同樣加入 Integration
4. 複製資料庫 ID（即 `NOTION_TODO_DATABASE_ID`）

---

### Step 3 — 本機測試

```bash
# 安裝依賴
npm install

# 複製並填寫環境變數
cp .env.example .env

# 啟動開發伺服器
npm run dev
```

使用 [ngrok](https://ngrok.com/) 建立公開 URL：

```bash
ngrok http 3000
```

將 ngrok 給的 HTTPS URL 填入 LINE Console 的 Webhook URL：
```
https://xxxx.ngrok-free.app/webhook
```

---

### Step 4 — 部署到 Railway

1. 前往 [Railway](https://railway.app/) → New Project → Deploy from GitHub repo
2. 進入 Variables，新增五個環境變數：
   ```
   LINE_CHANNEL_ACCESS_TOKEN
   LINE_CHANNEL_SECRET
   NOTION_API_KEY
   NOTION_DATABASE_ID
   NOTION_TODO_DATABASE_ID
   ```
3. 部署完成後取得公開 URL，填入 LINE Webhook：
   ```
   https://your-app.railway.app/webhook
   ```
4. 點「Verify」確認連線成功

---

## 專案結構

```
line-notion-bot/
├── src/
│   ├── index.js          # Express 伺服器、Webhook 入口
│   ├── lineHandler.js    # 事件路由、指令識別
│   ├── messageParser.js  # 自由格式訊息解析
│   └── notionService.js  # Notion API（採購 + 代辦）
├── .env.example
├── .gitignore
├── package.json
├── REQUIREMENTS.md
└── README.md
```
