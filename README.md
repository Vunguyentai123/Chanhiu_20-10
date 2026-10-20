# Chanh iu · 20/10

Thiệp chúc mừng 20/10 tương tác 3D, thiết kế mobile-first (390 × 844), chạy hoàn toàn phía client. Ba cảnh nối tiếp nhau:

1. **Bó hoa** — chạm để 6 bông hồng lần lượt hoá thành ảnh, ấn giữ ~0.95 giây để bó hoa sáng lên rồi tan vào không gian neon.
2. **Không gian neon** — các dòng chữ hồng phát sáng, thẻ ảnh trôi, tim đỏ và sao; kéo để ngắm, chạm vào thẻ ảnh để mở lightbox.
3. **Phong bì & lá thư** — chạm phong bì, dấu sáp nứt, nắp mở 3D, lá thư trượt lên; nút ✕ quay lại cảnh neon (hoặc bó hoa, tuỳ cấu hình).

Nhạc nền bắt đầu ở lần chạm đầu tiên, tự lặp và có nút tắt/bật ở góc trên.

## Công nghệ

- Vite 7 + TypeScript
- Three.js (cảnh bó hoa và neon)
- GSAP (chuyển cảnh, phong bì, thư)
- CSS thuần cho phong bì/lá thư
- Font local: Cormorant Garamond, Quicksand, Dancing Script, Charm (đủ dấu tiếng Việt)

## Chạy dự án

Yêu cầu Node.js 18+.

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # kiểm tra TypeScript + build vào dist/
npm run preview   # xem thử bản build
```

## Cấu trúc

```text
├─ public/
│  ├─ assets/
│  │  ├─ bouquet.png          # bó hoa (PNG nền trong suốt)
│  │  ├─ corner-left.png      # hoa trang trí trái-dưới
│  │  └─ corner-right.png     # hoa trang trí phải-trên
│  ├─ audio/music.mp3         # nhạc nền (file demo)
│  ├─ photos/1.jpg … 6.jpg    # 6 ảnh dùng trong bó hoa và cảnh neon
│  └─ favicon.svg
├─ src/
│  ├─ config.ts               # TOÀN BỘ nội dung có thể sửa
│  ├─ main.ts                 # khởi động, chuyển cảnh, input, auto-open
│  ├─ core/                   # âm thanh, asset URL, starfield, stage
│  ├─ scenes/                 # bouquet, neon, envelope
│  ├─ ui/ui.ts                # loader, HUD, caption, lightbox
│  ├─ assets/                 # paper-grain + font local
│  ├─ styles.css
│  └─ fonts.css
├─ index.html
├─ vite.config.ts
└─ package.json
```

`dist/` là kết quả build và đã được gitignore, không cần commit lên repo.

## Cá nhân hoá nội dung

Mọi câu chữ nằm trong [`src/config.ts`](src/config.ts). Chỉ cần sửa file này và thay file trong `public/` là đủ.

| Khoá | Ý nghĩa |
| --- | --- |
| `recipientName` | Tên người nhận, dùng khi bạn tự viết caption có tên. |
| `photos` | Mảng 6 ảnh cho bó hoa và các thẻ trôi. |
| `portraitCutout` | Ảnh ở góc dưới-phải lá thư (khung polaroid), mặc định `/photos/6.jpg`. |
| `music` | Đường dẫn nhạc nền. Đặt `""` để tắt hoàn toàn. |
| `neonPhrases` | Các câu chữ neon; được lặp ngẫu nhiên trong không gian. |
| `captions` | Danh sách caption `{ at, text }`; `at` tính bằng giây từ lúc cảnh neon bắt đầu. Câu cuối giữ đến cuối. |
| `hints` | Bốn câu gợi ý: `bouquet1`, `bouquet2`, `neon`, `envelope`. |
| `envelope` | Chữ trên phong bì: `to`, `date`, `sub`. |
| `sealText` | Chữ trên dấu sáp (mặc định `Love`). |
| `letter.title` | Tiêu đề lá thư (font script). |
| `letter.body` | Mảng đoạn văn; mỗi câu fade-in lần lượt. Có thể viết dài, thư sẽ cuộn. |
| `autoOpenEnvelopeAfterMs` | Tự mở phong bì sau bao nhiêu ms ở cảnh neon. `0` = tắt. |
| `closeLetterTo` | `"neon"` hoặc `"bouquet"` — nơi quay về khi đóng thư. |
| `performance` | Giới hạn DPR, số chữ neon, sao, tim, thẻ ảnh. |

### 1. Thay 6 ảnh trong bó hoa

Thay các file `public/photos/1.jpg` … `6.jpg` (giữ nguyên tên), hoặc sửa mảng `config.photos`.

- Nên dùng ảnh dọc tỉ lệ **3:4**, JPG/WebP, dung lượng dưới ~300 KB/ảnh.
- Ảnh được cắt **cover** trong khung oval ở bó hoa và khung chữ nhật ở cảnh neon, nên chủ thể chính nên nằm giữa ảnh.
- Có thể dùng URL `https://...`, nhưng nên đặt ảnh local để tránh lỗi CORS khi vẽ ảnh vào canvas.
- Vị trí: 1–3 hàng trên (trái, giữa, phải), 4–5 hàng giữa, 6 là ảnh lớn giữa-dưới.

### 2. Thay ảnh trên lá thư

Sửa `config.portraitCutout` (mặc định `/photos/6.jpg`). Ảnh được đặt ở góc dưới-phải lá thư trong khung polaroid nghiêng nhẹ.

- Ảnh dọc sẽ hợp nhất; chủ thể nên nằm giữa khung.
- Muốn dùng ảnh khác, đặt file vào `public/photos/` rồi đổi đường dẫn trong config.
- Muốn bỏ ảnh, đặt `portraitCutout: ""` và ẩn `.letter-portrait` trong `src/styles.css` nếu cần.

### 3. Thay bó hoa và hoa trang trí

- `public/assets/bouquet.png`: PNG nền trong suốt, nội dung bó hoa đặt giữa khung, tỉ lệ gần 810 × 960.
- `public/assets/corner-left.png`, `corner-right.png`: các cụm hoa cắt nền dùng cho phong bì và lá thư. Có thể thay bằng cụm hoa khác cùng tông hồng/kem; giữ nền trong suốt và mép mờ tự nhiên.
- Dấu sáp được vẽ bằng CSS (không phải ảnh); đổi chữ bằng `config.sealText`.

### 4. Thay nhạc nền

Thay `public/audio/music.mp3` bằng bản nhạc bạn có quyền sử dụng.

- Nhạc tự lặp, bắt đầu ở lần chạm/click đầu tiên (đúng chính sách autoplay của trình duyệt).
- Âm lượng tăng dần đến 0.55; tự giảm nhẹ khi mở lightbox/thư.
- File demo đi kèm dài ~42 giây, chỉ để thử nghiệm.
- Có thể dùng `.ogg`/`.m4a`; nhớ sửa `config.music` cho khớp tên file.

### 5. Sửa lời chúc

- `config.neonPhrases`: các câu neon. Nên dùng câu ngắn (dưới ~45 ký tự) để chữ không bị cắt quá nhiều ở gần camera.
- `config.captions`: caption hiển thị dưới màn hình; câu cuối được giữ lâu hơn.
- `config.letter.*`: tiêu đề và các đoạn thư. Không dùng lời bài hát có bản quyền.

## Hành vi & tương tác

- **Chạm bó hoa** (hoặc bất kỳ đâu trên sân khấu) để lần lượt hiện 6 ảnh; mỗi lần có ripple và caption đổi theo nhịp.
- **Ấn giữ** sau khi đủ 6 ảnh (~0.95 giây) để kích hoạt chuyển cảnh mềm sang không gian neon.
- **Cảnh neon**: kéo chuột/ngón tay để xoay nhẹ không gian (có quán tính); chạm vào thẻ ảnh để mở lightbox; `Esc`, nút ✕ hoặc chạm nền để đóng.
- **Phong bì**: chạm phong bì hoặc dấu sáp. Sau khi mở, cuộn lá thư nếu nội dung dài. Nút ✕ đóng và quay về `closeLetterTo`.
- **Tự mở phong bì** sau 20 giây ở cảnh neon; nếu lightbox đang mở, hẹn lại sau khi đóng.
- Nút loa có `aria-label` và `aria-pressed` thay đổi theo trạng thái.

## Hiệu năng & accessibility

- `devicePixelRatio` bị giới hạn ở 2.
- Chữ neon dùng sprite + canvas texture (không tạo hàng trăm DOM node), glow vẽ sẵn trong texture thay vì post-processing.
- Số lượng hạt/chữ/thẻ giới hạn trong `config.performance`.
- `prefers-reduced-motion`: giảm số hạt, bỏ hiệu ứng chuyển cảnh nặng, tắt hiệu ứng thở/lơ lửng của bó hoa, hiện chữ thư ngay.
- Nút bấm có nhãn ARIA; lightbox có role dialog; hỗ trợ bàn phím cho phong bì/thư.
- Không có cuộn ngang ở viewport 390 × 844.

## Deploy

### Vercel

- Import repo, framework **Vite**.
- Build command: `npm run build`
- Output directory: `dist`
- Không cần commit `dist/` hay `node_modules/`.

### Netlify

- Build command: `npm run build`
- Publish directory: `dist`
- Hoặc kéo thả thư mục `dist` vào Netlify Drop.

### GitHub Pages

Dự án đã đặt `base: "./"` và chuẩn hoá đường dẫn asset trong `src/core/assets.ts`, nên chạy đúng cả ở thư mục con dạng `https://<user>.github.io/<repo>/`.

Workflow có sẵn tại `.github/workflows/deploy.yml`:

1. Push code lên nhánh `main`.
2. Vào **Settings → Pages → Build and deployment → Source**, chọn **GitHub Actions** (không chọn "Deploy from a branch").
3. Mỗi lần push, GitHub Actions sẽ chạy `npm ci`, `npm run build` và deploy thư mục `dist/`.

Nếu dùng tên miền riêng, thêm file `public/CNAME` chứa đúng tên miền (ví dụ `thiep20-10.com`) để Vite copy vào `dist/` khi build, rồi khai báo domain trong **Settings → Pages → Custom domain**.

> Không cần server rewrite vì site chỉ có một trang.

## Ghi chú kỹ thuật

- Ảnh neon được dựng lại sau `document.fonts.ready` để texture canvas hiển thị đúng dấu tiếng Việt.
- Nếu thay font, cập nhật `src/fonts.css` và các biến `--font-serif`, `--font-neon`, `--font-script`, `--font-hand` trong `src/styles.css`.
- Trên desktop, site hiển thị trong khung dọc 430 px căn giữa; trên mobile, sân khấu phủ toàn màn hình.
- Nếu bó hoa/ảnh mới có bố cục khác, có thể chỉnh `BOUQUET_WIDTH_RATIO` trong `src/scenes/bouquet.ts` (mặc định 0.5 — khoảng 50% chiều ngang màn hình 390 px).

---

Chỉ sử dụng hình ảnh, nhạc và nội dung mà bạn có quyền chia sẻ. Chúc bạn gửi được một món quà thật dịu dàng. ♡
