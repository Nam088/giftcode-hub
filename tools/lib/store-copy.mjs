/**
 * Localised copy and tab states for the store artwork.
 *
 * Kept separate from layout code so adding a locale or tweaking copy
 * happens in one place, preventing half-translated assets.
 */

export const LOCALES = ['en', 'vi'];

export const FOOTNOTE = {
  en: '100% on-device • No accounts required • Zero tracking • Open source',
  vi: '100% trên máy bạn • Không cần tài khoản • Không thu thập dữ liệu • Mã nguồn mở',
};

export const SLIDES = [
  {
    file: '01-batch-redeem.png',
    tab: 'redeem',
    site: 'df_garena',
    mockData: {
      account: 'Ghost_Operator#9812',
      draft: 'DFharbor738\nTrickOrTreat\nWELCOMETODF\nTACTICAL2026\nDELTAOCTOBER',
      progress: { current: 3, total: 5, status: 'running' },
    },
    copy: {
      en: {
        eyebrow: 'Batch Code Redemption',
        headline: 'Redeem in Bulk.\nZero Manual Hassle.',
        body: 'Queue dozens of gift codes and redeem them in seconds with automatic retry and rate-limit protection.',
        bullets: [
          'Queue unlimited codes with one-click clipboard paste',
          'Adjustable cooldown delay to avoid server rate limits',
          'Real-time status indicators and instant visual feedback',
        ],
      },
      vi: {
        eyebrow: 'Nhập code hàng loạt',
        headline: 'Nhập hàng chục code.\nHoàn toàn tự động.',
        body: 'Dán danh sách mã quà tặng và để tiện ích tự động gửi từng mã với cơ chế chống nghẽn thông minh.',
        bullets: [
          'Nhập hàng loạt chỉ với 1 cú click dán từ clipboard',
          'Khoảng cách thời gian tuỳ chỉnh tránh khóa tài khoản',
          'Thanh tiến độ thời gian thực hiển thị kết quả ngay lập tức',
        ],
      },
    },
  },
  {
    file: '02-multi-server.png',
    tab: 'redeem',
    site: 'df_global',
    mockData: {
      account: 'GlobalViper_77',
      draft: 'GLOBALGIFT01\nVICTORYDAY\nELITEFORCE',
      progress: null,
    },
    copy: {
      en: {
        eyebrow: 'Multi-Server & Games',
        headline: 'Delta Force Garena\n& Global Support.',
        body: 'Seamlessly switch between Delta Force Garena and Global servers with independent queues and history.',
        bullets: [
          'Dedicated endpoints for Garena & Level Infinite / Global',
          'Separate drafts, known code caches, and session tracking',
          'Auto-detects logged-in character names and IDs',
        ],
      },
      vi: {
        eyebrow: 'Đa cụm máy chủ & game',
        headline: 'Hỗ trợ Delta Force\nGarena & Global.',
        body: 'Chuyển đổi linh hoạt giữa các máy chủ Garena và Global với hàng đợi và lịch sử hoàn toàn tách biệt.',
        bullets: [
          'Tích hợp chuẩn cổng đổi quà Garena & Level Infinite',
          'Hàng đợi, bộ nhớ mã đã dùng và phiên làm việc riêng biệt',
          'Tự động nhận diện nhân vật và UID đã đăng nhập',
        ],
      },
    },
  },
  {
    file: '03-results-breakdown.png',
    tab: 'results',
    site: 'df_garena',
    mockData: {
      items: [
        { code: 'DFharbor738', status: 'success', text: 'M4A1 Weapon Skin x1 + 5000 Coins' },
        { code: 'TrickOrTreat', status: 'used', text: 'Reward has already been collected' },
        { code: 'WELCOMETODF', status: 'success', text: 'Operator Ticket x3' },
        { code: 'EXPIRED999', status: 'invalid', text: 'Redemption code has expired' },
      ],
    },
    copy: {
      en: {
        eyebrow: 'Real-Time Results',
        headline: 'Detailed Feedback.\nZero Guesswork.',
        body: 'Transparent status reporting for every single code: success, already claimed, expired, or invalid.',
        bullets: [
          'Clear visual status badges: Success, Used, Invalid, Cooldown',
          'Exact server responses and reward details displayed',
          'Filter and review skipped or flagged codes with ease',
        ],
      },
      vi: {
        eyebrow: 'Kết quả chi tiết',
        headline: 'Báo cáo minh bạch.\nKhông lo nhầm lẫn.',
        body: 'Phân loại chính xác từng mã: thành công, đã nhận trước đó, hết hạn hoặc không hợp lệ.',
        bullets: [
          'Huy hiệu trạng thái trực quan: Thành công, Đã dùng, Không hợp lệ',
          'Hiển thị trọn vẹn thông báo phản hồi từ máy chủ game',
          'Lọc và kiểm tra lại danh sách mã cần xử lý chỉ với 1 nút bấm',
        ],
      },
    },
  },
  {
    file: '04-history-export.png',
    tab: 'history',
    site: 'df_garena',
    mockData: {
      stats: { total: 42, success: 38, used: 4 },
    },
    copy: {
      en: {
        eyebrow: 'History & Backup',
        headline: 'Complete Audit Trail.\nExport Anytime.',
        body: 'Never lose track of your redeemed codes. Export your entire history to JSON or CSV for easy sharing.',
        bullets: [
          'Lifetime statistics: total codes, success rate, and claimed rewards',
          'One-click export to structured JSON or CSV spreadsheets',
          'Full backup and restore of your settings and known codes',
        ],
      },
      vi: {
        eyebrow: 'Lịch sử & sao lưu',
        headline: 'Lưu vết toàn diện.\nXuất file dễ dàng.',
        body: 'Theo dõi toàn bộ lịch sử các mã đã từng nhập. Xuất báo cáo sang định dạng JSON hoặc CSV bất cứ lúc nào.',
        bullets: [
          'Thống kê trọn đời: tổng số mã, tỷ lệ thành công và mốc thời gian',
          'Xuất nhanh danh sách sang file bảng tính CSV hoặc JSON',
          'Sao lưu và khôi phục cài đặt cùng bộ nhớ mã 1 chạm',
        ],
      },
    },
  },
  {
    file: '05-tactical-settings.png',
    tab: 'settings',
    site: 'df_garena',
    mockData: {},
    copy: {
      en: {
        eyebrow: 'Tactical Controls',
        headline: 'Highly Customizable.\n100% On-Device.',
        body: 'Fine-tune queue delays, automate daily public feed syncs, and toggle security preferences locally.',
        bullets: [
          'Full bilingual English and Vietnamese localization',
          'Auto-fetch the latest community codes from public feeds',
          'Zero tracking, no telemetry, and 100% local storage',
        ],
      },
      vi: {
        eyebrow: 'Tuỳ biến linh hoạt',
        headline: 'Tinh chỉnh dễ dàng.\nBảo mật trên máy.',
        body: 'Điều chỉnh thời gian chờ, tự động đồng bộ code mới mỗi ngày từ cộng đồng và lưu trữ bảo mật cục bộ.',
        bullets: [
          'Giao diện song ngữ Anh - Việt bản ngữ hoàn chỉnh',
          'Tự động lấy danh sách code mới nhất từ nguồn cấp cộng đồng',
          'Không theo dõi, không gửi dữ liệu ra ngoài, lưu 100% trên máy',
        ],
      },
    },
  },
];

export const SMALL_PROMO_COPY = {
  en: {
    tagline: 'Batch redeem gift codes for Delta Force & games. Fast, secure, on-device.',
    trust: '100% On-Device',
  },
  vi: {
    tagline: 'Tự động nhập giftcode hàng loạt cho Delta Force. Nhanh chóng, 100% trên máy.',
    trust: '100% trên máy bạn',
  },
};

export const MARQUEE_COPY = {
  en: {
    headline: 'Batch Redeem Gift Codes.',
    headlineAccent: 'Fast, automated & on-device.',
    body: 'Stop typing codes one by one. Queue, test, and redeem all your public promo codes in seconds with smart rate-limiting and full history tracking.',
    marks: ['100% On-Device', 'Zero Tracking', 'Open Source'],
  },
  vi: {
    headline: 'Tự động nhập giftcode hàng loạt.',
    headlineAccent: 'Nhanh chóng & bảo mật trên máy.',
    body: 'Không còn phải nhập từng mã thủ công. Quản lý hàng đợi, kiểm tra và nhập toàn bộ giftcode chỉ trong tích tắc với cơ chế chống nghẽn và ghi lịch sử chi tiết.',
    marks: ['100% trên máy bạn', 'Không thu thập dữ liệu', 'Mã nguồn mở'],
  },
};

export function assertLocaleCoverage() {
  for (const locale of LOCALES) {
    if (!FOOTNOTE[locale]) {
      throw new Error(`Missing FOOTNOTE for locale "${locale}"`);
    }
    if (!SMALL_PROMO_COPY[locale]) {
      throw new Error(`Missing SMALL_PROMO_COPY for locale "${locale}"`);
    }
    if (!MARQUEE_COPY[locale]) {
      throw new Error(`Missing MARQUEE_COPY for locale "${locale}"`);
    }
    for (const slide of SLIDES) {
      if (!slide.copy[locale]) {
        throw new Error(`Missing copy in slide "${slide.file}" for locale "${locale}"`);
      }
    }
  }
}
