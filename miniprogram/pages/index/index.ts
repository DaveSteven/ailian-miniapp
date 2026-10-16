import { requestApi } from '../../utils/api';

type ServiceCategory = 'pipe_unclogging' | 'locksmith' | 'appliance_repair' | 'housekeeping' | 'unknown';

type Merchant = {
  id: string;
  serviceId?: string;
  serviceName?: string;
  name: string;
  category: ServiceCategory;
  tags: string[];
  rating: number;
  reviewCount: number;
  distanceKm: number;
  priceHint: string;
  responseTime: string;
  phone: string;
  verified: boolean;
  availableNow: boolean;
  matchScore?: number;
};

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  merchants?: Merchant[];
};

type ChatResponse = {
  reply: string;
  merchants: Merchant[];
};

type ChatRequestBody = {
  message: string;
  location: {
    latitude: number;
    longitude: number;
    communityName: string;
  };
};

function getFooterBaseHeightPx() {
  const systemInfo = wx.getSystemInfoSync();

  return Math.round((systemInfo.windowWidth / 750) * 224);
}

Component({
  data: {
    inputValue: '',
    keyboardHeightPx: 0,
    chatBottomPx: 150,
    isSending: false,
    messages: [
      {
        id: 'welcome',
        role: 'assistant',
        content: '我是你的赛博邻居。下水堵了、钥匙丢了、空调坏了，直接告诉我，我帮你找附近靠谱的人。',
      },
    ] as ChatMessage[],
    quickNeeds: ['厨房下水堵了，很急', '钥匙丢了要开锁', '空调不制冷', '找阿姨做保洁'],
    scrollIntoView: 'welcome',
  },

  lifetimes: {
    attached() {
      const keyboardHeightListener = (res: WechatMiniprogram.OnKeyboardHeightChangeCallbackResult) => {
        this.updateKeyboardHeight(res.height || 0);
      };

      (this as any).keyboardHeightListener = keyboardHeightListener;
      wx.onKeyboardHeightChange(keyboardHeightListener);

      this.setData({
        chatBottomPx: getFooterBaseHeightPx(),
      });
    },

    detached() {
      const keyboardHeightListener = (this as any).keyboardHeightListener;

      if (keyboardHeightListener && wx.offKeyboardHeightChange) {
        wx.offKeyboardHeightChange(keyboardHeightListener);
      }
    },
  },

  methods: {
    onInput(e: WechatMiniprogram.Input) {
      this.setData({
        inputValue: e.detail.value,
      });
    },

    onInputFocus(e: any) {
      const height = e && e.detail && e.detail.height ? e.detail.height : 0;

      if (height > 0) {
        this.updateKeyboardHeight(height);
      }
    },

    onInputBlur() {
      this.updateKeyboardHeight(0);
    },

    onQuickNeed(e: WechatMiniprogram.TouchEvent) {
      const text = e.currentTarget.dataset.text as string;
      this.sendMessage(text);
    },

    onSend() {
      this.sendMessage(this.data.inputValue);
    },

    onCallMerchant(e: WechatMiniprogram.TouchEvent) {
      const phone = e.currentTarget.dataset.phone as string;
      wx.showToast({
        title: `联系 ${phone}`,
        icon: 'none',
      });
    },

    onOpenMerchantEntry() {
      wx.navigateTo({
        url: '/pages/merchant-entry/index',
      });
    },

    sendMessage(rawMessage: string) {
      const message = rawMessage.trim();

      if (!message) {
        wx.showToast({
          title: '先说说你遇到什么事',
          icon: 'none',
        });
        return;
      }

      if (this.data.isSending) {
        return;
      }

      const timestamp = Date.now();
      const userMessage: ChatMessage = {
        id: `user_${timestamp}`,
        role: 'user',
        content: message,
      };
      const loadingMessage: ChatMessage = {
        id: `assistant_loading_${timestamp}`,
        role: 'assistant',
        content: '我正在从附近商户库里帮你筛选。',
      };

      this.setData({
        inputValue: '',
        isSending: true,
        messages: [...this.data.messages, userMessage, loadingMessage],
        scrollIntoView: loadingMessage.id,
      });

      this.requestChatMessage(message, loadingMessage.id);
    },

    requestChatMessage(message: string, loadingMessageId: string) {
      requestApi<ChatResponse, ChatRequestBody>({
        method: 'POST',
        path: '/chat/message',
        data: {
          message,
          location: {
            latitude: 31.234567,
            longitude: 121.512345,
            communityName: '当前小区',
          },
        },
      })
        .then((response) => {
          const messages = this.data.messages.map((item) => {
            if (item.id !== loadingMessageId) {
              return item;
            }

            return {
              ...item,
              content: response.reply,
              merchants: normalizeMerchants(response.merchants),
            };
          });

          this.setData({
            isSending: false,
            messages,
            scrollIntoView: loadingMessageId,
          });
        })
        .catch((error) => {
          const messages = this.data.messages.map((item) => {
            if (item.id !== loadingMessageId) {
              return item;
            }

            return {
              ...item,
              content: buildErrorMessage(error),
            };
          });

          this.setData({
            isSending: false,
            messages,
            scrollIntoView: loadingMessageId,
          });
        });
    },

    updateKeyboardHeight(height: number) {
      const keyboardHeightPx = Math.max(0, height);

      this.setData({
        keyboardHeightPx,
        chatBottomPx: getFooterBaseHeightPx() + keyboardHeightPx,
      });
    },
  },
});

function normalizeMerchants(merchants: Merchant[]) {
  return merchants.map((merchant) => ({
    ...merchant,
    rating: merchant.rating || 0,
    reviewCount: merchant.reviewCount || 0,
    distanceKm: merchant.distanceKm || 0,
    tags: merchant.tags || [],
  }));
}

function buildErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '请求失败';

  if (message.indexOf('request:fail') >= 0 || message.indexOf('网络请求失败') >= 0) {
    return '我现在连不上服务，请检查网络后稍后重试。';
  }

  return message;
}
