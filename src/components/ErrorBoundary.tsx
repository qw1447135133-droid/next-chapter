import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);

    // 保存错误到 localStorage，即使页面闪退也能查看
    try {
      const crashLog = {
        type: 'ErrorBoundary',
        timestamp: new Date().toISOString(),
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        url: window.location.href
      };

      const existingLogs = JSON.parse(localStorage.getItem('crash-logs') || '[]');
      existingLogs.unshift(crashLog);
      if (existingLogs.length > 50) existingLogs.length = 50;
      localStorage.setItem('crash-logs', JSON.stringify(existingLogs, null, 2));

      console.error('💾 错误已保存到 crash-logs，运行 viewCrashLogs() 查看');
    } catch (e) {
      console.error('无法保存错误日志:', e);
    }

    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    // 清理可能损坏的 localStorage 数据
    try {
      const keysToClean = [
        'char-image-model',
        'char-view-mode',
        'generating-storyboard-tasks',
        'phase1-results',
      ];
      keysToClean.forEach(key => localStorage.removeItem(key));
    } catch (e) {
      console.error("Failed to clean localStorage:", e);
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <CardTitle>页面加载失败</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                角色与场景页面遇到了问题。这可能是由于数据损坏或内存不足导致的。
              </p>
              {this.state.error && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">
                    查看错误详情
                  </summary>
                  <pre className="mt-2 overflow-auto rounded bg-muted p-2">
                    {this.state.error.toString()}
                  </pre>
                </details>
              )}
              <div className="flex gap-2">
                <Button onClick={this.handleReset} className="flex-1">
                  清理缓存并重试
                </Button>
                <Button
                  variant="outline"
                  onClick={() => window.location.reload()}
                  className="flex-1"
                >
                  刷新页面
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
