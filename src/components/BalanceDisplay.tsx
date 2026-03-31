import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Wallet, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getUserBalance } from '@/lib/payment-service';
import type { UserBalance } from '@/types/payment';

interface BalanceDisplayProps {
  userId?: string;
  showRechargeButton?: boolean;
  compact?: boolean;
}

export const BalanceDisplay = ({
  userId,
  showRechargeButton = true,
  compact = false
}: BalanceDisplayProps) => {
  const navigate = useNavigate();
  const [balance, setBalance] = useState<UserBalance | null>(null);

  // 获取用户ID
  const currentUserId = userId || 'user_' + (localStorage.getItem('current_user_id') || '123456');

  useEffect(() => {
    loadBalance();

    // 每30秒刷新一次余额
    const interval = setInterval(loadBalance, 30000);
    return () => clearInterval(interval);
  }, [currentUserId]);

  const loadBalance = () => {
    const userBalance = getUserBalance(currentUserId);
    setBalance(userBalance);
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-full">
          <Wallet className="w-4 h-4" />
          <span className="text-sm font-semibold">
            ¥{balance?.balance.toFixed(2) || '0.00'}
          </span>
        </div>
        {showRechargeButton && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate('/recharge')}
            className="h-8"
          >
            <Plus className="w-4 h-4 mr-1" />
            充值
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card className="bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm opacity-90">账户余额</p>
              <p className="text-2xl font-bold">
                ¥{balance?.balance.toFixed(2) || '0.00'}
              </p>
            </div>
          </div>
          {showRechargeButton && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate('/recharge')}
              className="bg-white text-blue-600 hover:bg-white/90"
            >
              <Plus className="w-4 h-4 mr-1" />
              充值
            </Button>
          )}
        </div>

        {balance && (
          <div className="mt-4 pt-4 border-t border-white/20 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="opacity-75">累计充值</p>
              <p className="font-semibold mt-1">
                ¥{balance.totalRecharged.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="opacity-75">累计消费</p>
              <p className="font-semibold mt-1">
                ¥{balance.totalConsumed.toFixed(2)}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
