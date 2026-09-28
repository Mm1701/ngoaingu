# Language Learning Pro

Web học ngoại ngữ tĩnh + Supabase. Phiên bản này dùng mô hình **Shared Lessons + Personal Progress**.

## Quyền dữ liệu
- **Public / Công khai**: mọi tài khoản đã đăng nhập đều nhìn thấy và học được.
- **Private / Riêng tôi**: chỉ tài khoản đã upload mới nhìn thấy.
- `user_progress`, `wrong_answers`, lịch sử, streak, bookmark và session vẫn là dữ liệu riêng từng tài khoản.
- Tài khoản chỉ được sửa/xóa những bài do chính mình tạo. Bài công khai của người khác không thể bị xóa.

## Cài đặt
1. Tạo project Supabase → SQL Editor → chạy `supabase.sql`.
2. Authentication → Email.
3. Settings → API → lấy URL + anon key → điền `js/config.js`. Chỉ dùng anon/public key ở frontend, không đưa `service_role` vào web.
4. Chạy `python3 -m http.server` rồi mở local, hoặc deploy GitHub Pages / Netlify / Vercel.
5. Đăng ký → Dữ liệu → chọn Công khai hoặc Riêng tôi → import Excel.

## Excel
Cột yêu cầu: `No | Level | Tieng Trung | Pinyin | Tieng Viet | giai thich`
