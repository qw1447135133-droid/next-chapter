const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
  VerticalAlign, LevelFormat, PageNumber, Header, Footer
} = require('docx');
const fs = require('fs');

const today = '2026年3月30日';
const tomorrow = '2026年3月31日';

const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const borders = { top: border, bottom: border, left: border, right: border };

function cell(text, isHeader = false, width = 3120) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: isHeader ? { fill: '1a4a6b', type: ShadingType.CLEAR } : { fill: 'F8FAFB', type: ShadingType.CLEAR },
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [new TextRun({
        text,
        bold: isHeader,
        color: isHeader ? 'FFFFFF' : '333333',
        size: isHeader ? 22 : 20,
        font: 'Arial',
      })]
    })]
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 180 },
    children: [new TextRun({ text, bold: true, size: 32, color: '1a4a6b', font: 'Arial' })]
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size: 26, color: '2c6fa8', font: 'Arial' })]
  });
}

function h3(text) {
  return new Paragraph({
    spacing: { before: 180, after: 80 },
    children: [new TextRun({ text, bold: true, size: 22, color: '1a4a6b', font: 'Arial' })]
  });
}

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    children: [new TextRun({ text, size: 20, font: 'Arial', color: '333333', ...opts })]
  });
}

function bullet(text) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, size: 20, font: 'Arial', color: '333333' })]
  });
}

function numbered(text) {
  return new Paragraph({
    numbering: { reference: 'numbers', level: 0 },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, size: 20, font: 'Arial', color: '333333' })]
  });
}

function divider() {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E0E7EF', space: 1 } },
    children: []
  });
}

function space() {
  return new Paragraph({ spacing: { before: 60, after: 60 }, children: [] });
}

const doc = new Document({
  numbering: {
    config: [
      { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]
  },
  styles: {
    default: { document: { run: { font: 'Arial', size: 20 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 32, bold: true, font: 'Arial', color: '1a4a6b' },
        paragraph: { spacing: { before: 360, after: 180 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, font: 'Arial', color: '2c6fa8' },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 1 } },
          children: [new TextRun({ text: '小龍蝦 AI 團隊 \u2014 產品文件', size: 18, color: '999999', font: 'Arial' })]
        })]
      })
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: today + '  |  第 ', size: 18, color: '999999', font: 'Arial' }),
            new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '999999', font: 'Arial' }),
            new TextRun({ text: ' 頁', size: 18, color: '999999', font: 'Arial' }),
          ]
        })]
      })
    },
    children: [

      // ─── 封面 ───
      new Paragraph({ spacing: { before: 800, after: 0 }, children: [] }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 200 },
        children: [new TextRun({ text: '\uD83E\uDD9E', size: 96, font: 'Segoe UI Emoji' })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 120 },
        children: [new TextRun({ text: '小龍蝦 AI 團隊', bold: true, size: 60, color: '1a4a6b', font: 'Arial' })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 80 },
        children: [new TextRun({ text: '跨境電商多 Agent 數位員工系統', size: 28, color: '2c6fa8', font: 'Arial' })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 40 },
        children: [new TextRun({ text: 'v0.1.0  |  ' + today, size: 22, color: '888888', font: 'Arial' })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 800 },
        children: [new TextRun({ text: '產品文件 & 開發計劃', size: 22, color: '888888', font: 'Arial', italics: true })]
      }),

      divider(),

      // ─── 一、專案概述 ───
      h1('一、專案概述'),
      p('小龍蝦 AI 團隊是一款面向跨境電商從業者的桌面級 AI 多 Agent 協作工具，基於 Electron + Next.js 開發，現已打包為 Windows 可執行檔（.exe）。系統內建 6 隻功能各異的「龍蝦 Agent」，可接收使用者指令後自動拆解任務、並發執行，涵蓋選品分析、文案創作、視覺設計、短影片策劃、客服回覆等核心場景。'),
      space(),

      h2('1.1 技術棧'),
      new Table({
        width: { size: 9026, type: WidthType.DXA },
        columnWidths: [2400, 6626],
        rows: [
          new TableRow({ children: [cell('層次', true, 2400), cell('技術選型', true, 6626)] }),
          new TableRow({ children: [cell('前端框架', false, 2400), cell('Next.js 14.2.5（靜態匯出 SSG）', false, 6626)] }),
          new TableRow({ children: [cell('桌面容器', false, 2400), cell('Electron 30.0.0', false, 6626)] }),
          new TableRow({ children: [cell('打包工具', false, 2400), cell('electron-builder 26.8.1（NSIS 安裝包）', false, 6626)] }),
          new TableRow({ children: [cell('狀態管理', false, 2400), cell('Zustand', false, 6626)] }),
          new TableRow({ children: [cell('通訊協定', false, 2400), cell('WebSocket（本機 ws://localhost:3001）', false, 6626)] }),
          new TableRow({ children: [cell('AI 呼叫', false, 2400), cell('OpenAI SDK（相容多家供應商 API）', false, 6626)] }),
          new TableRow({ children: [cell('圖像生成', false, 2400), cell('幻影龍蝦內建圖片生成（[IMAGE_PROMPT] 協定）', false, 6626)] }),
        ]
      }),
      space(),

      h2('1.2 系統架構'),
      p('應用程式執行時由三個程序協同運作：'),
      bullet('Electron 主程序（main.cjs）\u2014 管理視窗生命週期、單例鎖、系統托盤'),
      bullet('Next.js 渲染程序（WebContents）\u2014 載入 out/index.html 靜態頁面，負責 UI 渲染'),
      bullet('WebSocket 服務（ws-server.js，埠號 3001）\u2014 Agent 引擎與前端的即時通訊頻道'),
      space(),

      divider(),

      // ─── 二、Agent 功能說明 ───
      h1('二、六隻龍蝦 Agent 功能說明'),
      new Table({
        width: { size: 9026, type: WidthType.DXA },
        columnWidths: [700, 1600, 1800, 4926],
        rows: [
          new TableRow({ children: [cell('圖示', true, 700), cell('名稱', true, 1600), cell('角色', true, 1800), cell('核心能力', true, 4926)] }),
          new TableRow({ children: [cell('\uD83E\uDD9E', false, 700), cell('蝦總管', false, 1600), cell('總調度員', false, 1800), cell('接收使用者指令 \u2192 任務拆解 \u2192 分配給各 Agent \u2192 彙整報告', false, 4926)] }),
          new TableRow({ children: [cell('\uD83D\uDD0D', false, 700), cell('探海龍蝦', false, 1600), cell('市場分析師', false, 1800), cell('競品分析、選品趨勢、市場資料研究、關鍵字挖掘', false, 4926)] }),
          new TableRow({ children: [cell('\u270D\uFE0F', false, 700), cell('執筆龍蝦', false, 1600), cell('文案專家', false, 1800), cell('多語系文案創作、SEO 標題最佳化、商品詳情頁撰寫', false, 4926)] }),
          new TableRow({ children: [cell('\uD83C\uDFA8', false, 700), cell('幻影龍蝦', false, 1600), cell('視覺設計師', false, 1800), cell('海報／Banner 生成提示詞、圖片創作方案設計', false, 4926)] }),
          new TableRow({ children: [cell('\uD83C\uDFAC', false, 700), cell('戲精龍蝦', false, 1600), cell('短影片策劃', false, 1800), cell('TikTok／抖音影片腳本、數位人內容、多平台矩陣計劃', false, 4926)] }),
          new TableRow({ children: [cell('\uD83D\uDCAC', false, 700), cell('迎客龍蝦', false, 1600), cell('客服專員', false, 1800), cell('多語系客服話術、評論回覆範本、買家互動策略', false, 4926)] }),
        ]
      }),
      space(),

      h2('2.1 任務路由規則'),
      p('蝦總管根據關鍵字自動將任務分配給對應 Agent：'),
      bullet('競品 / 選品 / 趨勢 / 資料 / 市場 / 分析 \u2192 探海龍蝦'),
      bullet('文案 / 標題 / SEO / 描述 / 翻譯 \u2192 執筆龍蝦'),
      bullet('圖片 / 海報 / 設計 / 生圖 / 畫 \u2192 幻影龍蝦'),
      bullet('影片 / TikTok / 抖音 / 腳本 \u2192 戲精龍蝦'),
      bullet('客服 / 評論 / 回覆 / 售後 \u2192 迎客龍蝦'),
      bullet('複雜任務自動拆分為多個子任務並發執行'),
      space(),

      divider(),

      // ─── 三、支援的 AI 模型供應商 ───
      h1('三、支援的 AI 模型供應商'),
      new Table({
        width: { size: 9026, type: WidthType.DXA },
        columnWidths: [2200, 6826],
        rows: [
          new TableRow({ children: [cell('供應商', true, 2200), cell('支援模型（示例）', true, 6826)] }),
          new TableRow({ children: [cell('OpenAI', false, 2200), cell('gpt-4o, gpt-4o-mini, o1, o1-mini, o3-mini', false, 6826)] }),
          new TableRow({ children: [cell('SiliconFlow', false, 2200), cell('DeepSeek-R1, DeepSeek-V3, Qwen2.5-72B, QwQ-32B', false, 6826)] }),
          new TableRow({ children: [cell('DeepSeek', false, 2200), cell('deepseek-chat, deepseek-reasoner', false, 6826)] }),
          new TableRow({ children: [cell('阿里雲百煉', false, 2200), cell('qwen-max, qwen-plus, qwen-turbo, qwen-long 等', false, 6826)] }),
          new TableRow({ children: [cell('4sAPI', false, 2200), cell('相容 OpenAI 格式的第三方中轉', false, 6826)] }),
          new TableRow({ children: [cell('自訂', false, 2200), cell('任意相容 OpenAI API 格式的供應商', false, 6826)] }),
        ]
      }),
      p('每隻 Agent 可單獨設定使用不同的供應商和模型，靈活適配不同預算與需求。', { italics: true, color: '666666' }),
      space(),

      divider(),

      // ─── 四、主要功能模組 ───
      h1('四、主要功能模組'),

      h2('4.1 看板（Dashboard）'),
      bullet('即時顯示各 Agent 執行狀態（執行中 / 閒置 / 錯誤）'),
      bullet('統計執行中 Agent 數量、完成任務數、總 Token 用量、預估費用'),
      bullet('顯示最近任務對話記錄'),
      space(),

      h2('4.2 任務面板'),
      bullet('8 個預設快捷任務：競品分析、產品文案、海報設計、影片腳本、客服話術、SEO 關鍵字、電郵行銷、社群內容'),
      bullet('定時任務：支援新增定時自動執行的任務'),
      bullet('對話歷史：多會話管理，支援新建、切換、刪除會話'),
      space(),

      h2('4.3 會議模式'),
      bullet('多隻龍蝦協作討論同一課題'),
      bullet('各 Agent 互相審閱意見後輸出最終方案'),
      space(),

      h2('4.4 設定面板'),
      bullet('Agent 設定：為每隻龍蝦單獨設定名字、Emoji、性格 Prompt、模型'),
      bullet('模型供應商：管理多組 API Key 和 Base URL'),
      bullet('API 連線測試：一鍵測試設定是否正確'),
      space(),

      h2('4.5 活動記錄'),
      bullet('右側面板即時顯示所有 Agent 的操作日誌'),
      bullet('記錄任務開始、完成、失敗及耗時'),
      space(),

      divider(),

      // ─── 五、打包與部署 ───
      h1('五、打包與部署'),

      h2('5.1 目前打包狀態'),
      new Table({
        width: { size: 9026, type: WidthType.DXA },
        columnWidths: [2400, 6626],
        rows: [
          new TableRow({ children: [cell('項目', true, 2400), cell('說明', true, 6626)] }),
          new TableRow({ children: [cell('目標平台', false, 2400), cell('Windows（NSIS 安裝包）', false, 6626)] }),
          new TableRow({ children: [cell('輸出檔案', false, 2400), cell('dist-electron/小龍蝦AI團隊 Setup 0.1.0.exe', false, 6626)] }),
          new TableRow({ children: [cell('單例鎖', false, 2400), cell('已實作，防止多視窗重複開啟', false, 6626)] }),
          new TableRow({ children: [cell('資源載入', false, 2400), cell('HTML/JS/CSS 從 app.asar.unpacked 載入（已修復 file:// 路徑問題）', false, 6626)] }),
          new TableRow({ children: [cell('UI 載入狀態', false, 2400), cell('\u26A0\uFE0F 待修復：資源路徑為絕對路徑（/_next/static/...），file:// 下 CSS/JS 無法載入', false, 6626)] }),
        ]
      }),
      space(),

      h2('5.2 已知問題'),
      bullet('UI 白畫面問題：index.html 中引用的 CSS/JS 為 /_next/static/... 絕對路徑，在 file:// 協定下瀏覽器無法解析，需要在 next.config.js 中設定 assetPrefix: "." 並重新打包'),
      bullet('Mac 版本尚未打包：需在 Mac 機器上執行 npm run electron:build:mac'),
      space(),

      divider(),

      // ─── 六、開發計劃 ───
      h1('六、開發計劃'),

      h2('6.1 今日任務（' + today + '）'),
      bullet('修復 UI 載入問題：next.config.js 設定 assetPrefix: "." 生成相對路徑並重新打包'),
      bullet('驗證 Windows exe 正常執行'),
      bullet('Mac 版本打包測試'),
      space(),

      h2('6.2 明日計劃（' + tomorrow + '）\u2014 Telegram & Line 平台接入'),
      p('目標：讓使用者可以透過 Telegram 或 Line 直接向龍蝦 Agent 發送指令，Agent 執行後將結果回覆至對話中。', { bold: true }),
      space(),

      h3('Telegram Bot 接入'),
      numbered('在 @BotFather 建立 Bot，取得 Bot Token'),
      numbered('安裝相依套件：npm install node-telegram-bot-api'),
      numbered('在 server/ws-server.js 中新增 Telegram 監聽模組'),
      numbered('收到使用者訊息 \u2192 呼叫 Agent 引擎 \u2192 透過 bot.sendMessage 回覆結果'),
      numbered('支援 /start、/help、/task <指令> 等命令'),
      numbered('在設定面板新增 Telegram Bot Token 設定欄位'),
      space(),

      h3('Line Messaging API 接入'),
      numbered('申請 Line Official Account，開啟 Messaging API，取得 Channel Access Token + Channel Secret'),
      numbered('安裝相依套件：npm install @line/bot-sdk'),
      numbered('實作 Webhook 介面（需公開網路位址，可用 ngrok 測試）'),
      numbered('收到 LINE 訊息事件 \u2192 呼叫 Agent 引擎 \u2192 replyMessage 回覆'),
      numbered('在設定面板新增 Line Token / Secret 設定欄位'),
      space(),

      h3('公開網路存取方案（開發階段）'),
      bullet('使用 ngrok 將本機埠號暴露至公開網路'),
      bullet('命令：ngrok http 3001'),
      bullet('將 ngrok 產生的 HTTPS 位址設定為 Telegram/Line 的 Webhook URL'),
      space(),

      new Table({
        width: { size: 9026, type: WidthType.DXA },
        columnWidths: [1600, 3600, 3826],
        rows: [
          new TableRow({ children: [cell('時段', true, 1600), cell('任務', true, 3600), cell('產出', true, 3826)] }),
          new TableRow({ children: [cell('上午', false, 1600), cell('Telegram Bot 開發 + 本機測試', false, 3600), cell('Bot 可接收指令並回覆 Agent 結果', false, 3826)] }),
          new TableRow({ children: [cell('下午', false, 1600), cell('Line Webhook 開發 + ngrok 聯調', false, 3600), cell('Line 可正常雙向通訊', false, 3826)] }),
          new TableRow({ children: [cell('晚上', false, 1600), cell('設定面板 UI 更新 + 端到端測試', false, 3600), cell('兩個平台均可從行動裝置下單給 Agent', false, 3826)] }),
        ]
      }),
      space(),

      divider(),

      // ─── 七、長期規劃 ───
      h1('七、長期規劃（未來兩週）'),
      new Table({
        width: { size: 9026, type: WidthType.DXA },
        columnWidths: [1800, 7226],
        rows: [
          new TableRow({ children: [cell('時間', true, 1800), cell('計劃功能', true, 7226)] }),
          new TableRow({ children: [cell('第 1 週', false, 1800), cell('Telegram + Line 接入、UI 白畫面修復、Mac 打包', false, 7226)] }),
          new TableRow({ children: [cell('第 2 週', false, 1800), cell('WhatsApp Business API 接入、多租戶支援（不同客戶獨立設定）', false, 7226)] }),
          new TableRow({ children: [cell('第 3 週', false, 1800), cell('定時任務增強（Cron 表達式、多頻率）、任務執行歷史持久化', false, 7226)] }),
          new TableRow({ children: [cell('第 4 週', false, 1800), cell('Agent 協作會議模式完善、匯出報告為 PDF／Word', false, 7226)] }),
        ]
      }),
      space(),

      divider(),
      space(),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 0 },
        children: [new TextRun({ text: '\u2014 文件結束 \u2014', size: 18, color: 'AAAAAA', font: 'Arial', italics: true })]
      }),
    ]
  }]
});

Packer.toBuffer(doc).then(buf => {
  const dest = 'C:/Users/14471/Desktop/小龍蝦AI團隊_產品文件_繁體中文.docx';
  fs.writeFileSync(dest, buf);
  console.log('OK: ' + dest);
}).catch(e => { console.error(e); process.exit(1); });
