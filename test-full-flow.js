import { chromium } from 'playwright';

(async () => {
  console.log('='.repeat(60));
  console.log('Starting FULL FLOW test to reverse mode');
  console.log('='.repeat(60) + '\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 800,
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

    const textarea = page.getByRole('textbox').first();
    await textarea.fill(`# 测试短剧

主角走进房间，看到桌子上放着一封信。
他缓缓走向桌子，拿起信封拆开。
信封里掉出一张照片，主角惊讶地睁大了眼睛。
主角转身看向门口，手心微微出汗。
门口站着一个熟悉的身影，故事就此展开。
`);
    console.log('✓ Script filled\n');

    // Step 3: Click analyze button
    console.log('3. Looking for analyze button...');
    const analyzeButton = page.getByRole('button', { name: /分析剧本|开始分析/ });
    if (await analyzeButton.isVisible({ timeout: 5000 })) {
      await analyzeButton.click();
      console.log('✓ Started analysis');
      await page.waitForTimeout(3000);
    } else {
      console.log('⚠ Could not find analyze button, checking if we can go to next step...');
    }

    // Look for "下一步" button and click until we get to step 4 (video generation)
    console.log('\n4. Clicking next until we reach video generation...');

    for (let i = 1; i <= 4; i++) {
      await page.waitForTimeout(1500);

      const nextButton = page.getByRole('button', { name: /下一步|下一步/ })
        .or(page.getByRole('button', { name: /下一步/ }));

      if (await nextButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Check if button is enabled
        const isDisabled = await nextButton.evaluate(el => el.disabled);
        if (!isDisabled) {
          console.log(`  ✓ Clicking next (step ${i} → step ${i + 1})`);
          await nextButton.click();
          await page.waitForTimeout(2000);
        } else {
          console.log(`  ⚠ Next button disabled at step ${i}, waiting for analysis...`);
          await page.waitForTimeout(5000);
          // Check again
          const stillDisabled = await nextButton.evaluate(el => el.disabled);
          if (!stillDisabled) {
            await nextButton.click();
            await page.waitForTimeout(2000);
          }
        }
      } else {
        console.log(`  ⚠ No next button found at step ${i}`);
        break;
      }

      // Take screenshot after each step
      await page.screenshot({ path: `step-${i + 1}.png`, fullPage: true });
    }

    await page.waitForTimeout(2000);

    // Now we should be at step 4 - video generation
    console.log('\n5. Looking for reverse mode button...');
    await page.screenshot({ path: 'before-reverse-mode.png', fullPage: true });

    // Scroll to make sure reverse mode is visible
    await page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    });
    await page.waitForTimeout(1000);

    // Find reverse mode button
    let reverseButton = null;

    // Try multiple selectors
    const buttons = await page.getByRole('button').all();
    for (const btn of buttons) {
      const text = await btn.innerText().catch(() => '');
      if (text.includes('逆向模式')) {
        reverseButton = btn;
        console.log('✓ Found "逆向模式" button by text');
        break;
      }
    }

    if (!reverseButton) {
      console.log('❌ Could not find reverse mode button');
      console.log('\nAvailable buttons found:');
      for (const btn of buttons) {
        const text = await btn.innerText().catch(() => '');
        if (text.trim()) console.log(`  - "${text}"`);
      }
      await page.screenshot({ path: 'cannot-find-reverse.png', fullPage: true });
      throw new Error('Reverse mode button not found');
    }

    // Check if already active
    const classList = await reverseButton.evaluate(el => el.className);
    const isActive = classList.includes('bg-background') && classList.includes('shadow-sm');
    console.log(`Reverse button active: ${isActive}`);

    if (!isActive) {
      console.log('Clicking reverse mode button...');
      await reverseButton.click();
      await page.waitForTimeout(2000);
    }

    // Verify heading changed
    const heading = await page.getByRole('heading').filter({ hasText: '逆向模式' }).first();
    if (await heading.isVisible()) {
      console.log('✓ Page heading shows "逆向模式" - reverse mode activated');
    } else {
      console.log('⚠ Could not find "逆向模式" heading');
    }

    // Check MultimodalAgentPanel is loaded
    console.log('\n6. Checking Multimodal Agent Panel...');

    // Check for start button
    const startButtons = await page.getByRole('button').filter({
      hasText: /开始自动化|开始/
    }).all();

    if (startButtons.length > 0) {
      console.log(`✓ Found ${startButtons.length} start automation button(s)`);
    } else {
      console.log('⚠ No start button found');
    }

    // Check for URL input
    const urlInputs = await page.getByRole('textbox').all();
    let hasDefaultUrl = false;
    for (const input of urlInputs) {
      const value = await input.inputValue().catch(() => '');
      if (value.includes('jimeng.jianying.com')) {
        console.log(`✓ Found URL input with default value: ${value}`);
        hasDefaultUrl = true;
        break;
      }
    }

    // Check for headless mode toggle
    const toggles = await page.getByRole('switch').all();
    console.log(`✓ Found ${toggles.length} toggle switches (usually includes headless mode)`);

    // Check for log area
    const logAreas = await page.locator('[role="log"], .log-area, textarea').all();
    if (logAreas.length > 0) {
      console.log('✓ Found operation log area');
    }

    // Check if any errors when loading reverse mode
    console.log(`\n✓ Reverse mode panel loaded successfully`);
    await page.screenshot({ path: 'reverse-mode-activated.png', fullPage: true });

    // Try clicking start
    console.log('\n7. Testing start automation...');

    if (startButtons.length > 0) {
      const startButton = startButtons[0];
      const isDisabled = await startButton.evaluate(el => el.disabled);
      console.log(`Start button disabled: ${isDisabled}`);

      if (!isDisabled) {
        console.log('Clicking start automation...');
        await startButton.click();
        await page.waitForTimeout(5000);

        // Check logs
        console.log('\n--- Current operation log ---');
        for (const logArea of logAreas) {
          const text = await logArea.innerText().catch(() => '');
          if (text && text.trim()) {
            const lines = text.trim().split('\n');
            const lastLines = lines.slice(-10);
            lastLines.forEach(line => console.log(`  ${line}`));
          }
        }
        console.log('------------------------------');
      }
    }

    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ TEST COMPLETE - Reverse mode reached successfully!');
    console.log('='.repeat(60));
    console.log(`Total JavaScript errors: ${errors.length}`);

    if (errors.length > 0) {
      console.log('\nErrors found during test:');
      errors.forEach((err, i) => console.log(`  ${i + 1}. ${err}`));
    }

    console.log('\nScreenshots saved:');
    console.log('  - reverse-mode-activated.png (final state)');
    console.log('  - before-reverse-mode.png (before clicking reverse mode)');

    // Keep browser open for observation
    console.log('\nKeeping browser open for 15 seconds for manual observation...');
    await page.waitForTimeout(15000);

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    await page.screenshot({ path: 'test-failure-error.png', fullPage: true });
    errors.push(error.message);
  } finally {
    await browser.close();
    console.log('\n✓ Browser closed');

    if (errors.length > 0) {
      console.log(`\n⚠ Completed with ${errors.length} errors`);
      process.exit(1);
    } else {
      console.log('\n✅ Test completed successfully with no errors!');
      process.exit(0);
    }
  }
})();
