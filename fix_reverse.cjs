const fs = require('fs');
const file = 'src/components/workspace/ReverseBrowserViewPanel.tsx';
let content = fs.readFileSync(file, 'utf8');

const oldStr = `      const excludedControlIds = new Set<number>();

      for (let attempt = 1; attempt <= 10; attempt += 1) {
        ensureNotStopped();

        await executeNamed("关闭干扰弹窗", buildDismissInterferingOverlaysScript()).catch(() => null);
        const observation = await captureJimengAgentObservation(targets);
        appendLog(
          \`片段 \${segmentKey} 视觉观察 \${attempt}: \${
            observation.targetMatched ? "已就绪" : "未就绪"
          } / 命中=\${formatSignals(observation.matchedSignals)}\`,
        );

        if (observation.targetMatched) {
          return observation;
        }`;

const newStr = `      const excludedControlIds = new Set<number>();
      let clickedLeftGenerate = false;

      for (let attempt = 1; attempt <= 10; attempt += 1) {
        ensureNotStopped();

        await executeNamed("关闭干扰弹窗", buildDismissInterferingOverlaysScript()).catch(() => null);
        const observation = await captureJimengAgentObservation(targets);
        
        if (!clickedLeftGenerate) {
          clickedLeftGenerate = true;
          const leftGenerateBtn = observation.controls.find((c) => c.x < 160 && /^生成$/.test(c.text));
          if (leftGenerateBtn) {
            appendLog(\`片段 \${segmentKey} 视觉执行 \${attempt}: 强制先点击左侧生成入口 / #\${leftGenerateBtn.id}\`);
            const result = await executeJimengAgentAction(
              { action: "click_control", controlId: leftGenerateBtn.id, reason: "强制先点击左侧生成入口" },
              observation.controls,
            );
            appendLog(\`片段 \${segmentKey} 执行反馈 \${attempt}: \${result.message}\`);
            await sleep(1500); // 增加等待时间以确保页面加载
            continue;
          }
        }

        appendLog(
          \`片段 \${segmentKey} 视觉观察 \${attempt}: \${
            observation.targetMatched ? "已就绪" : "未就绪"
          } / 命中=\${formatSignals(observation.matchedSignals)}\`,
        );

        if (observation.targetMatched) {
          return observation;
        }`;

if (content.includes(oldStr)) {
  content = content.replace(oldStr, newStr);
  fs.writeFileSync(file, content);
  console.log("Success");
} else {
  console.log("Old string not found.");
}
