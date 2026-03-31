(() => {
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const visible = (el) => {
    if (!(el instanceof HTMLElement)) return false;
    const st = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return st.display !== 'none' && st.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };
  const models = Array.from(document.querySelectorAll('[role="combobox"]'))
    .filter(visible)
    .map((el) => ({
      el,
      text: norm(el.innerText || el.textContent || ''),
      rect: el.getBoundingClientRect(),
    }))
    .filter((x) => /Seedance 2\.0/i.test(x.text))
    .sort((a, b) => a.rect.top - b.rect.top);
  const picked = models[models.length - 1] || null;
  if (!picked) return { ok: false, step: 'no-model-combobox' };
  picked.el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  picked.el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  picked.el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  picked.el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  picked.el.click();
  return {
    ok: true,
    text: picked.text,
    top: Math.round(picked.rect.top),
    left: Math.round(picked.rect.left),
    count: models.length,
  };
})()
