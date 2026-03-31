import { RechargeOrder, PaymentConfig, RechargePackage } from '@/types/payment';

// 支付配置（请替换为你的实际配置）
const PAYMENT_CONFIG: PaymentConfig = {
  apiUrl: import.meta.env.VITE_PAYMENT_API_URL || 'https://your-payment-gateway.com/api',
  merchantId: import.meta.env.VITE_MERCHANT_ID || 'your_merchant_id',
  apiKey: import.meta.env.VITE_PAYMENT_API_KEY || 'your_api_key',
  notifyUrl: import.meta.env.VITE_PAYMENT_NOTIFY_URL || 'https://your-domain.com/api/payment/notify',
};

// 预设充值套餐
export const RECHARGE_PACKAGES: RechargePackage[] = [
  {
    id: 'package_1',
    displayAmount: 8.4,
    actualAmount: 1.4,
    platformFee: 7.0,
  },
  {
    id: 'package_2',
    displayAmount: 16.8,
    actualAmount: 2.8,
    platformFee: 14.0,
    isPopular: true,
  },
  {
    id: 'package_3',
    displayAmount: 42.0,
    actualAmount: 7.0,
    platformFee: 35.0,
    bonus: 0.5,
  },
  {
    id: 'package_4',
    displayAmount: 84.0,
    actualAmount: 14.0,
    platformFee: 70.0,
    bonus: 1.5,
  },
  {
    id: 'package_5',
    displayAmount: 168.0,
    actualAmount: 28.0,
    platformFee: 140.0,
    bonus: 5.0,
  },
];

// 生成订单ID
function generateOrderId(): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `ORD${timestamp}${random}`;
}

// 生成签名（根据你使用的支付平台调整）
function generateSignature(params: Record<string, any>): string {
  const sortedKeys = Object.keys(params).sort();
  const signString = sortedKeys
    .map(key => `${key}=${params[key]}`)
    .join('&') + `&key=${PAYMENT_CONFIG.apiKey}`;

  // 这里使用简单的示例，实际应该使用MD5或其他加密算法
  // 在生产环境中，签名应该在后端生成
  return btoa(signString);
}

// 创建充值订单
export async function createRechargeOrder(
  userId: string,
  packageId: string,
  paymentMethod: 'alipay' | 'wechat' | 'other'
): Promise<RechargeOrder> {
  const rechargePackage = RECHARGE_PACKAGES.find(p => p.id === packageId);

  if (!rechargePackage) {
    throw new Error('充值套餐不存在');
  }

  const orderId = generateOrderId();
  const now = new Date();
  const expiredAt = new Date(now.getTime() + 30 * 60 * 1000); // 30分钟过期

  const order: RechargeOrder = {
    orderId,
    userId,
    packageId,
    displayAmount: rechargePackage.displayAmount,
    actualAmount: rechargePackage.actualAmount + (rechargePackage.bonus || 0),
    platformFee: rechargePackage.platformFee,
    status: 'pending',
    paymentMethod,
    createdAt: now.toISOString(),
    expiredAt: expiredAt.toISOString(),
  };

  // 保存订单到本地存储（实际应该保存到后端数据库）
  saveOrderToLocal(order);

  // 调用第三方支付接口
  try {
    const paymentResult = await requestPayment(order);
    order.paymentUrl = paymentResult.paymentUrl;
    order.qrCode = paymentResult.qrCode;

    // 更新订单
    saveOrderToLocal(order);
  } catch (error) {
    console.error('创建支付订单失败:', error);
    throw new Error('创建支付订单失败，请稍后重试');
  }

  return order;
}

// 请求支付接口
async function requestPayment(order: RechargeOrder): Promise<{ paymentUrl: string; qrCode: string }> {
  const params = {
    merchant_id: PAYMENT_CONFIG.merchantId,
    order_id: order.orderId,
    amount: order.displayAmount,
    notify_url: PAYMENT_CONFIG.notifyUrl,
    return_url: `${window.location.origin}/recharge/result`,
    payment_method: order.paymentMethod,
    timestamp: Date.now(),
  };

  const signature = generateSignature(params);

  // 这里是示例代码，实际需要根据你使用的支付平台调整
  const response = await fetch(`${PAYMENT_CONFIG.apiUrl}/create_order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...params,
      sign: signature,
    }),
  });

  if (!response.ok) {
    throw new Error('支付接口请求失败');
  }

  const result = await response.json();

  return {
    paymentUrl: result.payment_url || result.payUrl,
    qrCode: result.qr_code || result.qrCode,
  };
}

// 查询订单状态
export async function queryOrderStatus(orderId: string): Promise<RechargeOrder> {
  // 先从本地获取
  const localOrder = getOrderFromLocal(orderId);

  if (!localOrder) {
    throw new Error('订单不存在');
  }

  // 如果订单已完成或失败，直接返回
  if (localOrder.status === 'paid' || localOrder.status === 'failed') {
    return localOrder;
  }

  // 查询支付平台订单状态
  try {
    const params = {
      merchant_id: PAYMENT_CONFIG.merchantId,
      order_id: orderId,
      timestamp: Date.now(),
    };

    const signature = generateSignature(params);

    const response = await fetch(`${PAYMENT_CONFIG.apiUrl}/query_order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...params,
        sign: signature,
      }),
    });

    if (response.ok) {
      const result = await response.json();

      if (result.status === 'paid' || result.status === 'success') {
        localOrder.status = 'paid';
        localOrder.paidAt = new Date().toISOString();
        saveOrderToLocal(localOrder);

        // 更新用户余额
        await updateUserBalance(localOrder.userId, localOrder.actualAmount);
      }
    }
  } catch (error) {
    console.error('查询订单状态失败:', error);
  }

  return localOrder;
}

// 本地存储操作
function saveOrderToLocal(order: RechargeOrder): void {
  const orders = getOrdersFromLocal();
  const index = orders.findIndex(o => o.orderId === order.orderId);

  if (index >= 0) {
    orders[index] = order;
  } else {
    orders.push(order);
  }

  localStorage.setItem('recharge_orders', JSON.stringify(orders));
}

function getOrderFromLocal(orderId: string): RechargeOrder | null {
  const orders = getOrdersFromLocal();
  return orders.find(o => o.orderId === orderId) || null;
}

function getOrdersFromLocal(): RechargeOrder[] {
  const data = localStorage.getItem('recharge_orders');
  return data ? JSON.parse(data) : [];
}

// 获取用户所有订单
export function getUserOrders(userId: string): RechargeOrder[] {
  const orders = getOrdersFromLocal();
  return orders.filter(o => o.userId === userId).sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

// 更新用户余额
async function updateUserBalance(userId: string, amount: number): Promise<void> {
  const balanceKey = `user_balance_${userId}`;
  const data = localStorage.getItem(balanceKey);

  const balance = data ? JSON.parse(data) : {
    userId,
    balance: 0,
    totalRecharged: 0,
    totalConsumed: 0,
    updatedAt: new Date().toISOString(),
  };

  balance.balance += amount;
  balance.totalRecharged += amount;
  balance.updatedAt = new Date().toISOString();

  localStorage.setItem(balanceKey, JSON.stringify(balance));

  // 记录充值记录
  const record = {
    id: `REC${Date.now()}`,
    orderId: '',
    userId,
    amount,
    type: 'recharge',
    description: `充值 ¥${amount.toFixed(2)}`,
    createdAt: new Date().toISOString(),
  };

  const records = getRechargeRecords(userId);
  records.unshift(record);
  localStorage.setItem(`recharge_records_${userId}`, JSON.stringify(records));
}

// 获取用户余额
export function getUserBalance(userId: string) {
  const balanceKey = `user_balance_${userId}`;
  const data = localStorage.getItem(balanceKey);

  return data ? JSON.parse(data) : {
    userId,
    balance: 0,
    totalRecharged: 0,
    totalConsumed: 0,
    updatedAt: new Date().toISOString(),
  };
}

// 获取充值记录
export function getRechargeRecords(userId: string) {
  const data = localStorage.getItem(`recharge_records_${userId}`);
  return data ? JSON.parse(data) : [];
}

// 消费余额
export function consumeBalance(userId: string, amount: number, description: string): boolean {
  const balance = getUserBalance(userId);

  if (balance.balance < amount) {
    return false;
  }

  balance.balance -= amount;
  balance.totalConsumed += amount;
  balance.updatedAt = new Date().toISOString();

  localStorage.setItem(`user_balance_${userId}`, JSON.stringify(balance));

  // 记录消费记录
  const record = {
    id: `REC${Date.now()}`,
    orderId: '',
    userId,
    amount: -amount,
    type: 'consume',
    description,
    createdAt: new Date().toISOString(),
  };

  const records = getRechargeRecords(userId);
  records.unshift(record);
  localStorage.setItem(`recharge_records_${userId}`, JSON.stringify(records));

  return true;
}
