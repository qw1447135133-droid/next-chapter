# 充值系统配置指南

## 功能概述

本项目已集成完整的充值系统，支持第三方聚合支付（如易支付、码支付等）。充值金额包含平台服务费，实际到账金额为用户可用余额。

### 充值套餐示例
- 支付 ¥8.4 → 到账 ¥1.4（平台服务费 ¥7.0）
- 支付 ¥16.8 → 到账 ¥2.8（平台服务费 ¥14.0）
- 支付 ¥42.0 → 到账 ¥7.0 + ¥0.5 赠送（平台服务费 ¥35.0）

## 配置步骤

### 1. 选择支付平台

推荐的第三方聚合支付平台：
- **易支付** (https://www.epay.com)
- **码支付** (https://codepay.fateqq.com)
- **虎皮椒支付** (https://www.xunhupay.com)
- **PayJS** (https://payjs.cn)

### 2. 注册商户账号

1. 访问支付平台官网
2. 注册商户账号
3. 完成实名认证（部分平台需要）
4. 获取以下信息：
   - 商户ID (Merchant ID)
   - API密钥 (API Key)
   - API接口地址

### 3. 配置环境变量

复制 `.env.example` 为 `.env.local`：

```bash
cp .env.example .env.local
```

编辑 `.env.local` 文件，填入你的支付平台配置：

```env
# 支付接口地址
VITE_PAYMENT_API_URL=https://api.your-payment-platform.com

# 商户ID
VITE_MERCHANT_ID=your_merchant_id_here

# API密钥
VITE_PAYMENT_API_KEY=your_api_key_here

# 支付回调地址（需要配置为你的服务器地址）
VITE_PAYMENT_NOTIFY_URL=https://your-domain.com/api/payment/notify
```

### 4. 调整充值套餐

编辑 `src/lib/payment-service.ts` 文件中的 `RECHARGE_PACKAGES` 数组：

```typescript
export const RECHARGE_PACKAGES: RechargePackage[] = [
  {
    id: 'package_1',
    displayAmount: 8.4,      // 用户支付金额
    actualAmount: 1.4,       // 实际到账金额
    platformFee: 7.0,        // 平台服务费
  },
  // 添加更多套餐...
];
```

### 5. 适配支付接口

根据你选择的支付平台，修改 `src/lib/payment-service.ts` 中的以下函数：

#### `generateSignature()` - 签名生成
不同支付平台的签名算法不同，需要根据平台文档调整：

```typescript
function generateSignature(params: Record<string, any>): string {
  // 示例：MD5签名
  const sortedKeys = Object.keys(params).sort();
  const signString = sortedKeys
    .map(key => `${key}=${params[key]}`)
    .join('&') + `&key=${PAYMENT_CONFIG.apiKey}`;

  // 使用对应的加密算法（MD5、SHA256等）
  return md5(signString); // 需要安装 crypto-js 或其他加密库
}
```

#### `requestPayment()` - 创建支付订单
根据支付平台的API文档调整请求参数和响应处理：

```typescript
async function requestPayment(order: RechargeOrder) {
  const params = {
    // 根据支付平台文档调整参数名称和格式
    merchant_id: PAYMENT_CONFIG.merchantId,
    out_trade_no: order.orderId,
    total_amount: order.displayAmount,
    // ... 其他参数
  };

  const response = await fetch(`${PAYMENT_CONFIG.apiUrl}/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const result = await response.json();

  return {
    paymentUrl: result.pay_url,  // 根据实际响应字段调整
    qrCode: result.qr_code,      // 根据实际响应字段调整
  };
}
```

#### `queryOrderStatus()` - 查询订单状态
根据支付平台的查询接口调整：

```typescript
// 在 queryOrderStatus 函数中调整查询逻辑
const response = await fetch(`${PAYMENT_CONFIG.apiUrl}/query`, {
  method: 'POST',
  body: JSON.stringify({
    merchant_id: PAYMENT_CONFIG.merchantId,
    out_trade_no: orderId,
    // ... 其他参数
  }),
});

const result = await response.json();

// 根据平台返回的状态码判断
if (result.trade_status === 'TRADE_SUCCESS') {
  localOrder.status = 'paid';
  // ...
}
```

### 6. 配置支付回调（重要）

支付成功后，支付平台会向你的服务器发送回调通知。你需要：

1. **搭建后端服务**（Node.js、Python、PHP等）
2. **创建回调接口**，例如：`/api/payment/notify`
3. **验证签名**，确保回调来自支付平台
4. **更新订单状态**和用户余额

示例 Node.js 回调处理：

```javascript
app.post('/api/payment/notify', async (req, res) => {
  const { order_id, trade_status, sign } = req.body;

  // 1. 验证签名
  if (!verifySignature(req.body, sign)) {
    return res.status(400).send('Invalid signature');
  }

  // 2. 更新订单状态
  if (trade_status === 'TRADE_SUCCESS') {
    await updateOrderStatus(order_id, 'paid');
    await updateUserBalance(order_id);
  }

  // 3. 返回成功响应
  res.send('success');
});
```

### 7. 安全建议

⚠️ **重要安全提示**：

1. **不要在前端暴露API密钥**
   - 当前示例代码将API密钥放在前端，仅用于演示
   - 生产环境必须将支付逻辑移到后端

2. **使用HTTPS**
   - 支付回调地址必须使用HTTPS
   - 确保数据传输安全

3. **验证回调签名**
   - 必须验证支付平台回调的签名
   - 防止恶意请求伪造支付成功

4. **订单防重复**
   - 检查订单是否已处理
   - 防止重复充值

5. **金额校验**
   - 后端必须验证充值金额
   - 防止前端篡改金额

## 使用方法

### 在页面中显示余额

```tsx
import { BalanceDisplay } from '@/components/BalanceDisplay';

function MyPage() {
  return (
    <div>
      {/* 完整显示 */}
      <BalanceDisplay />

      {/* 紧凑显示 */}
      <BalanceDisplay compact />

      {/* 不显示充值按钮 */}
      <BalanceDisplay showRechargeButton={false} />
    </div>
  );
}
```

### 消费余额

```typescript
import { consumeBalance, getUserBalance } from '@/lib/payment-service';

// 检查余额是否足够
const balance = getUserBalance(userId);
if (balance.balance < 10) {
  alert('余额不足，请充值');
  return;
}

// 消费余额
const success = consumeBalance(userId, 10, '购买服务');
if (success) {
  console.log('消费成功');
} else {
  console.log('余额不足');
}
```

### 访问充值页面

用户可以通过以下方式访问充值页面：
- 直接访问：`/recharge`
- 点击余额组件中的"充值"按钮
- 在代码中导航：`navigate('/recharge')`

## 测试流程

1. 启动开发服务器：`npm run dev`
2. 访问充值页面：`http://localhost:5173/recharge`
3. 选择充值套餐和支付方式
4. 点击"立即充值"
5. 扫描二维码或打开支付链接
6. 完成支付后，系统会自动更新余额

## 常见问题

### Q: 支付后余额没有更新？
A: 检查以下几点：
- 支付回调地址是否配置正确
- 后端是否正确处理了回调
- 订单状态查询接口是否正常

### Q: 如何修改充值套餐？
A: 编辑 `src/lib/payment-service.ts` 中的 `RECHARGE_PACKAGES` 数组

### Q: 如何更换支付平台？
A: 按照上述"适配支付接口"部分，修改相关函数即可

### Q: 数据存储在哪里？
A: 当前使用 localStorage 存储（仅用于演示）
   生产环境应该使用后端数据库（MySQL、PostgreSQL等）

### Q: 如何部署到生产环境？
A:
1. 搭建后端服务处理支付逻辑
2. 配置数据库存储订单和余额
3. 配置HTTPS和域名
4. 在支付平台配置回调地址
5. 测试完整支付流程

## 文件结构

```
src/
├── types/
│   └── payment.ts              # 支付相关类型定义
├── lib/
│   └── payment-service.ts      # 支付服务核心逻辑
├── components/
│   └── BalanceDisplay.tsx      # 余额显示组件
├── pages/
│   └── Recharge.tsx            # 充值页面
└── App.tsx                     # 路由配置
```

## 下一步

1. ✅ 选择并注册支付平台
2. ✅ 配置环境变量
3. ✅ 调整充值套餐
4. ✅ 适配支付接口
5. ✅ 搭建后端服务
6. ✅ 配置支付回调
7. ✅ 测试完整流程
8. ✅ 部署到生产环境

## 技术支持

如有问题，请参考：
- 支付平台官方文档
- 项目 GitHub Issues
- 联系技术支持

---

**注意**：本充值系统仅供学习和参考，实际使用时请确保符合相关法律法规，并做好安全防护。
