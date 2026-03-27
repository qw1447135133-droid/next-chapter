/**
 * Browser Automation Service
 * 用于与 Playwright API 进行交互的服务类
 *
 * 注意：此服务需要 Python FastAPI 后端运行在 localhost:8000
 * 通过 Electron IPC 可以获取 API 地址
 */

declare global {
  interface Window {
    electronAPI?: {
      browserView?: {
        create: (params: { url?: string }) => Promise<{ ok: boolean; id: string }>;
        navigate: (url: string) => Promise<{ ok: boolean }>;
        execute: <T>(params: { script: string; args?: unknown[] }) => Promise<{ ok: boolean; result?: T; error?: string }>;
        close: () => Promise<{ ok: boolean }>;
      };
      jimeng?: unknown;
    };
  }
}

const getApiBase = (): string => {
  // 在 Electron 环境中，通过 window.electronAPI 获取
  if (typeof window !== 'undefined' && (window as any).electronAPI?.jimeng) {
    // 默认使用 localhost:8000，实际应该从 getApiBase() 获取
    return 'http://localhost:8000';
  }
  return 'http://localhost:8000';
};

class BrowserAutomationService {
  private isEmbeddedBrowserAvailable(): boolean {
    return typeof window !== 'undefined' && !!window.electronAPI?.browserView;
  }

  private async runEmbeddedScript<T>(script: string, args: unknown[] = []): Promise<T | null> {
    const browserView = window.electronAPI?.browserView;
    if (!browserView) return null;
    const response = await browserView.execute<T>({ script, args });
    if (!response.ok) {
      throw new Error(response.error || '嵌入浏览器执行失败');
    }
    return response.result ?? null;
  }

  /**
   * 启动浏览器实例
   */
  async launchBrowser(headless: boolean = true, url?: string): Promise<string> {
    if (this.isEmbeddedBrowserAvailable()) {
      const result = await window.electronAPI!.browserView!.create({ url });
      if (!result.ok) {
        throw new Error('启动嵌入浏览器失败');
      }
      return result.id;
    }

    try {
      const response = await fetch(`${getApiBase()}/api/playwright`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'open',
          headless,
          url
        })
      });

      const result = await response.json();
      if (result.success && result.data?.instanceId) {
        return result.data.instanceId;
      }
      throw new Error(result.error || '启动浏览器失败');
    } catch (error) {
      console.error('启动浏览器失败:', error);
      throw error;
    }
  }

  /**
   * 导航到指定URL
   */
  async navigate(instanceId: string, url: string): Promise<boolean> {
    if (this.isEmbeddedBrowserAvailable()) {
      const result = await window.electronAPI!.browserView!.navigate(url);
      return !!result.ok;
    }

    try {
      const response = await fetch(`${getApiBase()}/api/playwright`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'navigate',
          instanceId,
          url
        })
      });

      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('导航失败:', error);
      return false;
    }
  }

  /**
   * 在输入框中填入文本
   */
  async fillInput(instanceId: string, selector: string, text: string): Promise<boolean> {
    if (this.isEmbeddedBrowserAvailable()) {
      const result = await this.runEmbeddedScript<boolean>(
        `(...args) => {
          const [selector, text] = args;
          const element = document.querySelector(selector);
          if (!(element instanceof HTMLElement)) return false;
          if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
            element.focus();
            element.value = text;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
          if (element.isContentEditable) {
            element.focus();
            element.textContent = text;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
          }
          return false;
        }`,
        [selector, text],
      );
      return !!result;
    }

    try {
      const response = await fetch(`${getApiBase()}/api/playwright`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'fill',
          instanceId,
          selector,
          text
        })
      });

      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('填入文本失败:', error);
      return false;
    }
  }

  /**
   * 点击页面元素
   */
  async clickElement(instanceId: string, selector: string): Promise<boolean> {
    if (this.isEmbeddedBrowserAvailable()) {
      const result = await this.runEmbeddedScript<boolean>(
        `(...args) => {
          const [selector] = args;
          const element = document.querySelector(selector);
          if (!(element instanceof HTMLElement)) return false;
          element.click();
          return true;
        }`,
        [selector],
      );
      return !!result;
    }

    try {
      const response = await fetch(`${getApiBase()}/api/playwright`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'click',
          instanceId,
          selector
        })
      });

      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('点击元素失败:', error);
      return false;
    }
  }

  /**
   * 获取页面标题
   */
  async getTitle(instanceId: string): Promise<string | null> {
    if (this.isEmbeddedBrowserAvailable()) {
      return this.runEmbeddedScript<string>(`() => document.title`);
    }

    try {
      const response = await fetch(`${getApiBase()}/api/playwright`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'getTitle',
          instanceId
        })
      });

      const result = await response.json();
      return result.success ? result.data?.title : null;
    } catch (error) {
      console.error('获取标题失败:', error);
      return null;
    }
  }

  /**
   * 获取页面截图
   */
  async getPageScreenshot(instanceId: string): Promise<string | null> {
    if (this.isEmbeddedBrowserAvailable()) {
      return null;
    }

    try {
      const response = await fetch(`${getApiBase()}/api/playwright`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'getScreenshot',
          instanceId
        })
      });

      const result = await response.json();
      return result.success ? result.data?.screenshot : null;
    } catch (error) {
      console.error('获取截图失败:', error);
      return null;
    }
  }

  /**
   * 等待指定的时间
   */
  async waitForTimeout(instanceId: string, milliseconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
  }

  /**
   * 获取页面内容
   */
  async getPageContent(instanceId: string): Promise<string | null> {
    if (this.isEmbeddedBrowserAvailable()) {
      return this.runEmbeddedScript<string>(`() => document.documentElement.outerHTML`);
    }

    try {
      const response = await fetch(`${getApiBase()}/api/playwright`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'getContent',
          instanceId
        })
      });

      const result = await response.json();
      return result.success ? result.data?.content : null;
    } catch (error) {
      console.error('获取页面内容失败:', error);
      return null;
    }
  }

  /**
   * 执行自定义 JavaScript
   */
  async executeScript<T>(instanceId: string, script: string): Promise<T | null> {
    if (this.isEmbeddedBrowserAvailable()) {
      return this.runEmbeddedScript<T>(script);
    }

    try {
      const response = await fetch(`${getApiBase()}/api/playwright`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'executeScript',
          instanceId,
          script
        })
      });

      const result = await response.json();
      return result.success ? result.data?.result as T : null;
    } catch (error) {
      console.error('执行脚本失败:', error);
      return null;
    }
  }

  /**
   * 等待元素出现
   */
  async waitForElement(instanceId: string, selector: string, timeout: number = 10000): Promise<boolean> {
    if (this.isEmbeddedBrowserAvailable()) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const exists = await this.runEmbeddedScript<boolean>(
          `(...args) => !!document.querySelector(args[0])`,
          [selector],
        );
        if (exists) return true;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      return false;
    }

    try {
      const response = await fetch(`${getApiBase()}/api/playwright`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'waitForElement',
          instanceId,
          selector,
          timeout
        })
      });

      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('等待元素失败:', error);
      return false;
    }
  }

  /**
   * 关闭浏览器实例
   */
  async closeInstance(instanceId: string): Promise<boolean> {
    if (this.isEmbeddedBrowserAvailable()) {
      const result = await window.electronAPI!.browserView!.close();
      return !!result.ok;
    }

    try {
      const response = await fetch(`${getApiBase()}/api/playwright`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'close',
          instanceId
        })
      });

      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('关闭实例失败:', error);
      return false;
    }
  }
}

// 创建全局单例
export const browserAutomationService = new BrowserAutomationService();