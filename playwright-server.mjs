/**
 * Playwright 浏览器自动化服务器
 * 监听端口 8000，处理浏览器自动化请求
 */

import { chromium } from 'playwright';
import http from 'http';
import { URL } from 'url';

// 存储浏览器实例
const browserInstances = new Map();

// 生成实例 ID
function generateInstanceId() {
  return `instance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// 处理请求
async function handleRequest(req, res) {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // 健康检查
  if (req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', instances: browserInstances.size }));
    return;
  }

  if (req.method === 'POST' && req.url === '/api/playwright') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const result = await handlePlaywrightCommand(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        console.error('请求处理错误:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

// 处理 Playwright 命令
async function handlePlaywrightCommand(data) {
  const { command, instanceId, url, selector, text, timeout, script, headless } = data;

  console.log(`[Playwright] 命令: ${command}, 实例: ${instanceId || '新实例'}`);

  switch (command) {
    case 'open': {
      const id = generateInstanceId();
      const browser = await chromium.launch({ headless: headless !== false });
      const context = await browser.newContext();
      const page = await context.newPage();

      if (url) {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      }

      browserInstances.set(id, { browser, context, page });
      console.log(`[Playwright] 创建实例: ${id}`);
      return { success: true, instanceId: id, data: { instanceId: id, url, status: 'active' } };
    }

    case 'navigate': {
      const instance = browserInstances.get(instanceId);
      if (!instance) return { success: false, error: '实例不存在' };
      await instance.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      return { success: true, data: { url } };
    }

    case 'fill': {
      const instance = browserInstances.get(instanceId);
      if (!instance) return { success: false, error: '实例不存在' };
      await instance.page.fill(selector, text);
      return { success: true };
    }

    case 'click': {
      const instance = browserInstances.get(instanceId);
      if (!instance) return { success: false, error: '实例不存在' };
      await instance.page.click(selector);
      return { success: true };
    }

    case 'getTitle': {
      const instance = browserInstances.get(instanceId);
      if (!instance) return { success: false, error: '实例不存在' };
      const title = await instance.page.title();
      return { success: true, data: { title } };
    }

    case 'getContent': {
      const instance = browserInstances.get(instanceId);
      if (!instance) return { success: false, error: '实例不存在' };
      const content = await instance.page.content();
      return { success: true, data: { content } };
    }

    case 'getScreenshot': {
      const instance = browserInstances.get(instanceId);
      if (!instance) return { success: false, error: '实例不存在' };
      const screenshotBuffer = await instance.page.screenshot();
      const screenshot = screenshotBuffer.toString('base64');
      return { success: true, data: { screenshot } };
    }

    case 'executeScript': {
      const instance = browserInstances.get(instanceId);
      if (!instance) return { success: false, error: '实例不存在' };
      const result = await instance.page.evaluate(script);
      return { success: true, data: { result } };
    }

    case 'waitForElement': {
      const instance = browserInstances.get(instanceId);
      if (!instance) return { success: false, error: '实例不存在' };
      await instance.page.waitForSelector(selector, { timeout: timeout || 10000 });
      return { success: true };
    }

    case 'close': {
      const instance = browserInstances.get(instanceId);
      if (!instance) return { success: false, error: '实例不存在' };
      await instance.browser.close();
      browserInstances.delete(instanceId);
      console.log(`[Playwright] 关闭实例: ${instanceId}`);
      return { success: true };
    }

    default:
      return { success: false, error: `未知命令: ${command}` };
  }
}

// 启动服务器
const PORT = 8000;
const server = http.createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`\n🎭 Playwright 自动化服务器已启动`);
  console.log(`📡 监听端口: ${PORT}`);
  console.log(`🔗 API 地址: http://localhost:${PORT}/api/playwright`);
  console.log(`❤️  健康检查: http://localhost:${PORT}/api/health\n`);
});

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n正在关闭所有浏览器实例...');
  for (const [id, instance] of browserInstances) {
    try {
      await instance.browser.close();
      console.log(`已关闭实例: ${id}`);
    } catch (e) {
      console.error(`关闭实例 ${id} 失败:`, e);
    }
  }
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});