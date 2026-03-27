from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    console_logs = []
    page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))

    page.goto("http://localhost:8080/workspace")
    page.wait_for_load_state("networkidle")
    page.screenshot(path="test-panel-1-workspace.png", full_page=True)

    # Check if electronAPI.browserView exists
    result = page.evaluate("() => { return { hasElectronAPI: !!window.electronAPI, hasBrowserView: !!(window.electronAPI?.browserView), keys: window.electronAPI ? Object.keys(window.electronAPI) : [] }; }")
    print("electronAPI check:", json.dumps(result, indent=2))

    # Find and click step 4 (video generation)
    try:
        # Look for step 4 button
        step4 = page.locator("text=视频生成").first
        if step4.is_visible(timeout=3000):
            step4.click()
            page.wait_for_timeout(1500)
            print("Clicked 视频生成")
    except Exception as e:
        print(f"Step 4 click failed: {e}")

    page.screenshot(path="test-panel-2-video.png", full_page=True)

    # Look for reverse mode button
    try:
        reverse_btn = page.locator("text=逆向模式").first
        if reverse_btn.is_visible(timeout=3000):
            reverse_btn.click()
            page.wait_for_timeout(1500)
            print("Clicked 逆向模式")
        else:
            print("逆向模式 button not visible")
    except Exception as e:
        print(f"Reverse mode click failed: {e}")

    page.screenshot(path="test-panel-3-reverse.png", full_page=True)

    # Check all buttons visible
    buttons = page.locator("button").all()
    btn_texts = []
    for btn in buttons:
        try:
            t = btn.inner_text()
            if t.strip():
                btn_texts.append(t.strip().replace("\n", " "))
        except:
            pass
    print("Visible buttons:", btn_texts[:20])

    # Check for browserContainerRef div
    container = page.locator("[class*='bg-black']").first
    if container.is_visible(timeout=2000):
        box = container.bounding_box()
        print("Browser container box:", box)
    else:
        print("Browser container not found")

    print("\nConsole logs:", console_logs[:10])
    browser.close()
    print("Done")
