import { clearUserSession, getUserToken } from './user-session';

const TEST_API_BASE_URL = 'https://test-api.ailian.help/api/v1';

function getApiBaseUrl() {
  return TEST_API_BASE_URL;
}

type RequestBody = string | WechatMiniprogram.IAnyObject | ArrayBuffer;

type RequestOptions<TBody extends RequestBody> = {
  method?: 'GET' | 'POST';
  path: string;
  data?: TBody;
  auth?: 'user' | 'staff' | 'none';
};

export function requestApi<TResponse, TBody extends RequestBody = WechatMiniprogram.IAnyObject>(
  options: RequestOptions<TBody>,
): Promise<TResponse> {
  const auth = options.auth || 'user';
  const token = auth === 'staff' ? getStaffToken() : auth === 'user' ? getUserToken() : '';

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${getApiBaseUrl()}${options.path}`,
      method: options.method || 'GET',
      data: options.data,
      header: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as TResponse);
          return;
        }

        if (res.statusCode === 401) {
          if (auth === 'staff') wx.removeStorageSync('staffSessionToken');
          if (auth === 'user') clearUserSession();
        }

        reject(normalizeRequestError(res.data));
      },
      fail(error) {
        reject(new Error(error.errMsg || '网络请求失败'));
      },
    });
  });
}

type UploadCategory = 'merchant' | 'qualification';

type UploadAuthorization = {
  upload: {
    mode: 'server';
  } | {
    mode: 'oss';
    url: string;
    key: string;
    formData: Record<string, string>;
    expiresAt: string;
  };
};

export async function uploadImage(filePath: string, category: UploadCategory): Promise<string> {
  const contentType = getImageContentType(filePath);
  const authorization = await requestApi<UploadAuthorization>({
    method: 'POST',
    path: '/uploads/images/presign',
    data: { contentType, category },
    auth: 'staff',
  });

  if (authorization.upload.mode === 'server') {
    return uploadImageFile(`${getApiBaseUrl()}/uploads/images`, filePath, undefined, true);
  }

  return uploadImageFile(
    authorization.upload.url,
    filePath,
    authorization.upload.formData,
    false,
  ).then(() => authorization.upload.mode === 'oss' ? authorization.upload.key : '');
}

function uploadImageFile(
  url: string,
  filePath: string,
  formData: Record<string, string> | undefined,
  includeAuthorization: boolean,
): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url,
      filePath,
      name: 'file',
      formData,
      header: includeAuthorization
        ? { authorization: `Bearer ${getStaffToken()}` }
        : undefined,
      success(res) {
        let data: unknown = res.data;

        try {
          data = JSON.parse(res.data);
        } catch {
          // 非 JSON 响应会交给统一错误处理。
        }

        if (!includeAuthorization && res.statusCode >= 200 && res.statusCode < 300) {
          resolve('');
          return;
        }

        if (includeAuthorization && res.statusCode >= 200 && res.statusCode < 300) {
          const key = (data as { image?: { key?: string } })?.image?.key;

          if (key) {
            resolve(key);
            return;
          }
        }

        if (res.statusCode === 401) {
          wx.removeStorageSync('staffSessionToken');
        }

        reject(normalizeRequestError(data));
      },
      fail(error) {
        reject(new Error(error.errMsg || '图片上传失败'));
      },
    });
  });
}

function getImageContentType(filePath: string) {
  const normalized = filePath.toLowerCase().split('?')[0];

  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function getStaffToken() {
  return String(wx.getStorageSync('staffSessionToken') || '');
}

function normalizeRequestError(data: unknown) {
  if (data && typeof data === 'object' && 'error' in data) {
    const error = (data as { error?: { message?: string } }).error;

    return new Error(error && error.message ? error.message : '请求失败');
  }

  return new Error('请求失败');
}
