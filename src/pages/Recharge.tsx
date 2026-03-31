import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Wallet, CreditCard, QrCode, CheckCircle2, Clock, XCircle, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  RECHARGE_PACKAGES,
  createRechargeOrder,
  queryOrderStatus,
  getUserBalance,
  getUserOrders,
} from '@/lib/payment-service';
import type { RechargeOrder, UserBalance } from '@/types/payment';

const Recharge = () => {
  const navigate = useNavigate();
  const [selectedPackage, setSelectedPackage] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'alipay' | 'wechat' | 'other'>('alipay');
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<RechargeOrder | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [userBalance, setUserBalance] = useState<UserBalance | null>(null);
  const [rechargeHistory, setRechargeHistory] = useState<RechargeOrder[]>([]);

  // 模拟用户ID（实际应该从登录状态获取）
  const userId = 'user_' + (localStorage.getItem('current_user_id') || '123456');

  useEffect(() => {
    // 保存用户ID
    if (!localStorage.getItem('current_user_id')) {
      localStorage.setItem('current_user_id', '123456');
    }

    // 加载用户余额和充值历史
    loadUserData();
  }, []);

  const loadUserData = () => {
    const balance = getUserBalance(userId);
    setUserBalance(balance);

    const orders = getUserOrders(userId);
    setRechargeHistory(orders);
  };

  const handleRecharge = async () => {
    if (!selectedPackage) {
      toast.error('请选择充值套餐');
      return;
    }

    setIsProcessing(true);

    try {
      const order = await createRechargeOrder(userId, selectedPackage, paymentMethod);
      setCurrentOrder(order);
      setShowPaymentDialog(true);

      // 开始轮询订单状态
      startPollingOrderStatus(order.orderId);
    } catch (error: any) {
      toast.error(error.message || '创建订单失败');
    } finally {
      setIsProcessing(false);
    }
  };

  const startPollingOrderStatus = (orderId: string) => {
    const interval = setInterval(async () => {
      try {
        const order = await queryOrderStatus(orderId);

        if (order.status === 'paid') {
          clearInterval(interval);
          setCurrentOrder(order);
          toast.success('充值成功！');
          loadUserData();

          setTimeout(() => {
            setShowPaymentDialog(false);
            setSelectedPackage('');
          }, 2000);
        } else if (order.status === 'failed') {
          clearInterval(interval);
          setCurrentOrder(order);
          toast.error('支付失败');
        }
      } catch (error) {
        console.error('查询订单状态失败:', error);
      }
    }, 3000); // 每3秒查询一次

    // 30分钟后停止轮询
    setTimeout(() => clearInterval(interval), 30 * 60 * 1000);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-500"><CheckCircle2 className="w-3 h-3 mr-1" />已支付</Badge>;
      case 'pending':
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />待支付</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />失败</Badge>;
      case 'cancelled':
        return <Badge variant="secondary">已取消</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">账户充值</h1>
              <p className="text-muted-foreground mt-1">选择充值套餐，快速充值到账</p>
            </div>
          </div>

          {/* 余额显示 */}
          <Card className="bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Wallet className="w-8 h-8" />
                <div>
                  <p className="text-sm opacity-90">当前余额</p>
                  <p className="text-2xl font-bold">¥{userBalance?.balance.toFixed(2) || '0.00'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左侧：充值套餐 */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>选择充值套餐</CardTitle>
                <CardDescription>
                  支付金额包含平台服务费，实际到账金额见套餐详情
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {RECHARGE_PACKAGES.map((pkg) => (
                    <Card
                      key={pkg.id}
                      className={`cursor-pointer transition-all hover:shadow-lg ${
                        selectedPackage === pkg.id
                          ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950'
                          : ''
                      } ${pkg.isPopular ? 'border-orange-500' : ''}`}
                      onClick={() => setSelectedPackage(pkg.id)}
                    >
                      <CardContent className="p-6">
                        {pkg.isPopular && (
                          <Badge className="mb-2 bg-orange-500">热门推荐</Badge>
                        )}
                        <div className="text-center">
                          <p className="text-3xl font-bold text-blue-600">
                            ¥{pkg.displayAmount}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            支付金额
                          </p>

                          <div className="mt-4 pt-4 border-t">
                            <p className="text-lg font-semibold text-green-600">
                              到账 ¥{pkg.actualAmount}
                              {pkg.bonus && pkg.bonus > 0 && (
                                <span className="text-sm text-orange-500 ml-1">
                                  +¥{pkg.bonus} 赠送
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              平台服务费: ¥{pkg.platformFee}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* 支付方式选择 */}
                <div className="mt-6">
                  <h3 className="text-sm font-medium mb-3">选择支付方式</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <Button
                      variant={paymentMethod === 'alipay' ? 'default' : 'outline'}
                      className="h-auto py-4"
                      onClick={() => setPaymentMethod('alipay')}
                    >
                      <div className="text-center">
                        <CreditCard className="w-6 h-6 mx-auto mb-1" />
                        <p className="text-xs">支付宝</p>
                      </div>
                    </Button>
                    <Button
                      variant={paymentMethod === 'wechat' ? 'default' : 'outline'}
                      className="h-auto py-4"
                      onClick={() => setPaymentMethod('wechat')}
                    >
                      <div className="text-center">
                        <QrCode className="w-6 h-6 mx-auto mb-1" />
                        <p className="text-xs">微信支付</p>
                      </div>
                    </Button>
                    <Button
                      variant={paymentMethod === 'other' ? 'default' : 'outline'}
                      className="h-auto py-4"
                      onClick={() => setPaymentMethod('other')}
                    >
                      <div className="text-center">
                        <Wallet className="w-6 h-6 mx-auto mb-1" />
                        <p className="text-xs">其他方式</p>
                      </div>
                    </Button>
                  </div>
                </div>

                <Button
                  className="w-full mt-6"
                  size="lg"
                  onClick={handleRecharge}
                  disabled={!selectedPackage || isProcessing}
                >
                  {isProcessing ? '处理中...' : '立即充值'}
                </Button>

                <Alert className="mt-4">
                  <AlertDescription className="text-xs">
                    <strong>温馨提示：</strong>
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>充值金额包含平台服务费用，用于维护平台运营</li>
                      <li>充值成功后，实际到账金额将自动添加到您的账户余额</li>
                      <li>订单有效期为30分钟，请及时完成支付</li>
                      <li>如有疑问，请联系客服</li>
                    </ul>
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </div>

          {/* 右侧：充值记录 */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle>充值记录</CardTitle>
                <CardDescription>最近的充值订单</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {rechargeHistory.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">暂无充值记录</p>
                  ) : (
                    rechargeHistory.slice(0, 10).map((order) => (
                      <div
                        key={order.orderId}
                        className="p-3 border rounded-lg hover:bg-accent transition-colors"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-sm font-medium">
                            ¥{order.displayAmount}
                          </span>
                          {getStatusBadge(order.status)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          到账: ¥{order.actualAmount}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(order.createdAt).toLocaleString('zh-CN')}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 统计信息 */}
            {userBalance && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-sm">账户统计</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">累计充值</span>
                    <span className="font-medium">¥{userBalance.totalRecharged.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">累计消费</span>
                    <span className="font-medium">¥{userBalance.totalConsumed.toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* 支付对话框 */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {currentOrder?.status === 'paid' ? '支付成功' : '扫码支付'}
            </DialogTitle>
            <DialogDescription>
              {currentOrder?.status === 'paid'
                ? '充值已到账，感谢您的支持！'
                : '请使用手机扫描二维码完成支付'}
            </DialogDescription>
          </DialogHeader>

          {currentOrder && (
            <div className="space-y-4">
              {currentOrder.status === 'paid' ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
                  <p className="text-lg font-semibold">充值成功！</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    到账金额: ¥{currentOrder.actualAmount}
                  </p>
                </div>
              ) : (
                <>
                  <div className="bg-white p-4 rounded-lg border-2 border-dashed">
                    {currentOrder.qrCode ? (
                      <img
                        src={currentOrder.qrCode}
                        alt="支付二维码"
                        className="w-full max-w-xs mx-auto"
                      />
                    ) : (
                      <div className="w-64 h-64 bg-gray-100 flex items-center justify-center mx-auto">
                        <p className="text-muted-foreground">二维码加载中...</p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">订单号</span>
                      <span className="font-mono">{currentOrder.orderId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">支付金额</span>
                      <span className="font-semibold text-lg">
                        ¥{currentOrder.displayAmount}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">到账金额</span>
                      <span className="text-green-600 font-medium">
                        ¥{currentOrder.actualAmount}
                      </span>
                    </div>
                  </div>

                  <Alert>
                    <Clock className="w-4 h-4" />
                    <AlertDescription className="text-xs">
                      订单将在 30 分钟后自动关闭，请及时完成支付
                    </AlertDescription>
                  </Alert>

                  {currentOrder.paymentUrl && (
                    <Button
                      className="w-full"
                      onClick={() => window.open(currentOrder.paymentUrl, '_blank')}
                    >
                      打开支付页面
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Recharge;
