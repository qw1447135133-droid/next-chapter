# Reverse BrowserView Smoke Checklist

1. Run `npm run build`.
2. Run `node electron/build.mjs`.
3. Launch the Electron app without `ELECTRON_RUN_AS_NODE=1`.
4. Open an existing workspace project with prepared scenes and cached assets.
5. Confirm `files/projects/<projectId>/texts/segments/1-1-1.txt` exists.
6. Go to Step 4 and switch to reverse mode.
7. Confirm only one in-app browser is visible.
8. Click `准备下一段 1-1-1`.
9. Wait for the panel status to become `已完成`.
10. Compare these three values and confirm they are identical:
    - `下一片段预览` or `最近已准备片段` text in the panel
    - `files/projects/<projectId>/texts/segments/1-1-1.txt`
    - prompt content inside the BrowserView page
11. Confirm the page has uploaded reference images for `1-1-1`.
12. Confirm the automation did not click the final generate/submit button.
13. If anything fails, capture:
    - panel log lines
    - browser state block
    - the exact step where the flow stopped
