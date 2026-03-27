import { chromium } from 'playwright';

(async () => {
  console.log('Starting reverse mode test...\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 500,
    args: ['--window-size=1920,1080']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  // Capture console errors
  const errors = [];
  page.on('pageerror', (err) => {
    console.error(`[PAGE ERROR] ${err.message}`);
    errors.push(err.message);
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.error(`[CONSOLE ERROR] ${msg.text()}`);
      errors.push(msg.text());
    }
  });

  try {
    // Step 1: Navigate
    console.log('=== Step 1: Navigating to workspace ===');
    await page.goto('http://localhost:8080/workspace', {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    await page.waitForTimeout(2000);
    console.log('✓ Page loaded\n');

    // Step 2: Find video generation area
    console.log('=== Step 2: Finding video generation section ===');

    // Look for any text matching video generation or reverse mode
    const videoTexts = await page.getByText(/视频生成|逆向模式/).all();
    if (videoTexts.length === 0) {
      console.log('⚠ No "视频生成" text found, scrolling down...');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1000);
    } else {
      console.log(`✓ Found ${videoTexts.length} matching text elements`);
    }

    // Step 3: Find reverse mode button and click
    console.log('\n=== Step 3: Finding and clicking reverse mode ===');

    // Try different selectors for reverse mode button
    let reverseButton = null;

    // Try by text first
    const reverseButtons = await page.getByRole('button').filter({
      hasText: /逆向模式/
    }).all();

    if (reverseButtons.length > 0) {
      reverseButton = reverseButtons[reverseButtons.length - 1];
      console.log('✓ Found reverse mode button by text');
    } else {
      // Try any button with "逆向" text
      const allButtons = await page.getByRole('button').all();
      for (const btn of allButtons) {
        const text = await btn.innerText();
        if (text.includes('逆向')) {
          reverseButton = btn;
          console.log('✓ Found reverse mode button');
          break;
        }
      }
    }

    if (!reverseButton) {
      console.log('❌ Could not find reverse mode button');
      await page.screenshot({ path: 'error-cannot-find-button.png', fullPage: true });
      await page.waitForTimeout(3000);
      await browser.close();
      return;
    }

    const isActive = await reverseButton.evaluate(el => {
      const classList = el.className || '';
      return classList.includes('bg-background') || classList.includes('shadow-sm');
    });
    console.log(`Reverse button is active: ${isActive}`);

    if (!isActive) {
      await reverseButton.click();
      console.log('✓ Clicked reverse mode button');
      await page.waitForTimeout(1500);
    } else {
      console.log('✓ Reverse mode already active');
    }

    // Verify heading changed to "逆向模式"
    const heading = await page.getByRole('heading').filter({ hasText: /逆向模式/ }).first();
    if (await heading.isVisible()) {
      console.log('✓ Page heading shows "逆向模式"');
    }

    // Step 4: Check MultimodalAgentPanel
    console.log('\n=== Step 4: Checking Multimodal Agent Panel ===');

    // Look for start automation button
    const startButtons = await page.getByRole('button').filter({
      hasText: /开始自动化|开始/
    }).all();

    if (startButtons.length === 0) {
      console.log('❌ Could not find "开始自动化" button');
      await page.screenshot({ path: 'error-cannot-find-start.png', fullPage: true });
    } else {
      console.log(`✓ Found ${startButtons.length} start button(s)`);
    }

    // Look for URL input
    const urlInputs = await page.getByRole('textbox').all();
    for (const input of urlInputs) {
      const value = await input.inputValue().catch(() => '');
      if (value.includes('jimeng.jianying.com')) {
        console.log(`✓ Found URL input with default value: ${value}`);
        break;
      }
    }

    // Look for headless toggle
    const toggles = await page.getByRole('switch').all();
    if (toggles.length > 0) {
      console.log(`✓ Found ${toggles.length} toggle switches (likely for headless mode)`);
    }

    // Look for log area
    const logAreas = await page.locator('[role="log"], .log-area, textarea').all();
    if (logAreas.length > 0) {
      console.log('✓ Found operation log area');
    }

    // Take screenshot
    await page.screenshot({ path: 'reverse-mode-loaded.png', fullPage: true });
    console.log('✓ Screenshot saved: reverse-mode-loaded.png');

    // Step 5: Try starting automation
    console.log('\n=== Step 5: Starting automation ===');

    if (startButtons.length > 0) {
      const startButton = startButtons[0];
      await startButton.click();
      console.log('✓ Clicked start automation');
      await page.waitForTimeout(5000);

      // Check what happens
      const statusTexts = await page.getByText(/初始化|initializing|正在启动/).all();
      if (statusTexts.length > 0) {
        console.log('✓ Agent is initializing');
      }

      // Check logs
      for (const logArea of logAreas) {
        const text = await logArea.innerText().catch(() => '');
        if (text) {
          console.log('\n--- Operation Log ---');
          const lines = text.trim().split('\n');
          lines.slice(-15).forEach(line => console.log('  ' + line));
          console.log('---------------------');
        }
      }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('TEST COMPLETE');
    console.log('='.repeat(50));
    console.log(`Total JavaScript errors: ${errors.length}`);

    if (errors.length > 0) {
      console.log('\nErrors found:');
      errors.forEach((err, i) => console.log(`  ${i + 1}. ${err}`));
    } else {
      console.log('\n✓ No JavaScript errors - reverse mode loaded successfully!');
    }

    // Keep browser open a bit more to see
    console.log('\nKeeping browser open for 10 seconds...');
    await page.waitForTimeout(10000);

  } catch (error) {
    console.error('\n❌ Test failed with exception:', error.message);
    await page.screenshot({ path: 'test-exception-error.png', fullPage: true });
    errors.push(error.message);
  } finally {
    await browser.close();
    console.log('\n✓ Browser closed, test finished');
    if (errors.length > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
})();
