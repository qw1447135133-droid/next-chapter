

## 为角色添加多套服装设定功能

### 概述
为角色设定卡片添加"服装变体"功能。每个角色可以有多套服装（如护士装、女仆装），每套服装有独立的描述和参考图。在分镜生成时，根据场景中角色的实际服装选择对应的参考图。

### 数据结构变更

**文件：`src/types/project.ts`**

在 `CharacterSetting` 接口中新增 `costumes` 数组字段：

```text
interface CostumeSetting {
  id: string;
  label: string;          // 如 "护士装"、"女仆装"
  description: string;    // 服装外观描述
  imageUrl?: string;      // 该套服装的参考图
  isAIGenerated: boolean;
  imageHistory?: ImageHistoryEntry[];
}

interface CharacterSetting {
  // ... 现有字段保留
  costumes?: CostumeSetting[];       // 多套服装
  activeCostumeId?: string;          // 当前展示的服装ID
}
```

- `costumes` 为可选数组，向后兼容现有数据
- `activeCostumeId` 标记当前选中展示的服装
- 没有 costumes 的角色行为与现在完全一致

### UI 变更

**文件：`src/components/workspace/CharacterSettings.tsx`**

在每个角色卡片中：

1. **角色名称行右侧**添加"服装管理"入口按钮（衣架图标 + 数量徽章）
2. 点击后展开一个**服装切换区域**，显示所有服装变体的标签页/药丸按钮
3. 每个服装变体包含：
   - 服装标签名（可编辑，如"护士装"）
   - 服装描述（可编辑）
   - 独立的图片上传/AI生成按钮
   - 删除按钮
4. 添加"+ 新增服装"按钮
5. 当角色只有默认服装（无 costumes 或空数组）时，不显示切换区域，行为和现在一致

```text
角色卡片布局示意：

+------------------------------------------+
| [角色名] [自动识别] [服装 (3)] [删除]      |
| [角色描述 textarea]                       |
| [上传人设图] [AI生成三视图]                |
+------------------------------------------+
| 服装切换区（展开时显示）：                  |
| [默认] [护士装] [女仆装] [+ 新增]          |
|                                          |
| 服装标签: [护士装          ]              |
| 服装描述: [白色护士服，戴护士帽...]        |
| [上传服装图] [AI生成服装图]                |
| [当前服装参考图]                           |
+------------------------------------------+
| [角色主参考图 - 三视图]                    |
+------------------------------------------+
```

### 分镜生成集成

**文件：`src/pages/Workspace.tsx`**

修改 `handleGenerateSceneStoryboard` 中构建 `characterImages` 的逻辑：

- 遍历场景中的角色时，检查该场景的描述/对白中是否提及某套服装关键词
- 如果角色有 costumes 且场景匹配到特定服装，优先使用该服装的 `imageUrl`
- 否则使用角色默认的 `imageUrl`（主参考图/三视图）

### 场景级服装指定

**文件：`src/types/project.ts` - Scene 接口**

在 Scene 中新增可选字段：

```text
interface Scene {
  // ... 现有字段
  characterCostumes?: Record<string, string>;  // { 角色名: costumeId }
}
```

这允许在分镜列表中为每个场景手动指定角色的服装变体。

### 实现步骤

1. 更新 `src/types/project.ts`：添加 `CostumeSetting` 接口和相关字段
2. 更新 `src/components/workspace/CharacterSettings.tsx`：
   - 添加服装管理 UI（展开/折叠区域、服装标签页切换、CRUD 操作）
   - 为每套服装复用现有的图片上传和 AI 生成逻辑
3. 更新 `src/pages/Workspace.tsx`：分镜生成时根据服装选择传递对应参考图
4. 数据持久化：costumes 数据随 CharacterSetting 一起存入项目 JSON，无需数据库 schema 变更

### 兼容性

- 现有项目数据中 `costumes` 为 undefined，完全向后兼容
- 没有服装变体的角色界面和行为不变

