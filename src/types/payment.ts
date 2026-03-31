// 充值相关类型定义

export interface RechargePackage {
  id: string;
  displayAmount: number; // 显示金额（用户支付的金额）
  actualAmount: number; // 实际到账金额
  platformFee: number; // 平台服务费
  isPopular?: boolean; // 是否为热门套餐
  bonus?: number; // 赠送金额
}

export interface RechargeOrder {
  orderId: string;
  userId: string;
  packageId: string;
  displayAmount: number;
  actualAmount: number;
  platformFee: number;
  status: 'pending' | 'paid' | 'failed' | 'cancelled';
  paymentMethod: 'alipay' | 'wechat' | 'other';
  paymentUrl?: string; // 支付链接
  qrCode?: string; // 支付二维码
  createdAt: string;
  paidAt?: string;
  expiredAt: string; // 订单过期时间
}

export interface UserBalance {
  userId: string;
  balance: number;
  totalRecharged: number; // 累计充值
  totalConsumed: number; // 累计消费
  updatedAt: string;
}

export interface RechargeRecord {
  id: string;
  orderId: string;
  userId: string;
  amount: number;
  type: 'recharge' | 'consume' | 'refund';
  description: string;
  createdAt: string;
}

// 第三方支付配置
export interface PaymentConfig {
  apiUrl: string; // 支付接口地址
  merchantId: string; // 商户ID
  apiKey: string; // API密钥
  notifyUrl: string; // 回调地址
}
