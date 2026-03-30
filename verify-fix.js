import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 验证修复...\n');

let passed = 0;
let failed = 0;

// 1. 检查文件是否存在
console.log('1. 检查新创建的文件:');
const requiredFiles = [
  'src/lib/safe-storage.ts',
  'src/lib/validate-data.ts',
  'src/components/ErrorBoundary.tsx',
  'public/emergency-fix.js',
  'public/clean-cache.html',
  'CRASH_FIX_V2.md',
];

requiredFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    console.log(`  ✅ ${file}`);
    passed++;
  } else {
    console.log(`  ❌ ${file} - 文件不存在`);
    failed++;
  }
});

// 2. 检查 main.tsx 是否导入了 autoCleanupOnStartup
console.log('\n2. 检查 main.tsx 修改:');
const mainPath = path.join(__dirname, 'src/main.tsx');
if (fs.existsSync(mainPath)) {
  const mainContent = fs.readFileSync(mainPath, 'utf8');
  if (mainContent.includes('autoCleanupOnStartup')) {
    console.log('  ✅ main.tsx 已添加自动清理');
    passed++;
  } else {
    console.log('  ❌ main.tsx 未添加自动清理');
    failed++;
  }
} else {
  console.log('  ❌ main.tsx 不存在');
  failed++;
}

// 3. 检查 Workspace.tsx 是否使用了 ErrorBoundary
console.log('\n3. 检查 Workspace.tsx 修改:');
const workspacePath = path.join(__dirname, 'src/pages/Workspace.tsx');
if (fs.existsSync(workspacePath)) {
  const workspaceContent = fs.readFileSync(workspacePath, 'utf8');
  if (workspaceContent.includes('ErrorBoundary')) {
    console.log('  ✅ Workspace.tsx 已添加错误边界');
    passed++;
  } else {
    console.log('  ❌ Workspace.tsx 未添加错误边界');
    failed++;
  }
} else {
  console.log('  ❌ Workspace.tsx 不存在');
  failed++;
}

// 4. 检查 CharacterSettings.tsx 是否使用了安全存储
console.log('\n4. 检查 CharacterSettings.tsx 修改:');
const charSettingsPath = path.join(__dirname, 'src/components/workspace/CharacterSettings.tsx');
if (fs.existsSync(charSettingsPath)) {
  const charSettingsContent = fs.readFileSync(charSettingsPath, 'utf8');
  const checks = [
    { name: 'safeGetLocalStorage', found: charSettingsContent.includes('safeGetLocalStorage') },
    { name: 'validateCharacters', found: charSettingsContent.includes('validateCharacters') },
    { name: 'validateSceneSettings', found: charSettingsContent.includes('validateSceneSettings') },
  ];

  checks.forEach(check => {
    if (check.found) {
      console.log(`  ✅ 使用了 ${check.name}`);
      passed++;
    } else {
      console.log(`  ❌ 未使用 ${check.name}`);
      failed++;
    }
  });
} else {
  console.log('  ❌ CharacterSettings.tsx 不存在');
  failed += 3;
}

// 总结
console.log('\n' + '='.repeat(50));
console.log(`✅ 通过: ${passed}`);
console.log(`❌ 失败: ${failed}`);
console.log('='.repeat(50));

if (failed === 0) {
  console.log('\n🎉 所有修复已正确应用!');
  console.log('\n下一步:');
  console.log('1. 重启应用: npm run electron:dev');
  console.log('2. 打开开发者工具 (F12)');
  console.log('3. 在控制台运行紧急修复脚本');
  console.log('4. 尝试打开角色与场景页面');
} else {
  console.log('\n⚠️ 部分修复未正确应用,请检查上述失败项');
}

process.exit(failed > 0 ? 1 : 0);
