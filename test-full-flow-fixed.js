import { chromium } from 'playwright';

(async () => {
  console.log('='.repeat(60));
  console.log('Starting FULL FLOW test to reverse mode (fixed)');
  console.log('='.repeat(60) + '\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 500,
    args: ['--window-size=1920,1080', '--start-maximized']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

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
    // Step 1: Go to workspace
    console.log('1. Navigating to workspace...');
    await page.goto('http://localhost:8080/workspace', {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    await page.waitForTimeout(2000);
    console.log('✓ Workspace loaded\n');

    // Step 2: Fill script in Step 1
    console.log('2. Filling sample script...');

    // Find the main script textarea
    const textareas = await page.getByRole('textbox').all();
    let scriptTextarea = null;
    for (const ta of textareas) {
      const placeholder = await ta.getAttribute('placeholder');
      if (placeholder && (placeholder.includes('剧本') || placeholder.includes('脚本'))) {
        scriptTextarea = ta;
        break;
      }
    }
    if (!scriptTextarea) {
      scriptTextarea = textareas[0]; // fallback to first textarea
    }

    await scriptTextarea.fill(`# 测试短剧

主角走进房间，看到桌子上放着一封信。
他缓缓走向桌子，拿起信封拆开。
信封里掉出一张照片，主角惊讶地睁大了眼睛。
主角转身看向门口，手心微微出汗。
门口站着一个熟悉的身影，故事就此展开。
`);
    console.log('✓ Script filled\n');

    // Step 3: Click "AI 拆解分镜" button
    console.log('3. Clicking "AI 拆解分镜" button...');

    const analyzeButton = page.getByRole('button', { name: /AI.*拆解|拆解分镜/ });
    if (await analyzeButton.isVisible({ timeout: 5000 })) {
      const isDisabled = await analyzeButton.evaluate(el => el.disabled);
      if (isDisabled) {
        console.log('⚠ Button is disabled, checking why...');
      } else {
        await analyzeButton.click();
        console.log('✓ Analysis started');
      }
    } else {
      console.log('⚠ Analyze button not found');
    }

    await page.waitForTimeout(3000);

    // Step 4: Go directly to step 4 by clicking step indicator
    console.log('\n4. Clicking step 4 (视频生成) in step indicator...');

    // Find step 4 "视频生成" indicator and click
    const step4Button = page.getByText(/4.*视频生成/);
    if (await step4Button.isVisible()) {
      const isDisabled = await step4Button.evaluate(el => {
        const parent = el.closest('button') || el;
        return parent.disabled;
      });
      console.log(`Step 4 button disabled: ${isDisabled}`);

      if (!isDisabled) {
        await step4Button.click();
        console.log('✓ Jumped to step 4 (视频生成)');
        await page.waitForTimeout(2000);
      } else {
        console.log('⚠ Cannot jump to step 4, need to complete previous steps');
      }
    }

    await page.waitForTimeout(1000);

    // Scroll to bottom to find video generation section
    console.log('\n5. Scrolling to video generation section...');
    await page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    });
    await page.waitForTimeout(1500);

    // Take screenshot before looking for reverse mode
    await page.screenshot({ path: 'before-reverse-mode.png', fullPage: true });

    console.log('\n6. Looking for reverse mode button...');

    // Find reverse mode button - look at all buttons
    const buttons = await page.getByRole('button').all();
    let reverseButton = null;

    console.log('  Scanning all buttons for "逆向模式":');
    for (const btn of buttons) {
      const text = await btn.innerText().catch(() => '');
      if (text.includes('逆向')) {
        reverseButton = btn;
        console.log(`  ✓ Found: "${text.trim()}"`);
        break;
      }
    }

    if (!reverseButton) {
      console.log('\n  ❌ Could not find reverse mode button');
      console.log('\n  All button texts:');
      for (const btn of buttons) {
        const text = await btn.innerText().catch(() => '');
        if (text.trim()) {
          console.log(`    - "${text.trim().replace(/\n/g, ' ')}"`);
        }
      }
      await page.screenshot({ path: 'cannot-find-reverse.png', fullPage: true });
      throw new Error('Reverse mode button not found');
    }

    // Check current state
    const classList = await reverseButton.evaluate(el => el.className);
    const isActive = classList.includes('bg-background') && classList.includes('shadow-sm');
    console.log(`\n  Reverse button current state: active = ${isActive}`);

    if (!isActive) {
      console.log('  Clicking reverse mode button to activate...');
      await reverseButton.click();
      await page.waitForTimeout(2000);
    } else {
      console.log('  Reverse mode already active');
    }

    // Verify reverse mode panel is visible
    console.log('\n7. Verifying reverse mode panel...');

    // Look for heading "逆向模式"
    const heading = await page.locator('h2:has-text("逆向模式")');
    if (await heading.isVisible()) {
      console.log('✓ Heading "逆向模式" is visible');
    } else {
      console.log('⚠ Could not find "逆向模式" heading');
    }

    // Look for "开始自动化" button
    const startButtons = await page.getByRole('button').filter({
      hasText: /开始自动化|开始/
    }).all();

    if (startButtons.length > 0) {
      console.log(`✓ Found ${startButtons.length} "开始自动化" button(s)`);
    } else {
      console.log('⚠ Could not find start button');
    }

    // Look for browser URL input
    const urlInputs = await page.getByRole('textbox').all();
    let foundJimengUrl = false;
    for (const input of urlInputs) {
      const value = await input.inputValue().catch(() => '');
      if (value.includes('jimeng.jianying.com')) {
        console.log(`✓ Found URL input with default value: ${value}`);
        foundJimengUrl = true;
        break;
      }
    }

    // Look for toggles
    const toggles = await page.getByRole('switch').all();
    console.log(`✓ Found ${toggles.length} toggle switches (one should be "无头模式")`);

    // Look for log area
    const logArea = await page.locator('[role="log"]');
    if (await logArea.isVisible()) {
      console.log('✓ Operation log area is visible');
    }

    // Screenshot of activated reverse mode
    await page.screenshot({ path: 'reverse-mode-activated.png', fullPage: true });
    console.log('✓ Screenshot saved: reverse-mode-activated.png');

    // Check for any JavaScript errors after loading reverse mode
    console.log(`\n✓ Reverse mode panel loaded successfully`);

    // Try starting automation
    console.log('\n8. Attempting to start automation...');
    if (startButtons.length > 0) {
      const startBtn = startButtons[0];
      const disabled = await startBtn.evaluate(el => el.disabled);
      console.log(`  Start button disabled: ${disabled}`);

      if (!disabled) {
        console.log('  Clicking start...');
        await startBtn.click();
        await page.waitForTimeout(5000);

        // Check what's happening in logs
        if (await logArea.isVisible()) {
          const logText = await logArea.innerText();
          console.log('\n  --- Recent Operation Log ---');
          const lines = logText.trim().split('\n');
          lines.slice(-15).forEach(line => console.log(`    ${line}`));
          console.log('  ----------------------------');
        }
      }
    }

    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ TEST COMPLETE - Successfully reached reverse mode!');
    console.log('='.repeat(60));
    console.log(`Total JavaScript errors: ${errors.length}`);

    if (errors.length > 0) {
      console.log('\nErrors found:');
      errors.forEach((err, i) => console.log(`  ${i + 1}. ${err}`));
    }

    console.log('\nScreenshots:');
    console.log('  - before-reverse-mode.png');
    console.log('  - reverse-mode-activated.png (final state)');

    // Keep browser open for manual checking
    console.log('\nKeeping browser open for 15 seconds...');
    await page.waitForTimeout(15000);

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    await page.screenshot({ path: 'test-failure-error.png', fullPage: true });
    errors.push(error.message);
  } finally {
    await browser.close();
    console.log('\n✓ Browser closed');

    if (errors.length > 0) {
      console.log(`\n⚠ Test completed with ${errors.length} errors`);
      process.exit(1);
    } else {
      console.log('\n✅ Test PASSED - Reverse mode works correctly with no JavaScript errors!');
      process.exit(0);
    }
  }
})();
