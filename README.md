# Chanh iu · 20/10

Thiệp chúc mừng 20/10 tương tác 3D, thiết kế mobile-first (390 × 844), chạy hoàn toàn phía client. Ba cảnh nối tiếp nhau:

1. **Bó hoa** — chạm để 6 bông hồng lần lượt hoá thành ảnh, ấn giữ ~0.95 giây để bó hoa sáng lên rồi tan vào không gian neon.
2. **Không gian neon** — cụm chữ hồng phát sáng, các thẻ ảnh từ 10 bức ảnh, tim đỏ và sao xếp thành nhiều lớp; kéo để bay quanh không gian 360°, chạm vào thẻ ảnh để mở lightbox.
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
│  │  ├─ bouquet.webp         # bó hoa (WebP nền trong suốt)
│  │  ├─ corner-left.webp     # hoa trang trí trái-dưới
│  │  └─ corner-right.webp    # hoa trang trí phải-trên
│  ├─ audio/music.mp3         # nhạc nền (file demo)
│  ├─ photos/1.webp … 10.webp # 1–6 cho bó hoa, cả 10 ảnh cho cảnh neon
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
| `photos` | Mảng 10 ảnh: 1–6 dùng cho bó hoa, cả 10 ảnh dùng cho các thẻ trong không gian neon. |
| `portraitCutout` | Ảnh ở góc dưới-phải lá thư (khung polaroid), mặc định `/photos/6.webp`. |
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

### 1. Thay 10 ảnh trong bó hoa và không gian neon

Thay các file `public/photos/1.webp` … `10.webp` (giữ nguyên tên), hoặc sửa mảng `config.photos`.

- **1–6**: 6 ảnh của bó hoa. Vị trí: 1–3 hàng trên (trái, giữa, phải), 4–5 hàng giữa, 6 là ảnh lớn giữa-dưới.
- **1–10**: toàn bộ đều xuất hiện dưới dạng thẻ ảnh trong không gian neon; ảnh 7–10 chỉ dùng ở cảnh này.
- Nên dùng ảnh dọc tỉ lệ **3:4**, WebP (hoặc JPG nếu đổi đuôi trong `config.photos`), dung lượng dưới ~80 KB/ảnh.
- Ảnh WebP hiện tại đã được nén ở quality 85, đủ nét trên màn hình điện thoại và giảm khoảng một nửa dung lượng so với JPEG gốc.
- Ảnh được cắt **cover** trong khung oval ở bó hoa và khung chữ nhật ở cảnh neon, nên chủ thể chính nên nằm giữa ảnh.
- Có thể dùng URL `https://...`, nhưng nên đặt ảnh local để tránh lỗi CORS khi vẽ ảnh vào canvas.
- Cảnh neon tự lặp ảnh để lấp đầy không gian; mỗi ảnh gốc chỉ tải một lần.

### 2. Thay ảnh trên lá thư

Sửa `config.portraitCutout` (mặc định `/photos/6.webp`). Ảnh được đặt ở góc dưới-phải lá thư trong khung polaroid nghiêng nhẹ.

- Ảnh dọc sẽ hợp nhất; chủ thể nên nằm giữa khung.
- Muốn dùng ảnh khác, đặt file vào `public/photos/` rồi đổi đường dẫn trong config.
- Muốn bỏ ảnh, đặt `portraitCutout: ""` và ẩn `.letter-portrait` trong `src/styles.css` nếu cần.

### 3. Thay bó hoa và hoa trang trí

- `public/assets/bouquet.webp`: WebP nền trong suốt, nội dung bó hoa đặt giữa khung, tỉ lệ gần 810 × 960. File hiện tại chỉ ~74 KB (thay cho PNG ~831 KB).
- `public/assets/corner-left.webp`, `corner-right.webp`: các cụm hoa cắt nền dùng cho phong bì và lá thư. Có thể thay bằng cụm hoa khác cùng tông hồng/kem; giữ nền trong suốt và mép mờ tự nhiên.
- Khi thay ảnh, nên xuất WebP quality ~85–90 và giữ nguyên tên file để không phải sửa code.
- Dấu sáp được vẽ bằng CSS (không phải ảnh); đổi chữ bằng `config.sealText`.

### 4. Thay nhạc nền

Thay `public/audio/music.mp3` bằng bản nhạc bạn có quyền sử dụng.

- Nhạc tự lặp, bắt đầu ở lần chạm/click đầu tiên (đúng chính sách autoplay của trình duyệt).
- Âm lượng tăng dần đến 0.55; tự giảm nhẹ khi mở lightbox/thư.
- File demo đi kèm dài ~60 giây, chỉ để thử nghiệm.
- Có thể dùng `.ogg`/`.m4a`; nhớ sửa `config.music` cho khớp tên file.
- Trên mobile, nhạc chỉ bắt đầu sau lần chạm đầu tiên (chính sách autoplay). Nếu vẫn im lặng, kiểm tra công tắc Im lặng và âm lượng media của điện thoại.

### 5. Sửa lời chúc

- `config.neonPhrases`: các câu neon. Nên dùng câu ngắn (dưới ~45 ký tự) để chữ không bị cắt quá nhiều ở gần camera.
- `config.captions`: caption hiển thị dưới màn hình; câu cuối được giữ lâu hơn.
- `config.letter.*`: tiêu đề và các đoạn thư. Không dùng lời bài hát có bản quyền.

## Hành vi & tương tác

- **Chạm bó hoa** (hoặc bất kỳ đâu trên sân khấu) để lần lượt hiện 6 ảnh; mỗi lần có ripple và caption đổi theo nhịp.
- **Ấn giữ** sau khi đủ 6 ảnh (~0.95 giây) để kích hoạt chuyển cảnh mềm sang không gian neon.
- **Cảnh neon**: kéo chuột/ngón tay để bay quanh cụm 360° theo chiều ngang; chiều dọc ngẩng/cúi gần trọn vòng (giới hạn 84° để không bị lộn ngược). Có quán tính nhẹ; chạm vào thẻ ảnh để mở lightbox; `Esc`, nút ✕ hoặc chạm nền để đóng.
- **Phong bì**: chạm phong bì hoặc dấu sáp. Sau khi mở, cuộn lá thư nếu nội dung dài. Nút ✕ đóng và quay về `closeLetterTo`.
- **Tự mở phong bì** sau 20 giây ở cảnh neon; nếu lightbox đang mở, hẹn lại sau khi đóng.
- Nút loa có `aria-label` và `aria-pressed` thay đổi theo trạng thái.

## Hiệu năng & accessibility

- `devicePixelRatio` bị giới hạn ở 2.
- Chữ neon dùng sprite + canvas texture (không tạo hàng trăm DOM node), glow vẽ sẵn trong texture thay vì post-processing.
- Camera orbit quanh một cụm 3D thay vì dựng nội dung khắp 360°: mỗi hướng nhìn vẫn đặc, nhưng chỉ cần ~96 chữ và 18 thẻ.
- Không gian neon được dựng trễ sau khi cảnh bó hoa hiện; ảnh 7–10 không nằm trong preload đầu trang.
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

- Cảnh neon được dựng một lần, trễ sau cảnh bó hoa; font Quicksand 700 được tải trước khi tạo texture để không bị mất dấu tiếng Việt.
- Nếu thay font, cập nhật `src/fonts.css` và các biến `--font-serif`, `--font-neon`, `--font-script`, `--font-hand` trong `src/styles.css`.
- Trên desktop, site hiển thị trong khung dọc 430 px căn giữa; trên mobile, sân khấu phủ toàn màn hình.
- Nếu bó hoa/ảnh mới có bố cục khác, có thể chỉnh `BOUQUET_WIDTH_RATIO` trong `src/scenes/bouquet.ts` (mặc định 0.5 — khoảng 50% chiều ngang màn hình 390 px).

---

Chỉ sử dụng hình ảnh, nhạc và nội dung mà bạn có quyền chia sẻ. Chúc bạn gửi được một món quà thật dịu dàng. ♡
