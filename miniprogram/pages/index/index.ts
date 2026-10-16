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
  locationRequest?: boolean;
  locationLoading?: boolean;
};

type UserLocation = {
  latitude: number;
  longitude: number;
  communityName: string;
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

type ChatPageData = {
  inputValue: string;
  keyboardHeightPx: number;
  composerFocused: boolean;
  chatBottomPx: number;
  headerHeightPx: number;
  statusBarHeightPx: number;
  headerRightPx: number;
  drawerTopPx: number;
  isSending: boolean;
  drawerOpen: boolean;
  conversations: Conversation[];
  activeConversationId: string;
  messages: ChatMessage[];
  quickNeeds: string[];
  scrollIntoView: string;
  pendingLocationMessage: string;
  pendingLocationMessageId: string;
};

type ChatPageMethods = {
  onInput(e: WechatMiniprogram.Input): void;
  onInputFocus(e: { detail?: { height?: number } }): void;
  onInputBlur(): void;
  onQuickNeed(e: WechatMiniprogram.TouchEvent): void;
  onSend(): void;
  onCallMerchant(e: WechatMiniprogram.TouchEvent): void;
  onAuthorizeLocation(): void;
  resolveLocationForMessage(messageId: string): void;
  showLocationRequest(messageId: string, denied?: boolean): void;
  requestUserLocation(messageId: string): void;
  handleLocationGranted(messageId: string, location: UserLocation): void;
  handleLocationFailure(messageId: string, error?: { errMsg?: string }): void;
  onOpenDrawer(): void;
  onCloseDrawer(): void;
  onDrawerTap(): void;
  onNewConversation(): void;
  onSelectConversation(e: WechatMiniprogram.TouchEvent): void;
  onOpenSettings(): void;
  persistCurrentConversation(): void;
  sendMessage(rawMessage: string): void;
  requestChatMessage(message: string, loadingMessageId: string, location: UserLocation): void;
  startTypewriter(messageId: string, content: string, merchants: Merchant[]): void;
  clearTypingTimer(): void;
  updateKeyboardHeight(height: number): void;
};

type ChatPageCustomProperties = {
  keyboardHeightListener?: (res: WechatMiniprogram.OnKeyboardHeightChangeCallbackResult) => void;
  typingTimer?: ReturnType<typeof setTimeout>;
};

type ChatPageInstance = WechatMiniprogram.Component.Instance<
  ChatPageData,
  {},
  ChatPageMethods,
  ChatPageCustomProperties
>;

type ChatPageLifetimes = {
  attached(): void;
  detached(): void;
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

Component<ChatPageData, {}, ChatPageMethods, ChatPageCustomProperties>({
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
    pendingLocationMessage: '',
    pendingLocationMessageId: '',
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

      this.keyboardHeightListener = keyboardHeightListener;
      wx.onKeyboardHeightChange(keyboardHeightListener);

      this.setData({
        chatBottomPx: getFooterBaseHeightPx(),
        conversations: loadConversations(),
        ...getNavigationMetrics(),
      });
    },

    detached() {
      const keyboardHeightListener = this.keyboardHeightListener;
      const typingTimer = this.typingTimer;

      if (keyboardHeightListener && wx.offKeyboardHeightChange) {
        wx.offKeyboardHeightChange(keyboardHeightListener);
      }

      if (typingTimer) {
        clearTimeout(typingTimer);
      }
    },
  } as ChatPageLifetimes & ThisType<ChatPageInstance>,

  methods: {
    onInput(e: WechatMiniprogram.Input) {
      this.setData({
        inputValue: e.detail.value,
      });
    },

    onInputFocus(e: { detail?: { height?: number } }) {
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

    onAuthorizeLocation() {
      const messageId = this.data.pendingLocationMessageId;
      if (!this.data.pendingLocationMessage || !messageId) return;

      wx.getSetting({
        success: (settings) => {
          if (settings.authSetting['scope.userLocation'] === false) {
            wx.openSetting({
              success: (result) => {
                if (result.authSetting['scope.userLocation']) {
                  this.requestUserLocation(messageId);
                  return;
                }
                this.showLocationRequest(messageId, true);
              },
              fail: () => this.showLocationRequest(messageId, true),
            });
            return;
          }

          this.requestUserLocation(messageId);
        },
        fail: () => this.requestUserLocation(messageId),
      });
    },

    resolveLocationForMessage(messageId: string) {
      wx.getSetting({
        success: (settings) => {
          if (settings.authSetting['scope.userLocation'] === true) {
            this.requestUserLocation(messageId);
            return;
          }
          this.showLocationRequest(messageId, settings.authSetting['scope.userLocation'] === false);
        },
        fail: () => this.showLocationRequest(messageId),
      });
    },

    showLocationRequest(messageId: string, denied = false) {
      if (this.data.pendingLocationMessageId !== messageId) return;

      const messages = this.data.messages.map((item) => (
        item.id === messageId
          ? {
            ...item,
            content: denied
              ? '定位权限尚未开启。点击这里前往设置并授权。'
              : '为了推荐你附近的服务，需要获取你的位置。点击这里授权。',
            locationRequest: true,
            locationLoading: false,
          }
          : item
      ));
      this.setData({ messages, isSending: false, scrollIntoView: messageId });
    },

    requestUserLocation(messageId: string) {
      if (this.data.pendingLocationMessageId !== messageId) return;
      const locationMessage = this.data.messages.find((item) => item.id === messageId);
      if (!locationMessage || locationMessage.locationLoading) return;

      const messages = this.data.messages.map((item) => (
        item.id === messageId
          ? {
            ...item,
            content: '正在获取你的位置…',
            locationRequest: false,
            locationLoading: true,
          }
          : item
      ));
      this.setData({ messages, isSending: true });

      wx.getLocation({
        type: 'gcj02',
        success: (result) => this.handleLocationGranted(messageId, {
          latitude: Number(result.latitude),
          longitude: Number(result.longitude),
          communityName: '当前位置',
        }),
        fail: (error) => this.handleLocationFailure(messageId, error),
      });
    },

    handleLocationGranted(messageId: string, location: UserLocation) {
      const message = this.data.pendingLocationMessage;
      if (!message || this.data.pendingLocationMessageId !== messageId) return;

      const messages = this.data.messages.map((item) => (
        item.id === messageId
          ? {
            ...item,
            content: '我正在从附近商户库里帮你筛选。',
            locationRequest: false,
            locationLoading: false,
          }
          : item
      ));
      this.setData({
        pendingLocationMessage: '',
        pendingLocationMessageId: '',
        messages,
        isSending: true,
        scrollIntoView: messageId,
      });
      this.requestChatMessage(message, messageId, location);
    },

    handleLocationFailure(messageId: string, error?: { errMsg?: string }) {
      if (this.data.pendingLocationMessageId !== messageId) return;
      const cancelled = error?.errMsg?.includes('cancel');

      wx.getSetting({
        success: (settings) => {
          if (settings.authSetting['scope.userLocation'] === false) {
            this.showLocationRequest(messageId, true);
            return;
          }
          const messages = this.data.messages.map((item) => (
            item.id === messageId
              ? {
                ...item,
                content: cancelled
                  ? '你已取消定位。需要附近服务时，点击这里重试。'
                  : '暂时无法获取当前位置，请检查系统定位后点击重试。',
                locationRequest: true,
                locationLoading: false,
              }
              : item
          ));
          this.setData({ messages, isSending: false });
        },
        fail: () => this.showLocationRequest(messageId),
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
        pendingLocationMessage: '',
        pendingLocationMessageId: '',
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
      const messages = conversation.messages.map((item) => (
        item.locationLoading ? { ...item, locationLoading: false, locationRequest: true } : item
      ));
      const locationRequest = messages.find((item) => item.locationRequest);
      const lastUserMessage = [...messages].reverse().find((item) => item.role === 'user');
      const lastMessage = messages[messages.length - 1];
      this.setData({
        activeConversationId: conversation.id,
        messages,
        isSending: false,
        pendingLocationMessage: locationRequest ? lastUserMessage?.content || '' : '',
        pendingLocationMessageId: locationRequest?.id || '',
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

      if (this.data.pendingLocationMessage) {
        wx.showToast({ title: '请先点击消息授权位置', icon: 'none' });
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
        content: '正在确认当前位置…',
      };

      this.setData({
        inputValue: '',
        isSending: true,
        pendingLocationMessage: message,
        pendingLocationMessageId: loadingMessage.id,
        messages: [...this.data.messages, userMessage, loadingMessage],
        scrollIntoView: loadingMessage.id,
      });

      this.resolveLocationForMessage(loadingMessage.id);
    },

    requestChatMessage(message: string, loadingMessageId: string, location: UserLocation) {
      requestApi<ChatResponse, ChatRequestBody>({
        method: 'POST',
        path: '/chat/message',
        data: {
          message,
          location,
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

          this.typingTimer = setTimeout(renderNextCharacter, 50);
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
      const typingTimer = this.typingTimer;

      if (typingTimer) {
        clearTimeout(typingTimer);
        this.typingTimer = undefined;
      }
    },

    updateKeyboardHeight(height: number) {
      const keyboardHeightPx = Math.max(0, height);

      this.setData({
        keyboardHeightPx,
        chatBottomPx: getFooterBaseHeightPx(this.data.composerFocused) + keyboardHeightPx,
      });
    },
  } as ChatPageMethods & ThisType<ChatPageInstance>,
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
