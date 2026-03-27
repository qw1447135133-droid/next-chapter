import { chromium } from 'playwright';

(async () => {
  console.log('🚀 启动即梦网站自动化流程...');

  // 启动浏览器
  const browser = await chromium.launch({
    headless: false, // 设为 false 以便能看到操作过程
    args: ['--disable-blink-features=AutomationControlled'] // 避免反爬检测
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  console.log('🌐 导航到即梦AI创作平台...');
  await page.goto('https://jimeng.jianying.com/ai-tool/home', {
    waitUntil: 'networkidle',
    timeout: 30000
  });

  console.log('📋 页面标题:', await page.title());

  // 等待页面加载完成
  await page.waitForSelector('text=欢迎来到即梦', { timeout: 10000 }).catch(() => {
    console.log('⚠️ 未找到预期的欢迎文本，继续执行...');
  });

  // 检查页面是否成功加载
  const isLoaded = await page.isVisible('text=即梦AI').catch(() => false) ||
                   await page.isVisible('text=创作').catch(() => false) ||
                   await page.getByText('视频生成').isVisible().catch(() => false);

  if (isLoaded) {
    console.log('✅ 即梦网站已成功加载');

    // 等待并点击视频生成功能（如果有相关按钮）
    try {
      // 查找可能的视频生成按钮
      const selectors = [
        'text=视频生成',
        'text=开始创作',
        'text=AI视频',
        '[href*="/create"]',
        '[data-testid*="create"]',
        '.create-btn',
        '[title*="创作"]'
      ];

      let buttonFound = false;
      for (const selector of selectors) {
        try {
          const element = page.locator(selector);
          if (await element.count() > 0) {
            console.log(`🔍 找到按钮: ${selector}`);
            await element.first().scrollIntoViewIfNeeded();
            await element.first().click({ delay: 200 }); // 添加延迟以模拟真实点击
            console.log('🖱️ 点击了视频生成按钮');
            buttonFound = true;
            break;
          }
        } catch (e) {
          // 继续尝试下一个选择器
          continue;
        }
      }

      if (!buttonFound) {
        console.log('⚠️ 未找到视频生成按钮，尝试其他方法...');

        // 查找任何包含"创作"或"生成"的按钮
        const creationButtons = page.locator('button:has-text("创作"), button:has-text("生成"), a:has-text("创作"), a:has-text("生成")');
        const count = await creationButtons.count();

        if (count > 0) {
          console.log(`🔍 找到 ${count} 个相关按钮，点击第一个`);
          await creationButtons.first().click({ delay: 200 });
        } else {
          console.log('💡 尝试查找输入框或其他交互元素...');

          // 查找输入框
          const inputSelectors = [
            '[placeholder*="提示"]',
            '[placeholder*="prompt"]',
            '[placeholder*="描述"]',
            'textarea',
            'input[type="text"]'
          ];

          for (const selector of inputSelectors) {
            try {
              const element = page.locator(selector);
              if (await element.count() > 0) {
                console.log(`📝 找到输入框: ${selector}`);
                await element.first().scrollIntoViewIfNeeded();

                // 输入示例文本
                await element.first().fill('一个美丽的风景视频，阳光明媚，鸟儿飞翔');
                console.log('✏️ 在输入框中填入了示例文本');
                break;
              }
            } catch (e) {
              continue;
            }
          }
        }
      }

      // 等待一段时间让用户查看结果
      console.log('⏳ 等待页面响应...');
      await page.waitForTimeout(5000);

      // 截图当前页面
      console.log('📸 正在截取当前页面...');
      await page.screenshot({
        path: 'jimeng-automation-screenshot.png',
        fullPage: true
      });
      console.log('💾 截图已保存为 jimeng-automation-screenshot.png');

    } catch (error) {
      console.log('❌ 操作过程中出现错误:', error.message);
    }
  } else {
    console.log('❌ 页面可能未正确加载或被阻止访问');
  }

  console.log('🔚 30秒后将关闭浏览器（这段时间内您可以手动操作浏览器）');
  await page.waitForTimeout(30000); // 给用户时间查看和手动操作

  // 关闭浏览器
  await browser.close();
  console.log('✅ 浏览器已关闭，自动化流程完成');
})();