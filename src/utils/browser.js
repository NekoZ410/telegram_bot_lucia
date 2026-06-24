export const fetchWithBrowser = async (browserBinding, url, options = {}) => {
    try {
        // Tùy chỉnh Payload theo chuẩn của endpoint /content
        const payload = {
            url: url,
            // Chặn tải các tài nguyên nặng để tăng tốc độ phản hồi < 3s
            rejectResourceTypes: ["image", "stylesheet", "font", "media"],
            gotoOptions: {
                // Đợi mạng rảnh rỗi để chắc chắn React của Facebook đã render xong
                waitUntil: "networkidle2",
                timeout: 15000,
            },
        };

        // Gọi thẳng vào hệ thống quản lý Browser của Cloudflare
        const response = await browserBinding.quickAction("content", payload);

        if (!response.ok) {
            throw new Error(`Cloudflare Browser API Error: ${response.status}`);
        }

        // Trả về toàn bộ HTML đã render
        const html = await response.text();
        return { html };
    } catch (err) {
        throw new Error(`[Quick Action Lỗi]: ${err.message}`);
    }
};
