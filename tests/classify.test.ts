import { describe, expect, it } from 'vitest';
import { classify } from '@/lib/sites/classify';
import { garenaDf } from '@/lib/sites/garenaDf';

describe('garenaDf result rules', () => {
  it.each([
    ['Đã nhận thành công! Vui lòng kiểm tra hộp thư trong game của bạn.', 'success'],
    ['Successfully claimed! Please check your in-game mail.', 'success'],
    ['CDKey đã nhập không hợp lệ. Vui lòng thử lại.', 'invalid'],
    ['Xin lỗi, tài khoản của bạn không thể đổi thêm CDKey của gói quà này.', 'used'],
    ['error_hint_400072', 'used'],
    ['error_hint_400068', 'used'],
    ['error_hint_400070', 'expired'],
  ])('classifies %s as %s', (message, status) => {
    expect(classify(garenaDf, message)).toBe(status);
  });

  it.each([
    'Lỗi mạng, vui lòng thử lại sau',
    'Rất tiếc, bạn chưa nhận được quyền chơi thử.',
    'error_hint_400069',
    'error_hint_400073',
  ])('treats %s as unknown so the job pauses', (message) => {
    expect(classify(garenaDf, message)).toBe('unknown');
  });

  it('accepts codes with letters, digits and dashes', () => {
    expect(garenaDf.codeFormat.test('ABCD1234')).toBe(true);
    expect(garenaDf.codeFormat.test('ABCD-1234-EFGH')).toBe(true);
    expect(garenaDf.codeFormat.test('AB CD')).toBe(false);
  });
});
