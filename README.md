# LINE Notion 採購清單 Bot

在 LINE 隨時輸入家電或家具，自動記錄到 Notion 採購清單。

---

## 快速開始

### 前置需求

- Node.js 18+
- LINE Developers 帳號
- Notion 帳號
- Railway 帳號（用於部署）

---

## Step 1 — 建立 LINE Bot

1. 前往 [LINE Developers Console](https://developers.line.biz/)
2. 建立 Provider（若尚無）
3. 建立 **Messaging API Channel**
4. 進入 Channel 設定頁：
   - 複製 **Channel secret**（即 `LINE_CHANNEL_SECRET`）
   - 到「Messaging API」分頁 → Issue **Channel access token**（即 `LINE_CHANNEL_ACCESS_TOKEN`）
5. 在「Messaging API」分頁：
   - 關閉「Auto-reply messages」
   - 關閉「Greeting messages」
   - 開啟「Allow bot to join group chats」（若需群組功能）

---

## Step 2 — 建立 Notion 資料庫

1. 在 Notion 新增一個 **資料庫（Database — Full page）**，命名為「採購清單」
2. 設定以下欄位：

   | 欄位名稱 | 類型 |
   |---------|------|
   | 品項 | Title |
   | 條件說明 | Text |
   | 原始訊息 | Text |
   | 加入者 | Text |
   | 狀態 | Select（選項：待購買、已購買、已放棄） |
   | 新增日期 | Date |

3. 前往 [Notion Integrations](https://www.notion.so/my-integrations)，建立新 Integration
   - 複製 **Internal Integration Secret**（即 `NOTION_API_KEY`）
4. 回到資料庫頁面 → 右上角「...」→「Connections」→ 加入剛建立的 Integration
5. 複製資料庫 URL 中的 ID（格式：`https://notion.so/你的名稱/{DATABASE_ID}?v=...`）
   - 即 `NOTION_DATABASE_ID`

---

## Step 3 — 本機測試

```bash
# 安裝依賴
npm install

# 複製環境變數範本
cp .env.example .env
# 填入 .env 的四個值

# 啟動開發伺服器
npm run dev
```

使用 [ngrok](https://ngrok.com/) 建立臨時公開 URL：

```bash
ngrok http 3000
```

將 ngrok 給的 HTTPS URL 填入 LINE Console 的 Webhook URL：
```
https://xxxx.ngrok-free.app/webhook
```

---

## Step 4 — 部署到 Railway

1. 前往 [Railway](https://railway.app/)，登入後點「New Project」→「Deploy from GitHub repo」
2. 連結此專案的 GitHub Repo
3. 進入專案設定 → **Variables**，新增以下四個環境變數：
   ```
   LINE_CHANNEL_ACCESS_TOKEN
   LINE_CHANNEL_SECRET
   NOTION_API_KEY
   NOTION_DATABASE_ID
   ```
4. 部署完成後，Railway 會提供一個公開 HTTPS URL
5. 將該 URL + `/webhook` 填入 LINE Console 的 Webhook URL：
   ```
   https://your-app.railway.app/webhook
   ```
6. 點「Verify」確認連線成功

---

## 使用方式

將 Bot 加為好友或加入群組後：

| 輸入 | 效果 |
|------|------|
| `冰箱 預算15000內` | 記錄到 Notion |
| `沙發 三人座 布面` | 記錄到 Notion |
| `清單` | 顯示最近10筆記錄 |
| `已買 冰箱` | 標記冰箱為已購買 |
| `已放棄 沙發` | 標記沙發為已放棄 |
| `說明` | 顯示使用說明 |

---

## 專案結構

```
line-notion-bot/
├── src/
│   ├── index.js          # Express 伺服器、Webhook 入口
│   ├── lineHandler.js    # LINE 事件處理、指令路由
│   ├── messageParser.js  # 自由格式訊息解析
│   └── notionService.js  # Notion API 操作
├── .env.example          # 環境變數範本
├── .gitignore
├── package.json
├── REQUIREMENTS.md       # 需求文件
└── README.md             # 本文件
```
