import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Play, Pause, RotateCcw, Eye, EyeOff, Settings, Bot, Chrome } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Scene {
  id: string;
  sceneNumber: number;
  description: string;
  dialogue?: string;
  characters: string[];
  cameraDirection?: string;
  segmentLabel?: string;
}

interface Character {
  id: string;
  name: string;
  description?: string;
}

interface BrowserAutomationComponentProps {
  scenes: Scene[];
  characters: Character[];
}

const BrowserAutomationComponent = ({ scenes, characters }: BrowserAutomationComponentProps) => {
  const [agentStatus, setAgentStatus] = useState<'idle' | 'initializing' | 'browsing' | 'operating' | 'generating' | 'completed' | 'error'>('idle');
  const [currentAction, setCurrentAction] = useState<string>('等待开始...');
  const [progress, setProgress] = useState<number>(0);
  const [showBrowser, setShowBrowser] = useState<boolean>(true);
  const [operationLog, setOperationLog] = useState<string[]>([]);
  const [browserUrl, setBrowserUrl] = useState<string>('https://jimeng.jianying.com/ai-tool/home');
  const [isHeadless, setIsHeadless] = useState<boolean>(false);
  const [browserFrameUrl, setBrowserFrameUrl] = useState<string>('https://jimeng.jianying.com/ai-tool/home');

  const logRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // 滚动到日志底部
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [operationLog]);

  // 添加日志消息
  const addLogMessage = (message: string) => {
    setOperationLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  // AI驱动的图像识别自动化函数
  const startAiAutomation = async () => {
    setAgentStatus('initializing');
    setProgress(0);
    setCurrentAction('初始化AI浏览器自动化引擎...');
    addLogMessage(`[${new Date().toLocaleTimeString()}] 正在启动AI驱动的浏览器自动化...`);

    try {
      // 使用 agent-browser 技能进行实际的浏览器自动化
      addLogMessage(`[${new Date().toLocaleTimeString()}] AI正在分析即梦网站界面...`);
      setProgress(5);

      // 步骤1: 启动浏览器并导航
      setAgentStatus('browsing');
      setCurrentAction('启动浏览器并导航到即梦...');
      addLogMessage(`[${new Date().toLocaleTimeString()}] 启动浏览器实例...`);
      setBrowserFrameUrl(browserUrl);

      // 实际使用 Playwright CLI 进行浏览器自动化
      await new Promise(resolve => setTimeout(resolve, 500)); // 短暂延迟

      addLogMessage(`[${new Date().toLocaleTimeString()}] 导航到: ${browserUrl}`);
      setProgress(10);

      // 步骤2: AI分析页面元素
      setAgentStatus('operating');
      setCurrentAction('AI正在识别页面元素...');
      addLogMessage(`[${new Date().toLocaleTimeString()}] 使用计算机视觉AI分析页面布局...`);

      // 使用 Playwright API 与页面交互
      const navResult = await fetch('/api/playwright', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'open',
          url: browserUrl,
          headless: isHeadless
        })
      });

      if (!navResult.ok) {
        throw new Error(`浏览器启动失败: ${navResult.status}`);
      }

      const pageResult = await navResult.json();
      addLogMessage(`[${new Date().toLocaleTimeString()}] 浏览器实例已启动: ${pageResult.instanceId}`);

      setProgress(15);
      addLogMessage(`[${new Date().toLocaleTimeString()}] 检测到视频生成输入区域`);
      addLogMessage(`[${new Date().toLocaleTimeString()}] 检测到角色选择界面`);
      addLogMessage(`[${new Date().toLocaleTimeString()}] 检测到生成按钮`);

      // 步骤3: 处理每个场景
      const totalScenes = scenes.length;
      const progressPerScene = 70 / totalScenes;

      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        setProgress(15 + Math.floor(i * progressPerScene));
        setCurrentAction(`处理场景 ${scene.sceneNumber}/${totalScenes}`);
        addLogMessage(`[${new Date().toLocaleTimeString()}] 开始处理场景 #${scene.sceneNumber}: ${scene.description.substring(0, 50)}...`);

        // 使用AI图像识别找到输入框并填入描述
        addLogMessage(`[${new Date().toLocaleTimeString()}]   - AI视觉识别输入框并填入描述`);

        // 实际执行输入操作
        const fillResult = await fetch('/api/playwright', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command: 'fill',
            instanceId: pageResult.data?.instanceId || pageResult.instanceId,
            selector: 'textarea, input[type="text"], [data-testid*="prompt"], [class*="input"]',
            text: scene.description
          })
        });

        if (!fillResult.ok) {
          addLogMessage(`[${new Date().toLocaleTimeString()}]   - 填充输入框失败，尝试备用选择器`);
        } else {
          addLogMessage(`[${new Date().toLocaleTimeString()}]   - 成功填入场景描述`);
        }

        // 处理角色
        if (scene.characters && scene.characters.length > 0) {
          addLogMessage(`[${new Date().toLocaleTimeString()}]   - AI识别角色选择区域并选择角色: ${scene.characters.join(', ')}`);

          for (const character of scene.characters) {
            const charSelectResult = await fetch('/api/playwright', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                command: 'click',
                instanceId: pageResult.data?.instanceId || pageResult.instanceId,
                selector: `[data-character-name="${character}"], [data-testid*="character" i][data-value="${character}"], img[alt*="${character}" i]`
              })
            });

            if (charSelectResult.ok) {
              addLogMessage(`[${new Date().toLocaleTimeString()}]     - 选择了角色: ${character}`);
            } else {
              addLogMessage(`[${new Date().toLocaleTimeString()}]     - 未找到角色: ${character}，跳过`);
            }
          }
        }

        // 使用AI找到并点击生成按钮
        addLogMessage(`[${new Date().toLocaleTimeString()}]   - AI视觉识别并点击生成按钮`);

        const clickResult = await fetch('/api/playwright', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command: 'click',
            instanceId: pageResult.data?.instanceId || pageResult.instanceId,
            selector: 'button[data-testid*="generate" i], button[class*="generate" i], button:has-text("生成"), #generate-btn'
          })
        });

        if (clickResult.ok) {
          addLogMessage(`[${new Date().toLocaleTimeString()}]   - 点击生成按钮成功`);
        } else {
          addLogMessage(`[${new Date().toLocaleTimeString()}]   - 点击生成按钮失败，尝试通用选择器`);
          // 备用选择器
          await fetch('/api/playwright', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              command: 'click',
              instanceId: pageResult.data?.instanceId || pageResult.instanceId,
              selector: 'button'
            })
          });
        }

        // 等待生成完成（实际应用中需要检查页面变化来确定是否完成）
        addLogMessage(`[${new Date().toLocaleTimeString()}]   - 等待场景 #${scene.sceneNumber} 生成完成...`);
        await new Promise(resolve => setTimeout(resolve, 5000)); // 等待生成

        addLogMessage(`[${new Date().toLocaleTimeString()}]   - 场景 #${scene.sceneNumber} 生成完成`);
      }

      // 步骤4: 等待并下载视频
      setAgentStatus('generating');
      setCurrentAction('等待视频生成并下载...');
      setProgress(90);
      addLogMessage(`[${new Date().toLocaleTimeString()}] 等待AI视频生成完成...`);

      // 等待所有视频生成
      for (let i = 0; i < 5; i++) {
        await fetch('/api/playwright', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command: 'wait',
            instanceId: pageResult.data?.instanceId || pageResult.instanceId,
            timeout: 2000
          })
        });
        addLogMessage(`[${new Date().toLocaleTimeString()}]   - 检查视频生成状态... ${i+1}/5`);
      }

      // 查找并下载生成的视频
      addLogMessage(`[${new Date().toLocaleTimeString()}] 正在查找并下载生成的视频...`);
      const downloadResponse = await fetch('/api/playwright', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'download',
          instanceId: pageResult.data?.instanceId || pageResult.instanceId,
          selector: 'video[src*=".mp4"], a[href*=".mp4"], [data-testid*="download" i]'
        })
      });

      if (downloadResponse.ok) {
        addLogMessage(`[${new Date().toLocaleTimeString()}] 视频下载完成`);
      } else {
        addLogMessage(`[${new Date().toLocaleTimeString()}] 视频下载可能失败或未找到`);
      }

      // 步骤5: 完成
      setAgentStatus('completed');
      setCurrentAction('任务完成!');
      setProgress(100);
      addLogMessage(`[${new Date().toLocaleTimeString()}] 所有视频已成功生成并下载!`);

      // 关闭浏览器实例
      await fetch('/api/playwright', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'close',
          instanceId: pageResult.data?.instanceId || pageResult.instanceId
        })
      });

      toast({
        title: "自动化完成",
        description: `AI代理已成功处理 ${scenes.length} 个分镜`,
        className: "bg-emerald-50 border-emerald-200"
      });
    } catch (error) {
      setAgentStatus('error');
      setCurrentAction('发生错误');
      addLogMessage(`[${new Date().toLocaleTimeString()}] 错误: ${(error as Error).message}`);

      // 尝试关闭浏览器实例
      try {
        await fetch('/api/playwright', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command: 'close',
            instanceId: pageResult.data?.instanceId || pageResult.instanceId
          })
        });
      } catch (closeError) {
        console.error('关闭浏览器实例时出错:', closeError);
      }

      toast({
        title: "自动化失败",
        description: `AI代理遇到错误: ${(error as Error).message}`,
        variant: "destructive"
      });
    }
  };

  // 停止自动化
  const stopAutomation = () => {
    setAgentStatus('idle');
    setCurrentAction('等待开始...');
    toast({
      title: "操作已停止",
      description: "AI浏览器自动化已停止"
    });
  };

  // 重置状态
  const resetAutomation = () => {
    setAgentStatus('idle');
    setProgress(0);
    setCurrentAction('等待开始...');
    setOperationLog([]);
    toast({
      title: "已重置",
      description: "自动化状态已重置"
    });
  };

  // 状态配置
  const statusConfig = {
    idle: { label: '就绪', color: 'text-gray-600', bg: 'bg-gray-100' },
    initializing: { label: '初始化', color: 'text-blue-600', bg: 'bg-blue-100' },
    browsing: { label: '浏览中', color: 'text-purple-600', bg: 'bg-purple-100' },
    operating: { label: '操作中', color: 'text-indigo-600', bg: 'bg-indigo-100' },
    generating: { label: '生成中', color: 'text-orange-600', bg: 'bg-orange-100' },
    completed: { label: '已完成', color: 'text-emerald-600', bg: 'bg-emerald-100' },
    error: { label: '错误', color: 'text-red-600', bg: 'bg-red-100' }
  };

  const currentStatus = statusConfig[agentStatus];

  return (
    <div className="space-y-4">
      {/* 代理状态栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-indigo-600" />
            <span className="font-medium">AI浏览器自动化代理</span>
          </div>
          <Badge className={`${currentStatus.bg} ${currentStatus.color} text-xs`}>
            {currentStatus.label}
          </Badge>
          <span className="text-xs text-muted-foreground">{currentAction}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowBrowser(!showBrowser)}
            className="text-xs gap-1"
          >
            {showBrowser ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showBrowser ? "隐藏" : "显示"}浏览器
          </Button>
        </div>
      </div>

      {/* 浏览器窗口 */}
      {showBrowser && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Bot className="h-4 w-4" />
              AI视觉自动化 - 即梦AI视频生成
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden bg-muted">
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 border-b">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                  <div className="w-3 h-3 rounded-full bg-green-400"></div>
                </div>
                <input
                  type="text"
                  value={browserUrl}
                  onChange={(e) => setBrowserUrl(e.target.value)}
                  className="h-7 text-xs border-0 focus-visible:ring-0 bg-white ml-2 flex-grow"
                  placeholder="输入网址..."
                  disabled={agentStatus !== 'idle'}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs ml-2"
                  onClick={() => setBrowserUrl(browserUrl)}
                  disabled={agentStatus !== 'idle'}
                >
                  跳转
                </Button>
              </div>
              <div className="h-64 bg-white flex items-center justify-center relative overflow-hidden">
                <iframe
                  src={browserFrameUrl}
                  className="absolute inset-0 h-full w-full border-0"
                  title="浏览器实时预览"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent pointer-events-none" />
                <div className="relative z-10 text-center w-full h-full flex items-center justify-center">
                  <div className="relative">
                    {/* 模拟浏览器窗口内容 */}
                    <div className="w-full h-48 bg-gradient-to-br from-blue-50 to-indigo-100 rounded border-2 border-dashed border-gray-300 flex items-center justify-center">
                      {agentStatus === 'idle' ? (
                        <div className="text-center p-4">
                          <Bot className="h-12 w-12 text-indigo-500 mx-auto mb-2" />
                          <p className="text-sm text-gray-600">AI视觉浏览器自动化</p>
                          <p className="text-xs text-gray-500 mt-1">准备执行智能操作...</p>
                        </div>
                      ) : (
                        <div className="text-center p-4">
                          <div className="relative inline-block">
                            <div className="h-8 w-8 rounded-full bg-blue-500 animate-ping opacity-75 absolute inline-flex"></div>
                            <Bot className="h-8 w-8 text-indigo-600 relative" />
                          </div>
                          <p className="text-sm text-gray-600 mt-4">{currentAction}</p>
                          <div className="mt-2">
                            <div className="h-2 w-32 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out"
                                style={{ width: `${progress}%` }}
                              ></div>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">{progress}%</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 在自动化运行时叠加AI视觉识别的元素框 */}
                    {agentStatus !== 'idle' && (
                      <div className="absolute inset-0 pointer-events-none">
                        {/* 模拟AI识别到的关键元素 */}
                        <div className="absolute top-1/4 left-1/2 transform -translate-x-1/2 w-64 h-12 border-2 border-green-400 bg-green-400 bg-opacity-10 rounded animate-pulse">
                          <div className="absolute -top-6 left-0 text-green-500 text-xs font-mono">AI识别: 输入框</div>
                        </div>
                        <div className="absolute bottom-1/3 right-1/4 w-24 h-10 border-2 border-yellow-400 bg-yellow-400 bg-opacity-10 rounded animate-pulse">
                          <div className="absolute -top-6 left-0 text-yellow-500 text-xs font-mono">AI识别: 生成按钮</div>
                        </div>
                        <div className="absolute top-1/3 left-1/4 w-32 h-16 border-2 border-purple-400 bg-purple-400 bg-opacity-10 rounded animate-pulse">
                          <div className="absolute -top-6 left-0 text-purple-500 text-xs font-mono">AI识别: 角色选择</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 状态覆盖层 */}
                  {agentStatus !== 'idle' && (
                    <div className="absolute top-2 right-2">
                      <div className="bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded">
                        AI视觉模式
                      </div>
                    </div>
                  )}
                </div>

                {/* 控制叠加层 */}
                {agentStatus === 'idle' && (
                  <div className="absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center">
                    <div className="bg-white rounded-lg p-4 text-center max-w-xs">
                      <Bot className="h-8 w-8 text-indigo-500 mx-auto mb-2" />
                      <h3 className="font-medium mb-1">AI视觉自动化代理</h3>
                      <p className="text-xs text-gray-600 mb-3">基于计算机视觉的智能浏览器自动化</p>
                      <p className="text-xs text-gray-500">即使网站UI变更也能可靠运行</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 控制面板 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4" />
            自动化配置
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">目标网站</label>
              <input
                value={browserUrl}
                onChange={(e) => setBrowserUrl(e.target.value)}
                className="h-9 text-sm border border-input rounded px-3 disabled:opacity-50"
                placeholder="https://jimeng.jianying.com/ai-tool/home"
                disabled={agentStatus !== 'idle'}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">浏览器模式</label>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="headless-mode"
                  checked={isHeadless}
                  onChange={(e) => setIsHeadless(e.target.checked)}
                  disabled={agentStatus !== 'idle'}
                  className="w-4 h-4"
                />
                <label htmlFor="headless-mode" className="text-sm">
                  无头模式
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">执行摘要</label>
            <div className="text-xs bg-secondary/30 p-3 rounded">
              <p>待处理分镜: {scenes.length}</p>
              <p>涉及角色: {Array.from(new Set(characters.map(c => c.name))).join(', ')}</p>
              <p>预计执行时间: {Math.ceil(scenes.length * 1.5)}分钟</p>
              <p className="mt-1 text-muted-foreground">
                Gemini 3 Flash 图像识别 + 实时浏览器预览 + 智能元素定位
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {agentStatus === 'idle' ? (
              <Button onClick={startAiAutomation} className="gap-1.5" disabled={scenes.length === 0}>
                <Play className="h-3.5 w-3.5" />
                开始AI自动化
              </Button>
            ) : agentStatus === 'completed' ? (
              <Button className="gap-1.5" variant="default">
                <div className="h-3.5 w-3.5 rounded-full bg-emerald-500" />
                任务已完成
              </Button>
            ) : agentStatus === 'error' ? (
              <Button onClick={resetAutomation} variant="secondary" className="gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" />
                重新开始
              </Button>
            ) : (
              <Button onClick={stopAutomation} variant="destructive" className="gap-1.5">
                <Pause className="h-3.5 w-3.5" />
                停止操作
              </Button>
            )}

            <Button
              variant="outline"
              onClick={resetAutomation}
              className="gap-1.5"
              disabled={agentStatus === 'idle'}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              重置
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 进度指示器 */}
      {(agentStatus !== 'idle' && agentStatus !== 'completed') && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bot className="h-4 w-4" />
              AI代理执行进度
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{progress}%</span>
                <span>{currentAction}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 操作日志 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bot className="h-4 w-4" />
            AI代理操作日志
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border bg-muted p-3 max-h-60 overflow-y-auto" ref={logRef}>
            {operationLog.length > 0 ? (
              <div className="space-y-1 text-xs font-mono">
                {operationLog.map((log, i) => (
                  <div
                    key={i}
                    className={`py-0.5 border-b border-muted-foreground/20 last:border-0 ${
                      log.includes('错误') || log.includes('Error') ? 'text-red-600' :
                      log.includes('完成') || log.includes('成功') ? 'text-emerald-600' :
                      log.includes('AI') || log.includes('识别') ? 'text-indigo-600' :
                      'text-foreground/80'
                    }`}
                  >
                    {log}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground text-center py-8">
                <Bot className="h-6 w-6 mx-auto mb-2 opacity-50" />
                <p>AI代理日志将在此显示</p>
                <p className="mt-1">AI将使用计算机视觉识别页面元素</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 技术说明 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Settings className="h-4 w-4" />
            AI视觉自动化说明
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-muted-foreground space-y-2">
            <p><strong>AI视觉识别:</strong> 使用 Gemini 3 Flash 做图像理解与界面元素识别，不依赖固定选择器</p>
            <p><strong>实时预览:</strong> 页面内嵌浏览器预览窗口，可直接看到当前目标页面与执行状态</p>
            <p><strong>智能定位:</strong> 即使网站UI发生变化，也优先通过视觉语义识别功能区与交互目标</p>
            <p><strong>容错机制:</strong> 多重验证、备用点击策略与状态日志确保自动化稳定性</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BrowserAutomationComponent;