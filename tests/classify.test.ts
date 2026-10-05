import { describe, expect, it } from 'vitest';
import { SITES } from '@/lib/sites';
import { classify } from '@/lib/sites/classify';

describe.each(SITES.map((site) => [site.id, site] as const))('%s result rules', (_id, site) => {
  it.each([
    ['Đã nhận thành công! Vui lòng kiểm tra hộp thư trong game của bạn.', 'success'],
    ['Successfully claimed! Please check your in-game mail.', 'success'],
    ['Erfolgreich abgeholt! Bitte überprüfe deine Post im Spiel.', 'success'],
    ['CDKey đã nhập không hợp lệ. Vui lòng thử lại.', 'invalid'],
    ['The CDKey entered is not valid. Please try again.', 'invalid'],
    ['error_hint_400073', 'invalid'],
    ['CD key pack configuration error.', 'invalid'],
    ['Xin lỗi, tài khoản của bạn không thể đổi thêm CDKey của gói quà này.', 'used'],
    ['You have already claimed this reward.', 'used'],
    ['error_hint_400072', 'used'],
    ['error_hint_400068', 'used'],
    ['error_hint_51104', 'used'],
    ['error_hint_400070', 'expired'],
    ['This CD key redemption period ended.', 'expired'],
  ])('classifies %s as %s', (message, status) => {
    expect(classify(site, message)).toBe(status);
  });

  it.each([
    'Lỗi mạng, vui lòng thử lại sau',
    'Network error. Please try again later.',
    'error_hint_400069',
  ])('treats %s as unknown so the job pauses', (message) => {
    expect(classify(site, message)).toBe('unknown');
  });

  it('accepts codes with letters, digits and dashes', () => {
    expect(site.codeFormat.test('ABCD1234')).toBe(true);
    expect(site.codeFormat.test('ABCD-1234-EFGH')).toBe(true);
    expect(site.codeFormat.test('AB CD')).toBe(false);
  });
});
