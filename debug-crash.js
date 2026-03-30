// 诊断脚本 - 检查角色与场景页面闪退问题
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== 诊断开始 ===\n');

// 1. 检查 localStorage 数据
console.log('1. 检查 localStorage 可能的问题数据:');
const possibleKeys = [
  'char-image-model',
  'char-view-mode',
  'custom-art-style-prompt',
  'generating-storyboard-tasks',
  'phase1-results',
  'decompose-meta'
];

console.log('建议清理以下 localStorage 键:');
possibleKeys.forEach(key => console.log(`  - ${key}`));

// 2. 检查组件文件大小
console.log('\n2. 检查组件文件大小:');
const componentsPath = path.join(__dirname, 'src', 'components', 'workspace');
try {
  const files = fs.readdirSync(componentsPath);
  const largeFiles = files
    .filter(f => f.endsWith('.tsx') || f.endsWith('.ts'))
    .map(f => {
      const filePath = path.join(componentsPath, f);
      const stats = fs.statSync(filePath);
      return { name: f, size: stats.size };
    })
    .filter(f => f.size > 50000) // 大于 50KB
    .sort((a, b) => b.size - a.size);

  if (largeFiles.length > 0) {
    console.log('发现大文件 (可能导致性能问题):');
    largeFiles.forEach(f => {
      console.log(`  - ${f.name}: ${(f.size / 1024).toFixed(2)} KB`);
    });
  } else {
    console.log('未发现异常大的文件');
  }
} catch (err) {
  console.log('无法读取组件目录:', err.message);
}

// 3. 检查 package.json 依赖
console.log('\n3. 检查关键依赖版本:');
try {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  const criticalDeps = {
    'react': packageJson.dependencies.react,
    'react-dom': packageJson.dependencies['react-dom'],
    'electron': packageJson.devDependencies.electron,
  };
  Object.entries(criticalDeps).forEach(([name, version]) => {
    console.log(`  - ${name}: ${version}`);
  });
} catch (err) {
  console.log('无法读取 package.json:', err.message);
}

console.log('\n=== 诊断完成 ===\n');
console.log('建议的修复步骤:');
console.log('1. 清理浏览器/Electron 的 localStorage');
console.log('2. 在 CharacterSettings 组件添加错误边界');
console.log('3. 检查控制台错误日志');
console.log('4. 尝试注释掉图片加载相关代码测试');
