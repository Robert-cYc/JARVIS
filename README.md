# J.A.R.V.I.S. // Mark LXXXV 全息操作介面 (Holographic HUD)

一套以鋼鐵人（Iron Man）**Mark LXXXV 裝甲全息主控台**為設計靈感的 **J.A.R.V.I.S. (Just A Rather Very Intelligent System)** 智慧語音操作系統。支援動態載入多種本地端與雲端大型語言模型（LLM），並透過瀏覽器原生語音合成與 Web Audio API 科幻聲學濾波器，以招牌的英國管家聲調與您即時對話。

---

## 核心特色

- **多核心神經網路切換 (Multi-LLM Loader)**
  - **Local Ollama（預設推薦）**：自動偵測本地端 Ollama 服務與已安裝模型，並內建 **一鍵下載與部署器（Ollama Core Deployer）**，可直接於 HUD 介面即時串流下載 `llama3.2`、`qwen2.5`、`gemma2` 等模型。
  - **雲端 LLM 支援**：內建支援 **Google Gemini**、**OpenAI (GPT-4o / o3)**、**Anthropic Claude** 以及任何 **OpenAI 相容端點**（如 DeepSeek、Groq、OpenRouter、LM Studio、vLLM）。
- **J.A.R.V.I.S. 專屬人格與聲調系統**
  - **三種人格模式**：
    1. `Standard British Butler`（經典英國紳士管家：優雅、沉著、禮貌）
    2. `Mark LXXXV Combat & Tactical`（戰術分析模式：精準、緊湊、任務導向）
    3. `Dry Stark-Level Sarcasm`（史塔克式英式幽默與微吐槽）
  - **Web Speech API + Web Audio DSP 科幻濾波**：
    - 自動優先匹配英式男聲（`en-GB`）或繁體中文語音（`zh-TW`），並預設調校低沉管家音調（`Pitch: 0.92`、`Rate: 1.04x`）。
    - 結合 Web Audio API 合成頭盔通訊共鳴濾波與 HUD 裝甲互動音效（無須任何外部音訊檔案）。
  - **語音輸入 (Speech-to-Text)**：支援麥克風即時語音辨識，可直接開口向 J.A.R.V.I.S. 下達指令。
- **史塔克全球衛星聯網與即時新聞技能 (Stark Satellite Web Uplink & Live News)**
  - **今日新聞頭條 (`todays_news`)**：支援台灣今日焦點、全球 AI 與科技新聞、國際重大頭條以及自訂主題即時新聞檢索。
  - **即時網頁搜尋 (`web_search`)**：整合 DuckDuckGo、Google News RSS 與 Wikipedia 開放搜尋，無須付費 API Key 即可上網檢索最新資訊。
  - **網頁深度閱讀 (`url_reader`)**：在對話框貼上任何 `http/https` 網址，J.A.R.V.I.S. 即可自動擷取內文並為您摘要朗讀。
  - **全息新聞來源卡片**：每則聯網回答下方皆會顯示可點擊的新聞標題與來源連結卡片。
- **即時裝甲與主機遙測 (Real-Time Telemetry)**
  - 動態 HTML5 Canvas **方舟反應爐（Arc Reactor）**，隨 J.A.R.V.I.S. 說話頻率與系統狀態（待命、思考中、發聲中、聆聽中）即時改變色溫與聲波振幅。
  - 即時監控主機 CPU 核心負載、記憶體配置與系統運行狀態。
- **零外部套件依賴 (Zero-Dependency Native Node.js ESM)**
  - 後端與測試完全基於 Node.js 原生模組（`node:http`、`node:fs`、`node:os`、`node:test`）建構，不產生龐大的 `node_modules`，啟動迅速且相容雲端同步資料夾。

---

## 專案結構

```text
JARVIS/
├── .env.example                     # 環境變數範本
├── package.json                     # 專案指令與設定 (Node.js ESM)
├── public/                          # 前端全息 HUD 介面
│   ├── index.html                   # Mark LXXXV 主控台介面結構
│   ├── css/
│   │   └── hud.css                  # 科幻全息視覺樣式與動畫
│   └── js/
│       ├── main.js                  # HUD 核心控制器與狀態管理
│       ├── audioEngine.js           # TTS 語音合成與 Web Audio 科幻音效引擎
│       ├── hudVisualizer.js         # HTML5 Canvas 方舟反應爐與頻譜視覺化
│       └── speechInput.js           # Web Speech API 麥克風語音辨識模組
├── src/
│   └── server/                      # 後端伺服器
│       ├── index.js                 # 伺服器啟動入口
│       ├── app.js                   # HTTP 路由與 API 處理器
│       └── services/
│           ├── llmService.js        # 多模型 LLM 串接、JARVIS 系統提示詞與語音清理
│           └── telemetryService.js  # 主機 CPU / RAM / 反應爐即時遙測服務
└── tests/                           # 單元測試 (Node.js 原生測試框架)
    ├── llmService.test.js
    └── telemetryService.test.js
```

---

## 環境需求

- **Node.js**：`v20.6.0` 以上（推薦 `v22+` 或 `v24+`）
- **Ollama**（選用，推薦用於本地端免費推理）：[https://ollama.com](https://ollama.com)
- **現代瀏覽器**：Chrome、Edge 或 Safari（支援 Web Speech API 與 Web Audio API）

---

## 快速開始

### 1. 設定環境變數（選用）

若您希望透過 `.env` 預先配置雲端 API Key 或自訂連接埠，可複製範本檔：

```bash
cp .env.example .env
```

`.env` 內容範例：

```env
PORT=3000
OLLAMA_BASE_URL=http://127.0.0.1:11434

# 選用：也可直接於前端 HUD 介面動態輸入
GEMINI_API_KEY=
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
ANTHROPIC_API_KEY=
```

### 2. 啟動 J.A.R.V.I.S. 系統

```bash
# 一般啟動
npm start

# 開發模式（自動監聽檔案變更重啟）
npm run dev
```

啟動後，請在瀏覽器開啟：
**[http://localhost:3000](http://localhost:3000)**

### 3. 執行單元測試

```bash
npm test
```

---

## HUD 操作指南

1. **啟動語音與音效 (`ENGAGE HUD AUDIO`)**
   - 點擊右上角 **`ENGAGE HUD AUDIO`** 按鈕，解鎖瀏覽器音訊權限並播放方舟反應爐開機諧波與 J.A.R.V.I.S. 語音問候。
2. **切換或安裝 LLM 模型 (`01 // NEURAL CORE MATRIX` & `02 // OLLAMA CORE DEPLOYER`)**
   - **本地 Ollama**：若本地尚未安裝模型，可在左側 `02 // OLLAMA CORE DEPLOYER` 選擇推薦模型（如 `qwen2.5:3b` 或 `llama3.2:1b`），點擊 **`PULL & LOAD LOCAL MODEL`** 即可在介面內即時下載並自動載入。
   - **雲端模型**：在 `LLM PROVIDER` 下拉選單切換至 Gemini、OpenAI、Anthropic 或 Custom URL，並填入 API Key 即可立即對話。
3. **調整 J.A.R.V.I.S. 聲調與人格 (`04 // J.A.R.V.I.S. PERSONA` & `05 // VOCAL SYNTHESIZER`)**
   - 可自由調整 **稱呼設定**（如 `Sir`、`先生`、`Boss`）、**回應語言**（自動偵測 / 繁體中文 / 英式英文）、**音調深沉度 (Pitch)** 與 **語速節奏 (Rate)**。
   - 每則 J.A.R.V.I.S. 的回覆下方皆附有 **`[REPLAY VOICE TRANSMISSION]`** 按鈕，可隨時重播語音。

---

## API 端點一覽

| 方法 | 路徑 | 說明 |
| :--- | :--- | :--- |
| `GET` | `/api/health` | 檢查 J.A.R.V.I.S. 主機核心連線狀態 |
| `GET` | `/api/telemetry` | 取得主機 CPU、記憶體、方舟反應爐輸出與 Ollama 狀態 |
| `GET` | `/api/models` | 取得已安裝的 Ollama 模型清單與雲端預設模型目錄 |
| `POST` | `/api/ollama/pull` | 串流下載指定之 Ollama 本地模型（回傳 NDJSON 進度） |
| `POST` | `/api/chat` | 傳送對話紀錄與人格參數，自動觸發聯網技能並取得 J.A.R.V.I.S. 回覆 |
| `GET` | `/api/skills/news` | 取得今日即時新聞頭條（支援 `?edition=tw\|tech\|us&q=關鍵字`） |
| `GET` | `/api/skills/search` | 執行即時網路搜尋（`?q=搜尋關鍵字`） |
| `GET` | `/api/skills/browse` | 讀取並擷取指定網址之純文字內容（`?url=https://...`） |
