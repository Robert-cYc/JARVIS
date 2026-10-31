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
  - **早安綜合簡報 (`morning_briefing`)**：一鍵或語音說出「早安 JARVIS」，平行彙整即時天氣、台美股/比特幣/匯率行情、台灣與科技頭條新聞以及您的未完成待辦事項。
  - **即時天氣與氣象雷達 (`weather_telemetry`)**：串接 Open-Meteo 衛星氣象（免金鑰），查詢台北與全球城市氣溫、體感溫度、降雨機率與風速。
  - **股市、宏觀指數、加密貨幣與外匯遙測 (`market_telemetry`)**：即時檢索台股加權指數 (`^TWII`)、台積電 (`2330.TW`)、輝達 (`NVDA`)、蘋果 (`AAPL`)、費城半導體 (`^SOX`)、CBOE 恐慌指數 (`^VIX`)、美債 10 年期殖利率 (`^TNX`)、比特幣 (`BTC-USD`)、美金兌台幣 (`TWD=X`) 與日圓換匯 (`JPYTWD=X`)。
  - **台灣中油即時油價與國際原油行情 (`taiwan_fuel_prices`)**：自動串接中油官方 Open Data，即時回報 92/95/98 無鉛汽油與超級柴油公升牌價，並結合 WTI 與布蘭特原油走勢分析。
  - **Hugging Face 開源 AI 模型榜與 Reddit LocalLLaMA 熱議 (`huggingface_trending`, `reddit_localllama`)**：掌握全球最新開源權重模型、每日精選 AI 論文與本地端模型社群技術突破。
  - **今日新聞頭條 (`todays_news`)**：支援台灣今日焦點、全球 AI 與科技新聞、國際重大頭條以及自訂主題即時新聞檢索。
  - **即時網頁搜尋 (`web_search`)** & **網頁深度閱讀 (`url_reader`)**：整合 DuckDuckGo、Google News RSS 與 Wikipedia 開放搜尋，並支援貼上網址自動擷取摘要。
- **史塔克長久記憶庫、待辦清單與戰術計時器 (`Memory Vault & Tactical Timer`)**
  - **跨對話永久記憶 (`data/jarvis_vault.json`)**：可直接在對話中說「JARVIS，請記住...」或「新增待辦事項：...」，也可透過左側 `04 // MEMORY VAULT & TIMER` 面板管理，系統會自動將記憶與待辦注入每次對話背景。
  - **語音倒數計時器**：支援 `1M`、`5M`、`25M`（番茄鐘）倒數，時間到時自動播放反應爐諧波並由 J.A.R.V.I.S. 主動語音提醒。
- **即時串流生成與分段同步語音 (`Real-Time SSE Streaming & Live Sentence TTS`)**
  - 透過 `/api/chat/stream` NDJSON 串流技術，J.A.R.V.I.S. 會在數百毫秒內開始逐字打出回覆，且**每完成一個句子就立即送入語音佇列發聲朗讀**，大幅消除等待時間。
- **免按鍵語音喚醒模式 (`Hands-Free "Hey JARVIS / 賈維斯" Wake-Word Mode`)**
  - 開啟右上角 **`🎙️ WAKE WORD: ON`** 後，系統將進入連續監聽模式；隨時說出「**JARVIS，...**」或「**賈維斯，...**」即可免按鍵喚醒並執行指令。
- **4 種經典裝甲塗裝切換、程式碼一鍵複製與報告匯出 (`Armor Suit Themes & Rich Code Blocks`)**
  - 頂部導覽列支援即時切換 **`MARK LXXXV`**（電光青/金）、**`HULKBUSTER XLIV`**（浩克毀滅者緋紅/金）、**`STEALTH MK XV`**（潛行夜視翠綠）與 **`WAR MACHINE`**（戰爭機器鈦銀/藍）四種主題。
  - 自動美化程式碼區塊並提供 **`[COPY CODE]`** 一鍵複製按鈕，以及 **`📥 EXPORT .MD`** 將完整對話匯出為 Markdown 戰術報告。
- **工作坊語音快速啟動與深層硬體診斷 (`Workshop Launcher & Deep Hardware Telemetry`)**
  - 支援直接語音或文字下令：「在 YouTube 搜尋...」、「在 Google 地圖搜尋...」、「打開 GitHub / Gmail / YouTube」，自動開啟目標視窗。
  - 自動將主機即時 CPU 核心負載、RAM 使用量、區域網路 IPv4 位址與開機時間注入 J.A.R.V.I.S. 知識背景，隨時提供精確硬體診斷。
- **多模態視覺感知與本地檔案分析 (`Optic Vision Scanner & File Analyzer`)**
  - **螢幕截圖掃描 (`🖥️ SCREEN`)** 與 **鏡頭快照 (`📷 CAM`)**：一鍵擷取當前螢幕視窗或 Webcam 畫面，交由多模態模型（如 Ollama `llava` / `llama3.2-vision`、Gemini、GPT-4o、Claude）進行視覺診斷。
  - **拖曳檔案與程式碼分析 (`📂 FILE`)**：支援點擊上傳或直接將 `.js`、`.py`、`.ts`、`.json`、`.log`、`.md`、`.csv` 與圖片拖曳至中央通訊視窗進行分析。
- **即時裝甲與主機遙測、GPU 監控與趨勢分析儀 (Real-Time Telemetry & Hardware Sentinel)**
  - 動態 HTML5 Canvas **方舟反應爐（Arc Reactor）**，隨 J.A.R.V.I.S. 說話頻率與系統狀態（待命、思考中、發聲中、聆聽中）即時改變色溫與聲波振幅。
  - 即時監控主機 CPU 核心負載、記憶體配置、NVIDIA GPU 負載/溫度/VRAM、**磁碟儲存空間分配 (Disk Storage)** 與系統運行狀態。
  - **點擊開啟 5M ~ 24H 歷史負載趨勢圖 (Neural Load Trend Analyzer)**：點擊 HUD 中 CPU 負載、記憶體配置 (RAM)、GPU 負載或 GPU VRAM 列即可呼叫全息趨勢分析視窗，支援 5 分鐘至 24 小時（`5M`、`10M`、`30M`、`1H`、`8H`、`12H`、`24H`）七種時間視窗、雙層採樣（高頻 5 秒 + 長期 60 秒晝夜緩衝）、四項指標即時統計（當前/尖峰/均值/最低）、專屬主題發光軌跡與游標十字準心即時數值探測。
  - **自主硬體與磁碟守護排程 (`hardwareSentinel`)**：背景週期巡檢，當 CPU 負載超載（>90%）、RAM 容量耗盡（>90%）或磁碟剩餘空間過低（<10 GB）時，自動觸發冷卻保護語音警告與 HUD 警報。
- **零外部套件依賴 (Zero-Dependency Native Node.js ESM)**
  - 後端與測試完全基於 Node.js 原生模組（`node:http`、`node:fs`、`node:os`、`node:test`）建構，不產生龐大的 `node_modules`，啟動迅速且相容雲端同步資料夾。

---

## 專案結構

```text
JARVIS/
├── autorun.bat                      # Windows 雙擊一鍵自動啟動腳本
├── run.js                           # 一鍵整合啟動器 (.env 初始化 / Ollama 自動啟動 / 伺服器與瀏覽器啟動)
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
PORT=63219
OLLAMA_BASE_URL=http://127.0.0.1:11434

# 選用：也可直接於前端 HUD 介面動態輸入
GEMINI_API_KEY=
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
ANTHROPIC_API_KEY=
```

### 2. 啟動 J.A.R.V.I.S. 系統（一鍵全自動啟動）

直接使用單一入口檔 `run.js`（或 `npm start`）即可自動完成 `.env` 初始化、背景喚醒 Ollama、記憶庫載入、連接埠自動避讓並開啟瀏覽器：

```bash
# Windows 雙擊或命令列執行
.\autorun.bat

# 一鍵啟動所有服務並自動開啟瀏覽器
node run.js
# 或
npm start

# 進階啟動參數（選用）
node run.js --test                  # 啟動前先執行單元測試診斷
node run.js --port 8080 --no-open   # 指定連接埠且不自動彈出瀏覽器
node run.js --skip-ollama           # 略過本地 Ollama 自動喚醒

# 開發模式（自動監聽檔案變更重啟）
npm run dev
```

啟動後，請在瀏覽器開啟：
**[http://localhost:63219](http://localhost:63219)**

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
| `POST` | `/api/chat/stream` | NDJSON 即時打字機串流回覆與邊串流邊語音合成 |
| `GET` | `/api/skills/news` | 取得今日即時新聞頭條（支援 `?edition=tw\|tech\|us&q=關鍵字`） |
| `GET` | `/api/skills/search` | 執行即時網路搜尋（`?q=搜尋關鍵字`） |
| `GET` | `/api/skills/browse` | 讀取並擷取指定網址之純文字內容（`?url=https://...`） |
| `GET` | `/api/skills/weather` | 取得指定城市即時氣象與降雨機率（`?city=Taipei`） |
| `GET` | `/api/skills/market` | 取得台積電、NVDA、BTC 與匯率即時報價 |
| `GET` | `/api/skills/briefing` | 產生史塔克早安綜合簡報（天氣 + 股市 + 新聞 + 待辦事項） |
| `GET` | `/api/skills/cyber-scan` | 執行本機 TCP Port 掃描與外部 DNS 延遲資安檢測 |
| `POST` | `/api/skills/sandbox` | 史塔克量子沙盒：安全執行數學運算、SHA-256、Base64 與 UUID |
| `GET` | `/api/skills/rnd` | 研發情報檢索（支援 `?type=arxiv\|github\|hn&q=關鍵字`） |
| `GET/POST/DELETE` | `/api/vault*` | 長期記憶庫與待辦事項管理 |
| `GET/POST` | `/api/automation*` | 史塔克自動化核心：定時晨報、18:30 下班戰術總結、服務自我修復、網站 Uptime 哨兵與週五油價預警 |

---

### 🤖 史塔克自動化哨兵核心 (Stark Autonomous Automation)

J.A.R.V.I.S. 內建 30 秒輪巡的高精度無鎖排程器，無需額外外部套件即可自主執行各項常駐哨兵守護：

1. **Option 1: 服務自我修復與網站 Uptime 哨兵**
   - **Ollama Crash Auto-Restart**: 當監控到本機 Ollama (Port 11434) 失去響應時，自動觸發自我修復協定 (`ollama serve`) 並語音通知。
   - **Uptime Sentinel**: 持續輪詢自訂之對外服務或內部 API 端點，發生連線異常或復原時即刻發布全息警報。
2. **Option 2: 週五油價週末戰備與 18:30 每日戰術總結**
   - **Friday Fuel Alert**: 每週五下午 17:00 自主調閱台灣中油最新油價牌價與原油走勢，提醒週末加油戰備排程。
   - **18:30 Daily Tactical Debrief**: 每日傍晚 18:30 自動彙整今日已完成/進行中任務與自選股盤後表現，自動產出 Markdown 日誌儲存至 `reports/`。
3. **Option 3: 整點語音報時與 50 分鐘專注健康提醒**
   - **Hourly Chrono Chime**: 每逢整點 (`:00`) 自動播放史塔克諧波報時音效，並以語音播報當前標準時間與作息叮嚀。
   - **Focus & Health Sentinel**: 連續工作達 50 分鐘時自動觸發護眼與姿態健康警報，提醒起立活動頸椎並遠眺放鬆睫狀肌。
