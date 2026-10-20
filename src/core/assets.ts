/**
 * Chuẩn hoá đường dẫn tài nguyên trong /public để chạy đúng ở mọi nơi:
 * - dev server (BASE_URL = "/")
 * - deploy ở thư mục con kiểu GitHub Pages (BASE_URL = "./")
 * - deploy ở domain riêng / Vercel / Netlify (BASE_URL = "/")
 *
 * Chấp nhận cả "/photos/1.jpg", "photos/1.jpg" và URL tuyệt đối.
 */
export function assetUrl(path: string): string {
  if (!path) return path;
  if (/^(?:[a-z]+:)?\/\//i.test(path) || /^(?:data|blob):/i.test(path)) return path;
  const clean = path.replace(/^\.\//, "").replace(/^\/+/, "");
  const base = (import.meta.env.BASE_URL || "./").replace(/\/?$/, "/");
  return `${base}${clean}`;
}
