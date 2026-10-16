import { requestApi } from '../../utils/api';
import { clearUserSession, getUserToken, saveUserSession, type AppUser } from '../../utils/user-session';

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

type UserMeResponse = { user: AppUser };

type Conversation = {
  id: string;
  title: string;
  updatedAt: number;
  timeLabel: string;
  messages: ChatMessage[];
};

type WindowInfo = { windowWidth: number; statusBarHeight: number };
type MenuButtonRect = { top: number; left: number; width: number; height: number };

const CONVERSATION_STORAGE_KEY = 'chatConversations';
const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: '我是你的赛博邻居。下水堵了、钥匙丢了、空调坏了，直接告诉我，我帮你找附近靠谱的人。',
};

function getFooterBaseHeightPx(expanded = false) {
  const windowInfo = getWindowInfo();

  return Math.round((windowInfo.windowWidth / 750) * (expanded ? 250 : 234));
}

function getNavigationMetrics() {
  const windowInfo = getWindowInfo();
  const menuButton = (wx as unknown as {
    getMenuButtonBoundingClientRect(): MenuButtonRect;
  }).getMenuButtonBoundingClientRect();
  const navigationContentHeight = Math.max(
    44,
    menuButton.height + Math.max(0, menuButton.top - windowInfo.statusBarHeight) * 2,
  );

  return {
    headerHeightPx: windowInfo.statusBarHeight + navigationContentHeight,
    statusBarHeightPx: windowInfo.statusBarHeight,
    headerRightPx: Math.max(14, windowInfo.windowWidth - menuButton.left + 8),
    drawerTopPx: windowInfo.statusBarHeight + 20,
  };
}

function getWindowInfo() {
  return (wx as unknown as { getWindowInfo(): WindowInfo }).getWindowInfo();
}

Component({
  data: {
    inputValue: '',
    keyboardHeightPx: 0,
    composerFocused: false,
    chatBottomPx: 150,
    headerHeightPx: 88,
    statusBarHeightPx: 44,
    headerRightPx: 102,
    drawerTopPx: 64,
    isSending: false,
    drawerOpen: false,
    conversations: [] as Conversation[],
    activeConversationId: `conversation_${Date.now()}`,
    messages: [WELCOME_MESSAGE] as ChatMessage[],
    quickNeeds: ['厨房下水堵了，很急', '钥匙丢了要开锁'],
    scrollIntoView: 'welcome',
  },

  lifetimes: {
    attached() {
      if (!getUserToken()) {
        wx.reLaunch({ url: '/pages/login/index' });
        return;
      }

      requestApi<UserMeResponse>({ path: '/auth/user/me' })
        .then((response) => {
          saveUserSession(getUserToken(), response.user);
        })
        .catch(() => {
          clearUserSession();
          wx.reLaunch({ url: '/pages/login/index' });
        });

      const keyboardHeightListener = (res: WechatMiniprogram.OnKeyboardHeightChangeCallbackResult) => {
        this.updateKeyboardHeight(res.height || 0);
      };

      (this as any).keyboardHeightListener = keyboardHeightListener;
      wx.onKeyboardHeightChange(keyboardHeightListener);

      this.setData({
        chatBottomPx: getFooterBaseHeightPx(),
        conversations: loadConversations(),
        ...getNavigationMetrics(),
      });
    },

    detached() {
      const keyboardHeightListener = (this as any).keyboardHeightListener;
      const typingTimer = (this as any).typingTimer;

      if (keyboardHeightListener && wx.offKeyboardHeightChange) {
        wx.offKeyboardHeightChange(keyboardHeightListener);
      }

      if (typingTimer) {
        clearTimeout(typingTimer);
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
      this.setData({ composerFocused: true }, () => this.updateKeyboardHeight(height));
    },

    onInputBlur() {
      this.setData({ composerFocused: false }, () => this.updateKeyboardHeight(0));
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

    onOpenDrawer() {
      this.setData({ drawerOpen: true });
    },

    onCloseDrawer() {
      this.setData({ drawerOpen: false });
    },

    onDrawerTap() {
      // 阻止点击抽屉内容时触发遮罩关闭。
    },

    onNewConversation() {
      this.clearTypingTimer();
      this.persistCurrentConversation();
      this.setData({
        activeConversationId: `conversation_${Date.now()}`,
        messages: [WELCOME_MESSAGE],
        inputValue: '',
        isSending: false,
        scrollIntoView: 'welcome',
        drawerOpen: false,
      });
    },

    onSelectConversation(e: WechatMiniprogram.TouchEvent) {
      this.clearTypingTimer();
      this.persistCurrentConversation();
      const id = String(e.currentTarget.dataset.id || '');
      const conversation = this.data.conversations.find((item) => item.id === id);
      if (!conversation) return;
      const lastMessage = conversation.messages[conversation.messages.length - 1];
      this.setData({
        activeConversationId: conversation.id,
        messages: conversation.messages,
        isSending: false,
        scrollIntoView: lastMessage?.id || 'welcome',
        drawerOpen: false,
      });
    },

    onOpenSettings() {
      this.setData({ drawerOpen: false });
      wx.navigateTo({ url: '/pages/settings/index' });
    },

    persistCurrentConversation() {
      const userMessage = this.data.messages.find((item) => item.role === 'user');
      if (!userMessage) return;
      const updatedAt = Date.now();
      const conversation: Conversation = {
        id: this.data.activeConversationId,
        title: userMessage.content.slice(0, 22),
        updatedAt,
        timeLabel: formatConversationTime(updatedAt),
        messages: this.data.messages,
      };
      const conversations = [
        conversation,
        ...this.data.conversations.filter((item) => item.id !== conversation.id),
      ].slice(0, 30);
      wx.setStorageSync(CONVERSATION_STORAGE_KEY, conversations);
      this.setData({ conversations });
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
              content: '',
            };
          });

          this.setData({
            messages,
            scrollIntoView: loadingMessageId,
          }, () => this.startTypewriter(
            loadingMessageId,
            response.reply,
            normalizeMerchants(response.merchants),
          ));
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
          }, () => this.persistCurrentConversation());
        });
    },

    startTypewriter(messageId: string, content: string, merchants: Merchant[]) {
      this.clearTypingTimer();
      const characters = Array.from(content);
      let visibleLength = 0;

      const renderNextCharacter = () => {
        const messageExists = this.data.messages.some((item) => item.id === messageId);

        if (!messageExists) {
          this.clearTypingTimer();
          return;
        }

        visibleLength += 1;
        const finished = visibleLength >= characters.length;
        const messages = this.data.messages.map((item) => {
          if (item.id !== messageId) return item;

          return {
            ...item,
            content: characters.slice(0, visibleLength).join(''),
            merchants: finished ? merchants : undefined,
          };
        });

        this.setData({
          messages,
          isSending: !finished,
          scrollIntoView: messageId,
        }, () => {
          if (finished) {
            this.clearTypingTimer();
            this.persistCurrentConversation();
            return;
          }

          (this as any).typingTimer = setTimeout(renderNextCharacter, 50);
        });
      };

      if (!characters.length) {
        const messages = this.data.messages.map((item) => (
          item.id === messageId ? { ...item, merchants } : item
        ));
        this.setData({ messages, isSending: false }, () => this.persistCurrentConversation());
        return;
      }

      renderNextCharacter();
    },

    clearTypingTimer() {
      const typingTimer = (this as any).typingTimer;

      if (typingTimer) {
        clearTimeout(typingTimer);
        (this as any).typingTimer = undefined;
      }
    },

    updateKeyboardHeight(height: number) {
      const keyboardHeightPx = Math.max(0, height);

      this.setData({
        keyboardHeightPx,
        chatBottomPx: getFooterBaseHeightPx(this.data.composerFocused) + keyboardHeightPx,
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

function loadConversations(): Conversation[] {
  const value = wx.getStorageSync(CONVERSATION_STORAGE_KEY) as Conversation[] | undefined;
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && item.id && Array.isArray(item.messages))
    .map((item) => ({ ...item, timeLabel: formatConversationTime(item.updatedAt) }))
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 30);
}

function formatConversationTime(value: number) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
