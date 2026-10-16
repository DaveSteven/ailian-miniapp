export type AppUser = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  phone: string | null;
  isStaff: boolean;
};

const USER_TOKEN_KEY = 'userSessionToken';
const USER_PROFILE_KEY = 'appUserProfile';

export function getUserToken() {
  return String(wx.getStorageSync(USER_TOKEN_KEY) || '');
}

export function saveUserSession(token: string, user: AppUser) {
  wx.setStorageSync(USER_TOKEN_KEY, token);
  wx.setStorageSync(USER_PROFILE_KEY, user);
}

export function clearUserSession() {
  wx.removeStorageSync(USER_TOKEN_KEY);
  wx.removeStorageSync(USER_PROFILE_KEY);
}

export function getCachedUser(): AppUser | null {
  const value = wx.getStorageSync(USER_PROFILE_KEY) as AppUser | undefined;
  return value && value.id ? value : null;
}
