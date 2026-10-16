import { requestApi } from '../../utils/api';
import { clearUserSession, getUserToken, saveUserSession, type AppUser } from '../../utils/user-session';

type UserLoginResponse = {
  token: string;
  expiresAt: string;
  user: AppUser;
  staffSession: { token: string } | null;
};

type UserMeResponse = { user: AppUser };
type PhoneAuthorizationEvent = WechatMiniprogram.BaseEvent & {
  detail: { code?: string; errMsg?: string };
};

let prefetchedWechatLogin: Promise<WechatMiniprogram.LoginSuccessCallbackResult | null> | null = null;
let prefetchedWechatLoginAt = 0;

Page({
  data: {
    checking: true,
    loggingIn: false,
    errorMessage: '',
  },

  async onLoad() {
    if (!getUserToken()) {
      prepareWechatLogin();
      this.setData({ checking: false });
      return;
    }

    try {
      const response = await requestApi<UserMeResponse>({ path: '/auth/user/me' });
      saveUserSession(getUserToken(), response.user);
      this.enterProduct();
    } catch {
      clearUserSession();
      prepareWechatLogin();
      this.setData({ checking: false });
    }
  },

  async onWechatLogin(event: PhoneAuthorizationEvent) {
    if (this.data.loggingIn) return;
    this.setData({ loggingIn: true, errorMessage: '' });

    try {
      if (!event.detail.code) {
        throw new Error(event.detail.errMsg?.includes('deny') ? '需要授权手机号后才能登录。' : '手机号授权未完成，请重试。');
      }
      const login = await getPreparedWechatLogin();
      const response = await requestApi<UserLoginResponse, {
        code: string;
        phoneCode?: string;
        profile: { nickname: string; avatarUrl: string };
      }>({
        method: 'POST',
        path: '/auth/user/wechat',
        auth: 'none',
        data: {
          code: login.code,
          phoneCode: event.detail.code,
          profile: { nickname: '', avatarUrl: '' },
        },
      });
      saveUserSession(response.token, response.user);
      if (response.staffSession?.token) {
        wx.setStorageSync('staffSessionToken', response.staffSession.token);
      }
      this.enterProduct();
    } catch (error) {
      const message = getErrorMessage(error);
      this.setData({
        errorMessage: message.includes('getUserProfile:fail') ? '需要完成微信授权后才能使用。' : message,
      });
    } finally {
      this.setData({ loggingIn: false, checking: false });
    }
  },

  enterProduct() {
    wx.reLaunch({ url: '/pages/index/index' });
  },
});

function wechatLogin() {
  return new Promise<WechatMiniprogram.LoginSuccessCallbackResult>((resolve, reject) => {
    wx.login({ success: resolve, fail: reject });
  });
}

function prepareWechatLogin() {
  if (!prefetchedWechatLogin || Date.now() - prefetchedWechatLoginAt > 4 * 60 * 1000) {
    prefetchedWechatLoginAt = Date.now();
    prefetchedWechatLogin = wechatLogin().catch(() => null);
  }

  return prefetchedWechatLogin;
}

async function getPreparedWechatLogin() {
  const login = await prepareWechatLogin();
  prefetchedWechatLogin = null;
  prefetchedWechatLoginAt = 0;

  if (login?.code) {
    return login;
  }

  return wechatLogin();
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'errMsg' in error) {
    return String((error as { errMsg?: unknown }).errMsg || '微信登录失败，请稍后重试。');
  }
  return '微信登录失败，请稍后重试。';
}
