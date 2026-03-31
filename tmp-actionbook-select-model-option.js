(() => {
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const visible = (el) => {
    if (!(el instanceof HTMLElement)) return false;
    const st = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return st.display !== 'none' && st.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };
  const target = Array.from(document.querySelectorAll('[role="option"]'))
    .filter(visible)
    .find((el) => /Seedance 2\.0 全能王者/.test(norm(el.textContent || '')));
  if (!(target instanceof HTMLElement)) return { ok: false, step: 'target-option-not-found' };
  const text = norm(target.innerText || target.textContent || '');
  const rect = target.getBoundingClientRect();
  target.scrollIntoView({ block: 'center', inline: 'center' });
  target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  target.click();
  const combos = Array.from(document.querySelectorAll('[role="combobox"]'))
    .filter(visible)
    .map((el) => ({
      text: norm(el.innerText || el.textContent || ''),
      top: Math.round(el.getBoundingClientRect().top),
      expanded: el.getAttribute('aria-expanded'),
    }))
    .filter((x) => /Seedance 2\.0/i.test(x.text))
    .sort((a, b) => a.top - b.top);
  return {
    ok: true,
    clicked: text,
    optionTop: Math.round(rect.top),
    combos,
  };
})()
