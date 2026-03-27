/**
 * Browser Automation Controller
 * 用于控制浏览器自动化的主控制器
 */

import { browserAutomationService } from './browser-automation-service';

export interface OperationResult {
  success: boolean;
  error?: string;
  data?: any;
}

type EventCallback = (data: any) => void;

class BrowserAutomationController {
  private instances: Map<string, any> = new Map();
  private currentInstanceId: string | null = null;
  private eventListeners: Map<string, Set<EventCallback>> = new Map();
  private headless: boolean = true;

  constructor(headless: boolean = true) {
    this.headless = headless;
  }

  /**
   * 事件监听
   */
  on(event: string, callback: EventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  /**
   * 移除事件监听
   */
  off(event: string, callback: EventCallback): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * 触发事件
   */
  private emit(event: string, data: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => callback(data));
    }
  }

  /**
   * 获取当前实例ID
   */
  getCurrentInstanceId(): string | null {
    return this.currentInstanceId;
  }

  /**
   * 创建浏览器实例
   */
  async createInstance(url: string): Promise<{ id: string; url: string; status: string }> {
    this.emit('log', `正在启动浏览器实例 (${this.headless ? '无头模式' : '有头模式'})...`);

    // 启动浏览器并同时导航到目标 URL
    const instanceId = await browserAutomationService.launchBrowser(this.headless, url);
    this.currentInstanceId = instanceId;

    this.emit('log', `浏览器实例已创建: ${instanceId}`);
    this.emit('log', `正在导航到 ${url}...`);
    this.emit('log', `成功导航到目标页面`);
    this.instances.set(instanceId, { url, status: 'active' });

    return { id: instanceId, url, status: 'active' };
  }

  /**
   * 导航到指定URL
   */
  async navigate(instanceId: string, url: string): Promise<OperationResult> {
    try {
      this.emit('log', `导航到: ${url}`);
      const success = await browserAutomationService.navigate(instanceId, url);
      return { success };
    } catch (error) {
      this.emit('error', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * 查找元素
   */
  async findElement(instanceId: string, selector: string): Promise<OperationResult> {
    try {
      const exists = await browserAutomationService.waitForElement(instanceId, selector, 1500);
      return { success: exists, data: { selector } };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * 填充输入
   */
  async fillInput(instanceId: string, selector: string, text: string): Promise<OperationResult> {
    try {
      this.emit('log', `填充输入框: ${selector}`);
      const success = await browserAutomationService.fillInput(instanceId, selector, text);
      return { success };
    } catch (error) {
      this.emit('error', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * 点击元素
   */
  async clickElement(instanceId: string, selector: string): Promise<OperationResult> {
    try {
      this.emit('log', `点击元素: ${selector}`);
      const success = await browserAutomationService.clickElement(instanceId, selector);
      return { success };
    } catch (error) {
      this.emit('error', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * 获取标题
   */
  async getTitle(instanceId: string): Promise<OperationResult> {
    try {
      const title = await browserAutomationService.getTitle(instanceId);
      return { success: !!title, data: title };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * 执行脚本
   */
  async executeScript(instanceId: string, script: string): Promise<OperationResult> {
    try {
      const result = await browserAutomationService.executeScript(instanceId, script);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * 获取页面截图
   */
  async getScreenshot(instanceId: string): Promise<OperationResult> {
    try {
      const screenshot = await browserAutomationService.getPageScreenshot(instanceId);
      return { success: !!screenshot, data: screenshot };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * 关闭实例
   */
  async closeInstance(instanceId: string): Promise<OperationResult> {
    try {
      this.emit('log', `正在关闭浏览器实例: ${instanceId}`);
      const result = await browserAutomationService.closeInstance(instanceId);
      this.instances.delete(instanceId);
      if (this.currentInstanceId === instanceId) {
        this.currentInstanceId = null;
      }
      return { success: result };
    } catch (error) {
      this.emit('error', error);
      return { success: false, error: (error as Error).message };
    }
  }
}

export default BrowserAutomationController;