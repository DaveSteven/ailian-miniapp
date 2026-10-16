import { requestApi, uploadImage } from '../../utils/api';

type LocationValue = {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
};

const SERVICE_CATEGORIES = ['管道疏通', '开锁换锁', '家电维修', '家政保洁'];

type CategoryResponse = {
  categories: Array<{ id: string; code: string; name: string }>;
};

type MerchantPayload = {
  name: string;
  contactName: string;
  phone: string;
  contacts: Array<{ name: string; phone: string }>;
  merchantImageKeys?: string[];
  qualificationImageKeys?: string[];
  serviceCategory: string;
  tags: string[];
  address: string;
  longitude: number;
  latitude: number;
  coordinateSystem: 'gcj02';
  businessHours: string;
  note: string;
  source: 'field_staff';
  force?: boolean;
};

type ContactValue = {
  name: string;
  phone: string;
};

type SelectedImage = {
  path: string;
  size: number;
};

type DuplicateResponse = {
  merchants: Array<{ id: string; name: string; phone: string; address: string | null }>;
};

type CreateResponse = {
  merchant: { id: string; reviewStatus: 'pending'; createdAt: string };
};

type Staff = {
  id: string;
  name: string;
  role: 'field_agent' | 'reviewer' | 'admin';
};

type StaffMeResponse = {
  staff: Staff;
};

Page({
  data: {
    form: {
      name: '',
      addressDetail: '',
      serviceCategory: '',
      serviceTags: '',
      businessHours: '',
      note: '',
    },
    contacts: [{ name: '', phone: '' }] as ContactValue[],
    merchantImages: [] as SelectedImage[],
    qualificationImages: [] as SelectedImage[],
    categories: SERVICE_CATEGORIES,
    categoryIndex: -1,
    location: null as LocationValue | null,
    locating: false,
    submitting: false,
    submitStage: '提交商家资料',
    authChecking: true,
    authorized: false,
    staffName: '',
    authMessage: '',
  },

  async onLoad() {
    await this.restoreStaffSession();

    requestApi<CategoryResponse>({ path: '/services/categories' })
      .then((response) => {
        const categories = response.categories.map((category) => category.name);

        if (categories.length > 0) {
          this.setData({ categories });
        }
      })
      .catch(() => {
        // 本地默认分类可以保证后端暂时不可用时页面仍可录入。
      });
  },

  async restoreStaffSession() {
    this.setData({ authChecking: true, authMessage: '' });

    const cachedToken = String(wx.getStorageSync('staffSessionToken') || '');

    if (!cachedToken) {
      this.setData({ authChecking: false, authorized: false, authMessage: '当前账号没有地推权限，请返回设置页。' });
      return;
    }

    try {
      const response = await requestApi<StaffMeResponse>({ path: '/auth/me', auth: 'staff' });
      this.setAuthorizedStaff(response.staff);
    } catch {
      wx.removeStorageSync('staffSessionToken');
      this.setData({ authChecking: false, authorized: false, authMessage: '地推登录已失效，请重新进行微信授权登录。' });
    }
  },

  setAuthorizedStaff(staff: Staff) {
    this.setData({
      authChecking: false,
      authorized: true,
      staffName: staff.name,
      authMessage: '',
    });
  },

  onFieldInput(event: WechatMiniprogram.Input) {
    const field = event.currentTarget.dataset.field as string;

    this.setData({
      [`form.${field}`]: event.detail.value,
    });
  },

  onContactInput(event: WechatMiniprogram.Input) {
    const index = Number(event.currentTarget.dataset.index);
    const field = String(event.currentTarget.dataset.field) as keyof ContactValue;

    this.setData({
      [`contacts[${index}].${field}`]: event.detail.value,
    });
  },

  onAddContact() {
    if (this.data.contacts.length >= 10) {
      wx.showToast({ title: '负责人最多添加 10 位', icon: 'none' });
      return;
    }

    this.setData({
      contacts: [...this.data.contacts, { name: '', phone: '' }],
    });
  },

  onRemoveContact(event: WechatMiniprogram.TouchEvent) {
    if (this.data.contacts.length <= 1) return;
    const index = Number(event.currentTarget.dataset.index);
    this.setData({
      contacts: this.data.contacts.filter((_, itemIndex) => itemIndex !== index),
    });
  },

  onChooseMerchantImages() {
    this.chooseImages('merchant');
  },

  onChooseQualificationImages() {
    this.chooseImages('qualification');
  },

  chooseImages(kind: 'merchant' | 'qualification') {
    const current = kind === 'merchant' ? this.data.merchantImages : this.data.qualificationImages;
    const maxItems = kind === 'merchant' ? 5 : 20;
    const remaining = maxItems - current.length;

    if (remaining <= 0) {
      wx.showToast({ title: `最多上传 ${maxItems} 张`, icon: 'none' });
      return;
    }

    wx.chooseMedia({
      count: Math.min(9, remaining),
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (result) => {
        const selected = result.tempFiles.map((file) => ({
          path: file.tempFilePath,
          size: file.size,
        }));
        const key = kind === 'merchant' ? 'merchantImages' : 'qualificationImages';
        this.setData({ [key]: [...current, ...selected] });
      },
      fail: (error) => {
        if (error.errMsg.indexOf('cancel') < 0) {
          wx.showToast({ title: '选择图片失败，请重试', icon: 'none' });
        }
      },
    });
  },

  onPreviewImage(event: WechatMiniprogram.TouchEvent) {
    const kind = String(event.currentTarget.dataset.kind);
    const index = Number(event.currentTarget.dataset.index);
    const images = kind === 'merchant' ? this.data.merchantImages : this.data.qualificationImages;
    wx.previewImage({
      current: images[index].path,
      urls: images.map((image) => image.path),
    });
  },

  onRemoveImage(event: WechatMiniprogram.TouchEvent) {
    const kind = String(event.currentTarget.dataset.kind);
    const index = Number(event.currentTarget.dataset.index);
    const key = kind === 'merchant' ? 'merchantImages' : 'qualificationImages';
    const images = kind === 'merchant' ? this.data.merchantImages : this.data.qualificationImages;
    this.setData({ [key]: images.filter((_, itemIndex) => itemIndex !== index) });
  },

  onCategoryChange(event: WechatMiniprogram.PickerChange) {
    const categoryIndex = Number(event.detail.value);

    this.setData({
      categoryIndex,
      'form.serviceCategory': this.data.categories[categoryIndex],
    });
  },

  onUseCurrentLocation() {
    if (this.data.locating) {
      return;
    }

    this.setData({ locating: true });
    wx.chooseLocation({
      success: (result) => {
        this.setData({
          location: {
            name: result.name || '当前位置',
            address: result.address || '已获取当前位置，请补充详细地址',
            latitude: Number(result.latitude),
            longitude: Number(result.longitude),
          },
        });
      },
      fail: () => {
        wx.showToast({ title: '未选择地址', icon: 'none' });
      },
      complete: () => {
        this.setData({ locating: false });
      },
    });
  },

  onChooseLocation() {
    wx.chooseLocation({
      success: (result) => {
        this.setData({
          location: {
            name: result.name || '地图选点',
            address: result.address || '请补充详细地址',
            latitude: Number(result.latitude),
            longitude: Number(result.longitude),
          },
        });
      },
      fail: (error) => {
        if (error.errMsg.indexOf('cancel') < 0) {
          wx.showToast({ title: '地图选点失败，请重试', icon: 'none' });
        }
      },
    });
  },

  async onSubmit() {
    if (!this.data.authorized) {
      wx.showModal({
        title: '暂时无法提交',
        content: this.data.authMessage || '请先完成地推人员身份验证。',
        showCancel: false,
      });
      return;
    }

    const validationMessage = this.validateForm();

    if (validationMessage) {
      wx.showToast({ title: validationMessage, icon: 'none' });
      return;
    }

    if (this.data.submitting) return;

    const payload = this.buildPayload();
    this.setData({ submitting: true });

    try {
      const duplicateResult = await requestApi<DuplicateResponse, MerchantPayload>({
        method: 'POST',
        path: '/merchants/check-duplicate',
        auth: 'staff',
        data: payload,
      });

      if (duplicateResult.merchants.length > 0) {
        const first = duplicateResult.merchants[0];
        const shouldContinue = await confirmDuplicate(first.name, first.phone);

        if (!shouldContinue) return;
        payload.force = true;
      }

      this.setData({ submitStage: '正在上传图片…' });
      payload.merchantImageKeys = await Promise.all(
        this.data.merchantImages.map((image) => uploadImage(image.path, 'merchant')),
      );
      payload.qualificationImageKeys = await Promise.all(
        this.data.qualificationImages.map((image) => uploadImage(image.path, 'qualification')),
      );
      this.setData({ submitStage: '正在提交…' });

      const response = await requestApi<CreateResponse, MerchantPayload>({
        method: 'POST',
        path: '/merchants/',
        auth: 'staff',
        data: payload,
      });

      await showSuccess(response.merchant.id);
      wx.navigateBack({
        fail: () => wx.reLaunch({ url: '/pages/index/index' }),
      });
    } catch (error) {
      wx.showModal({
        title: '提交失败',
        content: error instanceof Error ? error.message : '服务暂时不可用，请稍后再试。',
        showCancel: false,
      });
    } finally {
      this.setData({ submitting: false, submitStage: '提交商家资料' });
    }
  },

  buildPayload(): MerchantPayload {
    const location = this.data.location as LocationValue;
    const form = this.data.form;
    const contacts = this.data.contacts.map((contact) => ({
      name: contact.name.trim(),
      phone: contact.phone.trim(),
    }));
    const tags = form.serviceTags
      .split(/[、,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean);

    return {
      name: form.name.trim(),
      contactName: contacts[0].name,
      phone: contacts[0].phone,
      contacts,
      serviceCategory: form.serviceCategory,
      tags,
      address: [location.address, form.addressDetail.trim()].filter(Boolean).join(' '),
      longitude: location.longitude,
      latitude: location.latitude,
      coordinateSystem: 'gcj02',
      businessHours: form.businessHours.trim(),
      note: form.note.trim(),
      source: 'field_staff',
    };
  },

  validateForm() {
    const form = this.data.form;

    if (!form.name.trim()) return '请填写商家名称';
    if (this.data.merchantImages.length < 1) return '请至少添加一张商家图片';

    for (const contact of this.data.contacts) {
      if (!contact.name.trim()) return '请填写每位负责人的姓名';
      if (!/^1\d{10}$/.test(contact.phone.trim())) return '请填写正确的负责人手机号';
    }

    if (!this.data.location) return '请选择商家位置';
    if (!form.addressDetail.trim()) return '请补充详细地址';
    if (!form.serviceCategory) return '请选择服务大类';

    return '';
  },
});

function confirmDuplicate(name: string, phone: string) {
  return new Promise<boolean>((resolve) => {
    wx.showModal({
      title: '发现疑似重复商家',
      content: `已有“${name}”（${maskPhone(phone)}），请确认是否仍要新增。`,
      cancelText: '返回检查',
      confirmText: '仍然新增',
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    });
  });
}

function showSuccess(merchantId: string) {
  return new Promise<void>((resolve) => {
    wx.showModal({
      title: '提交成功',
      content: `商家资料已进入审核。记录编号：${merchantId.slice(0, 8)}`,
      showCancel: false,
      success: () => resolve(),
      fail: () => resolve(),
    });
  });
}

function maskPhone(phone: string) {
  return phone.length === 11 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : phone;
}
