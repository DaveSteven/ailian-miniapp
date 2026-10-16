import { getCachedUser } from '../../utils/user-session';

Page({
  data: {
    nickname: getCachedUser()?.nickname || '微信用户',
    avatarUrl: getCachedUser()?.avatarUrl || '',
    initial: (getCachedUser()?.nickname || '微').slice(0, 1),
    phone: getCachedUser()?.phone || '',
    isStaff: Boolean(getCachedUser()?.isStaff),
  },

  onShow() {
    const user = getCachedUser();
    if (!user) return;
    this.setData({
      nickname: user.nickname,
      avatarUrl: user.avatarUrl || '',
      initial: user.nickname.slice(0, 1) || '微',
      phone: user.phone || '',
      isStaff: Boolean(user.isStaff),
    });
  },

  onOpenMerchantEntry() {
    wx.navigateTo({ url: '/pages/merchant-entry/index' });
  },
});
