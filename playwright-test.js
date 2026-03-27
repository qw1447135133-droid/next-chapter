const { chromium } = require('playwright');

(async () => {
  console.log('正在启动浏览器...');

  // 启动浏览器
  const browser = await chromium.launch({
    headless: false // 设置为 false 以便能看到浏览器窗口
  });

  console.log('正在打开新页面...');
  const page = await browser.newPage();

  console.log('正在导航到即梦网站...');
  await page.goto('https://jimeng.jianying.com/ai-tool/home');

  console.log('页面标题:', await page.title());

  // 等待页面加载完成
  await page.waitForLoadState('networkidle');

  console.log('页面已加载完成');

  // 等待一段时间以便观察
  await page.waitForTimeout(5000);

  // 关闭浏览器
  await browser.close();
  console.log('浏览器已关闭');
})();