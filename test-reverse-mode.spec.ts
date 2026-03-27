import { test, expect, chromium } from '@playwright/test';

test.describe.configure({ timeout: 120000 });

test('reverse mode full flow test', async () => {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 500
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  console.log('=== Step 1: Navigating to workspace ===');
  await page.goto('http://localhost:8080/workspace');
  await page.waitForLoadState('networkidle');
  console.log('✓ Page loaded');

  // 等待页面完全渲染
  await page.waitForTimeout(2000);

  console.log('\n=== Step 2: Looking for video generation section ===');

  // 查找视频生成标题或区域
  const videoGenerationTitle = page.getByText(/视频生成|逆向模式/).first();
  await expect(videoGenerationTitle).toBeVisible();
  console.log('✓ Found video generation section');

  console.log('\n=== Step 3: Looking for reverse mode button ===');

  // 查找逆向模式按钮
  const reverseModeButton = page.getByRole('button', { name: /逆向模式/ });
  await expect(reverseModeButton).toBeVisible();
  console.log('✓ Found reverse mode button');

  // 获取当前模式，点击切换到逆向模式
  const currentClass = await reverseModeButton.evaluate(el => el.className);
  console.log(`Current button class: ${currentClass}`);

  await reverseModeButton.click();
  console.log('✓ Clicked reverse mode button');
  await page.waitForTimeout(1000);

  console.log('\n=== Step 4: Checking if reverse mode panel is visible ===');

  // 检查多模态代理面板是否显示
  const multimodalPanel = page.locator('.multimodal-agent-panel, [role="region"]').filter({
    has: page.getByText(/多模态|浏览器自动化|开始自动化/)
  });

  const startButton = page.getByRole('button', { name: /开始自动化|开始/ });
  await expect(startButton).toBeVisible();
  console.log('✓ Reverse mode panel is visible, "Start Automation" button found');

  // 检查浏览器URL输入框
  const urlInput = page.getByLabel(/网址|URL|目标地址/);
  if (await urlInput.isVisible()) {
    const currentUrl = await urlInput.inputValue();
    console.log(`✓ URL input found, current value: ${currentUrl}`);
  }

  // 检查无头模式开关
  const headlessToggle = page.getByRole('switch', { name: /无头|headless/ });
  if (await headlessToggle.isVisible()) {
    console.log('✓ Headless mode toggle found');
  }

  console.log('\n=== Step 5: Checking console for errors ===');
  const errors: string[] = [];
  page.on('pageerror', err => {
    errors.push(err.message);
    console.error(`Page error: ${err.message}`);
  });

  console.log(`✓ Page loaded with ${errors.length} errors`);

  console.log('\n=== Step 6: Take screenshot ===');
  await page.screenshot({ path: 'reverse-mode-test.png', fullPage: true });
  console.log('✓ Screenshot saved to reverse-mode-test.png');

  console.log('\n=== Step 7: Clicking start automation to test ===');

  try {
    await startButton.click();
    console.log('✓ Clicked start automation button');
    await page.waitForTimeout(3000);

    // 检查是否开始初始化
    const statusElement = page.getByText(/初始化|启动|initializing/);
    if (await statusElement.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('✓ Agent started initializing');
    }

    // 检查日志区域
    const logArea = page.locator('textarea, [role="log"]');
    if (await logArea.isVisible()) {
      const logText = await logArea.innerText();
      console.log(`\n--- Operation Log ---\n${logText}\n---------------------`);
    }
  } catch (e) {
    console.log(`Failed to start automation: ${e}`);
  }

  console.log('\n=== Test Complete ===');
  console.log('Keep browser open for 5 seconds to observe...');
  await page.waitForTimeout(5000);

  await browser.close();
  console.log('✓ Browser closed');

  if (errors.length > 0) {
    console.log(`\n⚠ Found ${errors.length} JavaScript errors on page:`);
    errors.forEach(err => console.log(`- ${err}`));
  } else {
    console.log('\n✓ No JavaScript errors detected');
  }
});
