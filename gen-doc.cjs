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
          children: [new TextRun({ text: '小龙虾 AI 团队 — 产品文档', size: 18, color: '999999', font: 'Arial' })]
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
            new TextRun({ text: ' 页', size: 18, color: '999999', font: 'Arial' }),
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
        children: [new TextRun({ text: '🦞', size: 96, font: 'Segoe UI Emoji' })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 120 },
        children: [new TextRun({ text: '小龙虾 AI 团队', bold: true, size: 60, color: '1a4a6b', font: 'Arial' })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 80 },
        children: [new TextRun({ text: '跨境电商多 Agent 数字员工系统', size: 28, color: '2c6fa8', font: 'Arial' })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 40 },
        children: [new TextRun({ text: 'v0.1.0  |  ' + today, size: 22, color: '888888', font: 'Arial' })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 800 },
        children: [new TextRun({ text: '产品文档 & 开发计划', size: 22, color: '888888', font: 'Arial', italics: true })]
      }),

      divider(),

      // ─── 一、项目概述 ───
      h1('一、项目概述'),
      p('小龙虾 AI 团队是一款面向跨境电商从业者的桌面级 AI 多 Agent 协作工具，基于 Electron + Next.js 开发，现已打包为 Windows 可执行文件（.exe）。系统内置 6 只功能各异的「龙虾 Agent」，可接收用户指令后自动拆解任务、并发执行，覆盖选品分析、文案创作、视觉设计、短视频策划、客服回复等核心场景。'),
      space(),

      h2('1.1 技术栈'),
      new Table({
        width: { size: 9026, type: WidthType.DXA },
        columnWidths: [2400, 6626],
        rows: [
          new TableRow({ children: [cell('层次', true, 2400), cell('技术选型', true, 6626)] }),
          new TableRow({ children: [cell('前端框架', false, 2400), cell('Next.js 14.2.5 (静态导出 SSG)', false, 6626)] }),
          new TableRow({ children: [cell('桌面容器', false, 2400), cell('Electron 30.0.0', false, 6626)] }),
          new TableRow({ children: [cell('打包工具', false, 2400), cell('electron-builder 26.8.1 (NSIS 安装包)', false, 6626)] }),
          new TableRow({ children: [cell('状态管理', false, 2400), cell('Zustand', false, 6626)] }),
          new TableRow({ children: [cell('通信协议', false, 2400), cell('WebSocket（本地 ws://localhost:3001）', false, 6626)] }),
          new TableRow({ children: [cell('AI 调用', false, 2400), cell('OpenAI SDK（兼容多家供应商 API）', false, 6626)] }),
          new TableRow({ children: [cell('图像生成', false, 2400), cell('幻影龙虾内置图片生成（[IMAGE_PROMPT] 协议）', false, 6626)] }),
        ]
      }),
      space(),

      h2('1.2 系统架构'),
      p('应用运行时由三个进程协同工作：'),
      bullet('Electron 主进程（main.cjs）— 管理窗口生命周期、单例锁、系统托盘'),
      bullet('Next.js 渲染进程（WebContents）— 加载 out/index.html 静态页面，负责 UI 渲染'),
      bullet('WebSocket 服务（ws-server.js，端口 3001）— Agent 引擎与前端的实时通信通道'),
      space(),

      divider(),

      // ─── 二、Agent 功能说明 ───
      h1('二、六只龙虾 Agent 功能说明'),
      new Table({
        width: { size: 9026, type: WidthType.DXA },
        columnWidths: [700, 1600, 1800, 4926],
        rows: [
          new TableRow({ children: [cell('图标', true, 700), cell('名称', true, 1600), cell('角色', true, 1800), cell('核心能力', true, 4926)] }),
          new TableRow({ children: [cell('🦞', false, 700), cell('虾总管', false, 1600), cell('总调度员', false, 1800), cell('接收用户指令 → 任务拆解 → 分配给各 Agent → 汇总报告', false, 4926)] }),
          new TableRow({ children: [cell('🔍', false, 700), cell('探海龙虾', false, 1600), cell('市场分析师', false, 1800), cell('竞品分析、选品趋势、市场数据研究、关键词挖掘', false, 4926)] }),
          new TableRow({ children: [cell('✍️', false, 700), cell('执笔龙虾', false, 1600), cell('文案专家', false, 1800), cell('多语种文案创作、SEO 标题优化、商品详情页撰写', false, 4926)] }),
          new TableRow({ children: [cell('🎨', false, 700), cell('幻影龙虾', false, 1600), cell('视觉设计师', false, 1800), cell('海报/Banner 生成提示词、图片创作方案设计', false, 4926)] }),
          new TableRow({ children: [cell('🎬', false, 700), cell('戏精龙虾', false, 1600), cell('短视频策划', false, 1800), cell('TikTok/抖音视频脚本、数字人内容、多平台矩阵计划', false, 4926)] }),
          new TableRow({ children: [cell('💬', false, 700), cell('迎客龙虾', false, 1600), cell('客服专员', false, 1800), cell('多语种客服话术、评论回复模板、买家互动策略', false, 4926)] }),
        ]
      }),
      space(),

      h2('2.1 任务路由规则'),
      p('虾总管根据关键词自动将任务分配给对应 Agent：'),
      bullet('竞品 / 选品 / 趋势 / 数据 / 市场 / 分析 → 探海龙虾'),
      bullet('文案 / 标题 / SEO / 描述 / 翻译 → 执笔龙虾'),
      bullet('图片 / 海报 / 设计 / 生图 / 画 → 幻影龙虾'),
      bullet('视频 / TikTok / 抖音 / 脚本 → 戏精龙虾'),
      bullet('客服 / 评论 / 回复 / 售后 → 迎客龙虾'),
      bullet('复杂任务自动拆分为多个子任务并发执行'),
      space(),

      divider(),

      // ─── 三、支持的 AI 模型供应商 ───
      h1('三、支持的 AI 模型供应商'),
      new Table({
        width: { size: 9026, type: WidthType.DXA },
        columnWidths: [2200, 6826],
        rows: [
          new TableRow({ children: [cell('供应商', true, 2200), cell('支持模型（示例）', true, 6826)] }),
          new TableRow({ children: [cell('OpenAI', false, 2200), cell('gpt-4o, gpt-4o-mini, o1, o1-mini, o3-mini', false, 6826)] }),
          new TableRow({ children: [cell('SiliconFlow', false, 2200), cell('DeepSeek-R1, DeepSeek-V3, Qwen2.5-72B, QwQ-32B', false, 6826)] }),
          new TableRow({ children: [cell('DeepSeek', false, 2200), cell('deepseek-chat, deepseek-reasoner', false, 6826)] }),
          new TableRow({ children: [cell('阿里云百炼', false, 2200), cell('qwen-max, qwen-plus, qwen-turbo, qwen-long 等', false, 6826)] }),
          new TableRow({ children: [cell('4sAPI', false, 2200), cell('兼容 OpenAI 格式的第三方中转', false, 6826)] }),
          new TableRow({ children: [cell('自定义', false, 2200), cell('任意兼容 OpenAI API 格式的供应商', false, 6826)] }),
        ]
      }),
      p('每只 Agent 可单独配置使用不同的供应商和模型，灵活适配不同预算和需求。', { italics: true, color: '666666' }),
      space(),

      divider(),

      // ─── 四、主要功能模块 ───
      h1('四、主要功能模块'),

      h2('4.1 看板（Dashboard）'),
      bullet('实时显示各 Agent 运行状态（运行中 / 空闲 / 错误）'),
      bullet('统计运行中 Agent 数量、完成任务数、总 Token 用量、预估费用'),
      bullet('显示最近任务对话记录'),
      space(),

      h2('4.2 任务面板'),
      bullet('8 个预设快捷任务：竞品分析、产品文案、海报设计、视频脚本、客服话术、SEO 关键词、邮件营销、社媒内容'),
      bullet('定时任务：支持添加定时自动执行的任务'),
      bullet('对话历史：多会话管理，支持新建、切换、删除会话'),
      space(),

      h2('4.3 会议模式'),
      bullet('多只龙虾协作讨论同一课题'),
      bullet('各 Agent 互相审阅意见后输出最终方案'),
      space(),

      h2('4.4 设置面板'),
      bullet('Agent 配置：为每只龙虾单独配置名字、Emoji、性格 Prompt、模型'),
      bullet('模型供应商：管理多个 API Key 和 Base URL'),
      bullet('API 连通性测试：一键测试配置是否正确'),
      space(),

      h2('4.5 活动记录'),
      bullet('右侧面板实时显示所有 Agent 的操作日志'),
      bullet('记录任务开始、完成、失败和耗时'),
      space(),

      divider(),

      // ─── 五、打包与部署 ───
      h1('五、打包与部署'),

      h2('5.1 当前打包状态'),
      new Table({
        width: { size: 9026, type: WidthType.DXA },
        columnWidths: [2400, 6626],
        rows: [
          new TableRow({ children: [cell('项目', true, 2400), cell('说明', true, 6626)] }),
          new TableRow({ children: [cell('目标平台', false, 2400), cell('Windows（NSIS 安装包）', false, 6626)] }),
          new TableRow({ children: [cell('输出文件', false, 2400), cell('dist-electron/小龙虾AI团队 Setup 0.1.0.exe', false, 6626)] }),
          new TableRow({ children: [cell('单实例锁', false, 2400), cell('已实现，防止多窗口重复打开', false, 6626)] }),
          new TableRow({ children: [cell('资源加载', false, 2400), cell('HTML/JS/CSS 从 app.asar.unpacked 加载（已修复 file:// 路径问题）', false, 6626)] }),
          new TableRow({ children: [cell('UI 加载状态', false, 2400), cell('⚠️ 待修复：资源路径为绝对路径（/_next/static/...），file:// 下 CSS/JS 无法加载', false, 6626)] }),
        ]
      }),
      space(),

      h2('5.2 已知问题'),
      bullet('UI 白屏问题：index.html 中引用的 CSS/JS 为 /_next/static/... 绝对路径，在 file:// 协议下浏览器无法解析，需要在 next.config.js 中设置 assetPrefix: "." 并重新打包'),
      bullet('Mac 版本未打包：需在 Mac 机器上执行 npm run electron:build:mac'),
      space(),

      divider(),

      // ─── 六、开发计划 ───
      h1('六、开发计划'),

      h2('6.1 今日任务（' + today + '）'),
      bullet('修复 UI 加载问题：next.config.js 设置 assetPrefix: "." 生成相对路径并重新打包'),
      bullet('验证 Windows exe 正常运行'),
      bullet('Mac 版本打包测试'),
      space(),

      h2('6.2 明日计划（' + tomorrow + '）— Telegram & Line 平台接入'),
      p('目标：让用户可以通过 Telegram 或 Line 直接给龙虾 Agent 发指令，Agent 执行后将结果回复到对话中。', { bold: true }),
      space(),

      h3('Telegram Bot 接入'),
      numbered('在 @BotFather 创建 Bot，获取 Bot Token'),
      numbered('安装依赖：npm install node-telegram-bot-api'),
      numbered('在 server/ws-server.js 中新增 Telegram 监听模块'),
      numbered('收到用户消息 → 调用 Agent 引擎 → 将结果通过 bot.sendMessage 回复'),
      numbered('支持 /start、/help、/task <指令> 等命令'),
      numbered('在设置面板添加 Telegram Bot Token 配置项'),
      space(),

      h3('Line Messaging API 接入'),
      numbered('申请 Line Official Account，开启 Messaging API，获取 Channel Access Token + Channel Secret'),
      numbered('安装依赖：npm install @line/bot-sdk'),
      numbered('实现 Webhook 接口（需公网地址，可用 ngrok 测试）'),
      numbered('收到 LINE 消息事件 → 调用 Agent 引擎 → replyMessage 回复'),
      numbered('在设置面板添加 Line Token / Secret 配置项'),
      space(),

      h3('公网访问方案（开发阶段）'),
      bullet('使用 ngrok 将本地端口暴露到公网'),
      bullet('命令：ngrok http 3001'),
      bullet('将 ngrok 生成的 HTTPS 地址配置为 Telegram/Line 的 Webhook URL'),
      space(),

      new Table({
        width: { size: 9026, type: WidthType.DXA },
        columnWidths: [1600, 3600, 3826],
        rows: [
          new TableRow({ children: [cell('时间', true, 1600), cell('任务', true, 3600), cell('产出', true, 3826)] }),
          new TableRow({ children: [cell('上午', false, 1600), cell('Telegram Bot 开发 + 本地测试', false, 3600), cell('Bot 可接收指令并回复 Agent 结果', false, 3826)] }),
          new TableRow({ children: [cell('下午', false, 1600), cell('Line Webhook 开发 + ngrok 联调', false, 3600), cell('Line 可正常双向通信', false, 3826)] }),
          new TableRow({ children: [cell('晚上', false, 1600), cell('设置面板 UI 更新 + 端到端测试', false, 3600), cell('两个平台均可从移动端下单给 Agent', false, 3826)] }),
        ]
      }),
      space(),

      divider(),

      // ─── 七、长期规划 ───
      h1('七、长期规划（未来两周）'),
      new Table({
        width: { size: 9026, type: WidthType.DXA },
        columnWidths: [1800, 7226],
        rows: [
          new TableRow({ children: [cell('时间', true, 1800), cell('计划功能', true, 7226)] }),
          new TableRow({ children: [cell('第 1 周', false, 1800), cell('Telegram + Line 接入、UI 白屏修复、Mac 打包', false, 7226)] }),
          new TableRow({ children: [cell('第 2 周', false, 1800), cell('WhatsApp Business API 接入、多租户支持（不同客户独立配置）', false, 7226)] }),
          new TableRow({ children: [cell('第 3 周', false, 1800), cell('定时任务增强（Cron 表达式、多频率）、任务执行历史持久化', false, 7226)] }),
          new TableRow({ children: [cell('第 4 周', false, 1800), cell('Agent 协作会议模式完善、导出报告为 PDF/Word', false, 7226)] }),
        ]
      }),
      space(),

      divider(),
      space(),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 0 },
        children: [new TextRun({ text: '— 文档结束 —', size: 18, color: 'AAAAAA', font: 'Arial', italics: true })]
      }),
    ]
  }]
});

Packer.toBuffer(doc).then(buf => {
  const dest = 'C:/Users/14471/Desktop/小龙虾AI团队_产品文档.docx';
  fs.writeFileSync(dest, buf);
  console.log('OK: ' + dest);
}).catch(e => { console.error(e); process.exit(1); });
