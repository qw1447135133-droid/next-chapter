(async () => {
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const visible = (el) => {
    if (!(el instanceof HTMLElement)) return false;
    const st = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return st.display !== 'none' && st.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };
  const models = Array.from(document.querySelectorAll('[role="combobox"]'))
    .filter(visible)
    .filter((el) => /Seedance 2\.0/i.test(norm(el.textContent || '')))
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  const model = models[models.length - 1];
  if (!(model instanceof HTMLElement)) return { ok: false, step: 'model-combobox-not-found' };
  model.click();
  await new Promise((r) => setTimeout(r, 300));
  const option = document.querySelector("div.lv-select-popup li[role='option']:nth-of-type(2)");
  if (!(option instanceof HTMLElement)) {
    return {
      ok: false,
      step: 'target-option-not-found',
      popupHtml: document.querySelector('div.lv-select-popup')?.outerHTML?.slice(0, 1200) || ''
    };
  }
  const optionText = norm(option.textContent || '');
  option.click();
  await new Promise((r) => setTimeout(r, 300));
  const afterModels = Array.from(document.querySelectorAll('[role="combobox"]'))
    .filter(visible)
    .map((el) => ({ text: norm(el.textContent || ''), top: Math.round(el.getBoundingClientRect().top) }))
    .filter((x) => /Seedance 2\.0/i.test(x.text))
    .sort((a, b) => a.top - b.top);
  return { ok: true, optionText, afterModels };
})()
