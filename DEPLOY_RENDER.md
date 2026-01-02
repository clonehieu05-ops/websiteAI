# 🚀 Hướng Dẫn Deploy Lên Render.com & Cài Domain

Hướng dẫn chi tiết cách đưa website AI Hub Total lên internet miễn phí với Render.com và kết nối tên miền riêng.

## Bước 1: Chuẩn Bị GitHub (Quan trọng)

Bạn cần đưa code lên GitHub trước.

1. **Vào thư mục dự án:**
   ```bash
   cd d:\tool\coder\project
   ```

2. **Khởi tạo Git:**
   ```bash
   git init
   git add .
   git commit -m "First commit AI Hub Total"
   ```

3. **Đẩy lên GitHub:**
   - Tạo repo mới trên [GitHub](https://github.com/new) (đặt tên `ai-hub-total`, chọn Private hoặc Public tùy ý).
   - Copy lệnh push từ GitHub và chạy, ví dụ:
   ```bash
   git remote add origin https://github.com/USERNAME/ai-hub-total.git
   git branch -M main
   git push -u origin main
   ```

---

## Bước 2: Tạo Web Service Trên Render

1. Đăng ký/Đăng nhập [Render.com](https://render.com).
2. Chọn **New +** -> **Web Service**.
3. Chọn **Connection to GitHub** và chọn repo `ai-hub-total` bạn vừa tạo.
4. **Cấu hình:**
   - **Name:** `ai-hub-total` (hoặc tên tùy thích)
   - **Region:** Singapore (cho nhanh ở VN)
   - **Branch:** `main`
   - **Runtime:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn app:app`
   - **Plan:** Free

5. **Kéo xuống phần "Environment Variables" (Cực kỳ quan trọng), bấm "Add Environment Variable":**
   
   | Key | Value |
   |-----|-------|
   | `GOOGLE_API_KEY` | Paste key của bạn vào đây |
   | `HUGGINGFACE_API_TOKEN` | Paste token của bạn vào đây |
   | `APP_SECRET_KEY` | (Điền một chuỗi ngẫu nhiên dài) |
   | `JWT_SECRET_KEY` | (Điền một chuỗi ngẫu nhiên dài khác) |
   | `PYTHON_VERSION` | `3.11.0` |

6. Bấm **Create Web Service**. Chờ khoảng 2-3 phút để Render build và deploy.

---

## Bước 3: Cấu Hình Tên Miền (Custom Domain)

Giả sử tên miền bạn mua là `example.com`.

1. Trong Dashboard của Render, vào mục **Settings** của Web Service vừa tạo.
2. Kéo xuống phần **Custom Domains** -> Bấm **Add Custom Domain**.
3. Nhập tên miền của bạn: `example.com`.
4. Render sẽ yêu cầu bạn cấu hình DNS.

### Cấu Hình DNS (Tại nơi bạn mua tên miền):

Đăng nhập vào trang quản lý tên miền (123host, Namcheap, Godaddy...) và thêm 2 bản ghi sau:

**Bản ghi 1 (Cho tên miền chính):**
- **Type:** `A`
- **Host / Name:** `@` (hoặc tên miền của bạn)
- **Value / IP:** `216.24.57.1` (Kiểm tra lại IP mà Render cấp cho bạn, thường là số này)

**Bản ghi 2 (Cho www):**
- **Type:** `CNAME`
- **Host / Name:** `www`
- **Value:** `ai-hub-total.onrender.com` (Thay bằng tên miền onrender của app bạn)

5. Sau khi thêm DNS, quay lại Render và bấm **Verify**.
6. Render sẽ tự động cấp chứng chỉ **SSL (https)** cho bạn sau vài phút.

---

## ⚠️ Lưu Ý Quan Trọng Về Gói Free

Trên Render gói miễn phí (Free Tier):
1. **Dữ liệu database (users, credits) sẽ MẤT khi web bị khởi động lại** (vì Render không lưu file trên ổ cứng vĩnh viễn ở gói free).
   - *Giải pháp:* Để chạy thật cần nâng cấp gói Starter ($7/tháng) và thêm Render Disk ($0.25/GB).
   - *Tạm thời:* Vẫn chạy tốt để demo, nhưng đăng ký user xong deploy lại là mất user đó.

2. **Sleep mode:** Web sẽ tự tắt sau 15p không có ai truy cập. Lần sau vào sẽ load chậm mất ~30s để khởi động lại.
