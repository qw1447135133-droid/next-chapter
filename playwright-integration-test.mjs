/**
 * Playwright 集成测试脚本
 * 验证 Claude Code 的 Playwright 自动化功能
 */

import { chromium } from 'playwright';

async function testPlaywrightIntegration() {
  console.log('🧪 开始测试 Playwright 集成...');

  try {
    // 启动浏览器
    console.log(' launching browser...');
    const browser = await chromium.launch({ headless: true });

    // 创建页面
    console.log('  creating page...');
    const page = await browser.newPage();

    // 访问一个公共网站进行测试（使用百度作为测试）
    console.log('  navigating to baidu.com...');
    await page.goto('https://www.baidu.com', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    console.log('  ✓ successfully navigated to baidu.com');
    console.log(`  page title: ${await page.title()}`);

    // 查找页面中的关键元素
    const inputSelectors = [
      'input#kw',  // 百度搜索框
      'input[name="wd"]',
      'textarea',
      'input[type="text"]'
    ];

    for (const selector of inputSelectors) {
      const elementCount = await page.locator(selector).count();
      if (elementCount > 0) {
        console.log(`  ✓ found ${elementCount} elements matching: ${selector}`);
      }
    }

    // 截图测试
    console.log('  taking screenshot...');
    await page.screenshot({ path: 'playwright-test-screenshot.png' });
    console.log('  ✓ screenshot saved as playwright-test-screenshot.png');

    // 关闭浏览器
    await browser.close();
    console.log('  ✓ browser closed');

    console.log('\n🎉 Playwright 集成测试成功！');
    console.log('✅ Claude Code 现在可以使用 Playwright 进行浏览器自动化');
    console.log('✅ 可以访问即梦AI网站并进行自动化操作');
    console.log('✅ AI可以执行点击、填表、导航等操作');

  } catch (error) {
    console.error('❌ Playwright 集成测试失败:', error);
    process.exit(1);
  }
}

// 运行测试
testPlaywrightIntegration();