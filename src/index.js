export default {
    async fetch(request, env, ctx) {
        // 1. Chỉ chấp nhận phương thức POST từ Telegram
        if (request.method !== "POST") {
            return new Response("Lucia Bot is running!", { status: 200 });
        }

        try {
            // 2. Phân tích dữ liệu JSON gửi từ Telegram Webhook
            const update = await request.json();
            const message = update.message;

            // 3. Kiểm tra xem có tin nhắn dạng văn bản không
            if (message && message.text) {
                const chatId = message.chat.id;
                const text = message.text.trim();
                let replyText = "";

                // 4. Logic xử lý các lệnh cơ bản
                if (text === "/start") {
                    replyText = "Hello! I am Lucia. How can I help you today?";
                } else {
                    replyText = `Lucia heard you say: "${text}"`;
                }

                // 5. Tối ưu Zero-latency: Gửi lệnh trả về ngay trong HTTP Response
                const payload = JSON.stringify({
                    method: "sendMessage",
                    chat_id: chatId,
                    text: replyText,
                });

                return new Response(payload, {
                    headers: { "Content-Type": "application/json" },
                });
            }

            return new Response("OK", { status: 200 });
        } catch (error) {
            console.error("Error parsing webhook:", error);
            return new Response("Internal Server Error", { status: 500 });
        }
    },
};
