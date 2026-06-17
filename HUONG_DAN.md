# 📚 HƯỚNG DẪN SỬ DỤNG - TWITCH CHAT VIEWER

Chào mừng bạn đến với **Twitch Chat Viewer**! Đây là ứng dụng desktop chạy trên hệ điều hành Windows giúp bạn theo dõi phòng chat của nhiều streamer Twitch cùng một lúc, hỗ trợ gửi tin nhắn, dịch thuật trực tiếp và đặc biệt là hệ thống tự động tham gia Giveaway (Auto Bot).

Dưới đây là hướng dẫn chi tiết từng bước để thiết lập và sử dụng phần mềm hiệu quả nhất.

---

## 🔑 1. KÍCH HOẠT BẢN QUYỀN HOẶC SỬ DỤNG ẨN DANH

Khi mới khởi động phần mềm lần đầu, bạn sẽ thấy giao diện kích hoạt bản quyền:
1. **Nếu có Key kích hoạt:** Dán mã Key (có định dạng `TV-XXXX-XXXX-XXXX`) vào ô nhập liệu và nhấn **Kích hoạt**. Hệ thống sẽ xác thực trực tuyến và mở khóa toàn bộ tính năng quản lý tài khoản.
2. **Nếu muốn dùng thử/chỉ xem:** Nhấn nút **Sử dụng Chế độ Theo dõi (Ẩn danh)** phía dưới. Ở chế độ này, bạn sẽ tham gia phòng chat dưới danh nghĩa ẩn danh (`justinfanXXXXX`), chỉ có thể đọc chat mà không thể nhắn tin hoặc cấu hình tài khoản Twitch của riêng bạn.

---

## 🌐 2. HƯỚNG DẪN LẤY TWITCH OAUTH TOKEN

Để gửi được tin nhắn chat và chạy các tính năng Auto Bot của tài khoản của bạn, phần mềm cần mã kết nối bảo mật gọi là **Twitch OAuth Token**.

Có 2 cách chính để lấy mã này:

### Cách 1: Sử dụng Twitch Token Generator (Khuyên dùng)
1. Truy cập vào trang web: [https://twitchtokengenerator.com/](https://twitchtokengenerator.com/)
2. Cuộn xuống dưới và nhấp chọn **Quick Generate** hoặc đăng nhập qua tài khoản Twitch của bạn.
3. Cho phép ứng dụng liên kết với tài khoản Twitch của bạn (nhấn **Authorize**).
4. Sau khi hoàn thành, trang web sẽ cung cấp cho bạn một chuỗi ký tự dạng: `ACCESS TOKEN` hoặc `BOT OAUTH TOKEN`.
5. Hãy copy chuỗi mã đó. (Ví dụ: `oauth:abcdef1234567890xyz...` hoặc `abcdef1234567890xyz...`).
6. Ngoài ra, bạn cũng có thể copy mã **Client ID** được hiển thị trên trang đó để phần mềm hiển thị ảnh đại diện của bạn.

### Cách 2: Sử dụng Twitch Chat OAuth Password Generator (Nhanh nhất)
1. Truy cập vào trang web: [https://twitchapps.com/tmi/](https://twitchapps.com/tmi/)
2. Nhấn vào nút màu tím **Connect** (Kết nối).
3. Đăng nhập tài khoản Twitch của bạn và cấp quyền.
4. Một mã bắt đầu bằng chữ `oauth:` sẽ xuất hiện trên màn hình (Ví dụ: `oauth:g1h2j3k4l5...`). Hãy sao chép toàn bộ dòng mã này.

---

## 👥 3. THÊM TÀI KHOẢN VÀO PHẦN MỀM

Sau khi đã có mã Token, bạn tiến hành thêm tài khoản của mình vào ứng dụng:
1. Nhấp vào nút dấu cộng **`+`** ở góc dưới cùng bên trái của thanh Sidebar (Quản lý tài khoản).
2. Điền thông tin vào bảng:
   * **Tên hiển thị:** Tên bất kỳ để bạn phân biệt tài khoản (Ví dụ: `DonPV`).
   * **Twitch OAuth Token:** Dán mã Token mà bạn đã lấy ở **Bước 2** vào đây (Bắt buộc phải có dạng `oauth:...`, nếu trang web trả về chuỗi không có chữ `oauth:`, bạn chỉ cần tự gõ thêm chữ `oauth:` vào đầu).
   * **Twitch Client ID:** Dán mã Client ID tương ứng từ Twitch Token Generator (tùy chọn, dùng để tự động tải ảnh đại diện).
3. Nhấp **Lưu tài khoản**.
4. Tài khoản của bạn sẽ xuất hiện trên thanh Sidebar bên trái dưới dạng ảnh đại diện hoặc chữ viết tắt tên hiển thị.

---

## 💬 4. THAM GIA XEM VÀ CHAT TRỰC TIẾP

1. Nhấp chọn tài khoản Twitch của bạn ở thanh Sidebar bên trái.
2. Nhìn lên thanh công cụ phía trên cùng, nhập tên kênh Twitch mà bạn muốn theo dõi vào ô **Thêm channel (vd: xqc, ninja...)** (Nhập tên dạng viết thường không dấu).
3. Nhấp nút **+ Thêm** hoặc nhấn **Enter**.
4. Một Tab kênh mới sẽ xuất hiện ở phía trên. Kênh chat sẽ tự động kết nối trực tiếp.
5. Bạn có thể gõ nội dung chat vào ô nhập liệu ở dưới cùng và nhấn **Gửi** để trò chuyện với mọi người trong phòng chat dưới tư cách tài khoản bạn đã chọn.
6. Để tắt kênh đó, chỉ cần di chuột vào tab kênh và click vào dấu nhân **`×`** nhỏ ở bên cạnh tên tab.

---

## 🤖 5. CẤU HÌNH AUTO BOT (AUTO JOIN & AUTO CLAIM)

Đây là tính năng độc quyền giúp tự động hóa hoạt động săn quà, giveaway trên Twitch. Mỗi tab kênh chat sẽ có một cấu hình Auto Bot riêng biệt:

Nhìn xuống dưới góc phải khung chat, bạn sẽ thấy nút **`🤖 Auto`**. Nhấp vào đó để mở bảng cấu hình:

### A. Tự động tham gia Giveaway (Auto Join)
* **Bật tự động tham gia:** Nhấp chọn ô này để kích hoạt.
* **Từ khóa phát hiện (Trigger):** Điền các từ khóa mà Streamer hoặc Bot của phòng chat dùng để mở giveaway (ví dụ: `!giveaway`, `!roll`, `nhập lệnh`). Các từ khóa phân tách nhau bằng dấu phẩy `,`.
* **Nội dung phản hồi (Response):** Nội dung mà bạn cần gửi lên chat để tham gia (ví dụ: `!join`, `!enter`).
* **Độ trễ gửi (giây):** Thời gian chờ từ khi phát hiện từ khóa đến khi tự động gửi tin phản hồi (nên để từ 3 - 5 giây để tránh bị hệ thống Twitch đánh dấu spam).

### B. Tự động gửi thông tin nhận thưởng (Auto Claim)
Khi trúng giải giveaway, bot của streamer thường yêu cầu bạn cung cấp thông tin tài khoản game trong thời gian ngắn nếu không sẽ bị hủy giải. Auto Claim sẽ thay bạn làm việc này:
* **Bật tự động nhận thưởng:** Nhấp chọn ô này để kích hoạt.
* **Thông tin tài khoản nhận thưởng:** Điền cú pháp thông tin của bạn (Ví dụ: `ID Game: DonPV93, UID: 123456`).
* **Độ trễ gửi nhận thưởng (giây):** Thời gian chờ trước khi tự động gửi thông tin lên chat khi phát hiện trúng giải.

> **💡 Lưu ý về cơ chế chống Spam:** Để đảm bảo tài khoản không bị Twitch chặn do gửi tin nhắn liên tục, hệ thống Auto Bot được cấu hình thời gian hồi chiêu (cooldown) là **15 phút** sau mỗi lần tự động gửi tin nhắn. Trong lúc hồi chiêu, đèn bot ở góc chat sẽ hiển thị màu vàng và thông báo thời gian chờ reset.

---

## 🌐 6. CÁC TÍNH NĂNG NÂNG CAO KHÁC

### Dịch đoạn chat trực tiếp (Translation Tool)
Nếu bạn xem các kênh Twitch nước ngoài (Tiếng Anh, Nhật, Hàn, Trung...):
* **Dịch nhanh tin nhắn:** Nhấp chọn biểu tượng quả địa cầu **`🌐`** xuất hiện khi di chuột lên bất kỳ dòng tin nhắn nào để dịch dòng chat đó sang Tiếng Việt.
* **Dịch đoạn văn bản tự chọn:** Bạn có thể bôi đen bất kỳ từ hoặc câu nào trong khung chat. Một biểu tượng quả địa cầu **`🌐`** nhỏ sẽ hiện lên gần con trỏ chuột. Nhấp vào đó để mở bảng dịch thuật với nhiều tùy chọn ngôn ngữ khác nhau.

### Trả lời tin nhắn nhanh (Reply Context)
* Di chuột qua dòng tin nhắn của người dùng khác trong khung chat.
* Nhấp vào biểu tượng mũi tên quay lại **`↩️`**.
* Một thanh hiển thị ngữ cảnh trả lời sẽ xuất hiện phía trên ô nhập chat.
* Nhập tin nhắn của bạn và nhấn gửi. Tin nhắn của bạn sẽ được gửi dưới dạng Reply liên kết trực tiếp với tin nhắn của người đó trên Twitch.

---

*Chúc bạn có những trải nghiệm xem stream tuyệt vời cùng **Twitch Chat Viewer**!*
