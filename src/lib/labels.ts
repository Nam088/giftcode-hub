import type { ItemStatus, PauseReason } from './job';

export type Tone = 'accent' | 'danger' | 'warn' | 'info' | 'muted';

export const STATUS_LABEL: Record<ItemStatus, string> = {
  pending: 'Chờ',
  inFlight: 'Đang gửi',
  unknown: 'Cần kiểm tra',
  success: 'Thành công',
  invalid: 'Không hợp lệ',
  used: 'Đã dùng',
  expired: 'Hết hạn',
};

export const STATUS_TONE: Record<ItemStatus, Tone> = {
  pending: 'muted',
  inFlight: 'info',
  unknown: 'warn',
  success: 'accent',
  invalid: 'danger',
  used: 'muted',
  expired: 'danger',
};

export const PAUSE_LABEL: Record<PauseReason, string> = {
  user: 'Đã tạm dừng',
  login_required: 'Cần đăng nhập lại trên trang redeem',
  captcha: 'Trang yêu cầu captcha, hãy xử lý thủ công rồi chạy tiếp',
  rate_limited: 'Trang đang giới hạn tốc độ, hãy chờ rồi chạy tiếp',
  needs_review: 'Có kết quả cần kiểm tra trong tab Kết quả',
  tab_lost: 'Mất kết nối với tab redeem, hãy mở hoặc tải lại trang',
  tab_hidden: 'Tab redeem đang bị ẩn, hãy chuyển sang tab đó',
  error: 'Có lỗi xảy ra',
};

/** Display order for result filters and counters. */
export const STATUS_ORDER: readonly ItemStatus[] = [
  'success',
  'used',
  'invalid',
  'expired',
  'unknown',
  'pending',
];
