/**
 * ─────────────────────────────────────────────────────────────
 *  TOÀN BỘ NỘI DUNG CỦA THIỆP NẰM Ở FILE NÀY.
 *  Chỉ cần sửa file này + thay ảnh trong /public/photos + nhạc trong
 *  /public/audio là đủ để cá nhân hoá tấm thiệp.
 * ─────────────────────────────────────────────────────────────
 */
export const config = {
  /** Tên người nhận — dùng khi bạn muốn tự viết caption có tên. */
  recipientName: "Em",

  /**
   * 10 ảnh dùng trong thiệp:
   * - 1–6: bó hoa (3 ảnh hàng trên, 2 ảnh hàng giữa, 1 ảnh lớn giữa-dưới).
   * - 1–10: các thẻ ảnh trôi trong không gian neon.
   * Đặt file trong /public/photos.
   */
  photos: [
    "/photos/1.webp",
    "/photos/2.webp",
    "/photos/3.webp",
    "/photos/4.webp",
    "/photos/5.webp",
    "/photos/6.webp",
    "/photos/7.webp",
    "/photos/8.webp",
    "/photos/9.webp",
    "/photos/10.webp",
  ],

  /** Ảnh đặt ở góc dưới-phải lá thư (hiển thị trong khung polaroid). */
  portraitCutout: "/photos/6.webp",

  /**
   * Nhạc nền (loop). Bỏ trống "" nếu không muốn phát nhạc.
   * Tăng ?v=... mỗi khi thay file để điện thoại không dùng bản cache cũ.
   */
  music: "/audio/music.mp3?v=2",

  /** Các dòng chữ neon trôi trong không gian (lặp ngẫu nhiên). */
  neonPhrases: [
    "Chúc em luôn yêu đời",
    "Chúc em luôn vui vẻ và hạnh phúc",
    "Chúc em luôn xinh đẹp",
    "Chúc em thật nhiều may mắn",
    "Mong mọi điều dịu dàng sẽ đến với em",
    "mãi yêu em",
    "yêu em",
    "20/10",
    "Chúc mừng ngày Phụ nữ Việt Nam",
    "Chúc em một ngày thật dịu dàng",
    "Mong em luôn được yêu thương",
    "Mong nụ cười em luôn ở lại",
    "Chúc em luôn tự tin và tỏa sáng",
    "Anh thương em nhiều lắm",
    "Mỗi ngày có em là một ngày vui",
    "Chúc em một đời bình an",
  ],

  /**
   * Caption 2 dòng hiện dưới màn hình, đổi theo thời gian (giây).
   * `at` tính từ lúc cảnh neon bắt đầu. Câu cuối được giữ tới cuối.
   * Gợi ý: dùng câu của riêng bạn, đừng dùng lời bài hát có bản quyền.
   */
  captions: [
    { at: 0, text: "Anh luôn ở đây bên em" },
    { at: 6, text: "Mỗi ngày bên em đều là món quà" },
    { at: 12, text: "Anh thương em" },
    { at: 18, text: "Một chút yêu thương, gửi riêng em" },
  ],

  /** Câu gợi ý trên màn hình. */
  hints: {
    bouquet1: "Chạm vào bó hoa",
    bouquet2: "Ấn giữ bó hoa",
    neon: "Kéo để xoay 360°, bấm vô ảnh để xem ảnh",
    envelope: "Chạm phong bì để mở thư",
  },

  /** Chữ in trên phong bì. */
  envelope: {
    to: "Dành tặng em",
    date: "20/10",
    sub: "Một chút yêu thương",
  },

  /** Chữ chạm nổi trên dấu sáp đỏ. */
  sealText: "Love",

  /** Nội dung lá thư. */
  letter: {
    title: "Gửi Chanh iu của anh ♡",
    body: [
      "Anh chúc em ngày 20/10 lúc nào cũng xinh đẹp, may mắn, nhiều sức khỏe và lúc nào cũng vui vẻ. Anh mong rằng em sẽ đồng hành cùng anh trên chặng đường phía trước.",
      "Anh yêu em",
    ],
  },

  /** Tự động mở phong bì sau bao nhiêu ms ở cảnh neon (0 = tắt). */
  autoOpenEnvelopeAfterMs: 20000,

  /** Đóng thư thì quay lại cảnh nào: "neon" hoặc "bouquet". */
  closeLetterTo: "neon" as "neon" | "bouquet",

  /** Cài đặt hiệu năng / mỹ thuật (thường không cần sửa). */
  performance: {
    maxPixelRatio: 2,
    maxNeonPhrases: 96,
    maxStars: 520,
    maxHearts: 90,
    maxPhotoCards: 20,
  },
};

export type Caption = (typeof config.captions)[number];
