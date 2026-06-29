import { callTelegramApi, setReaction, createInlineKeyboard } from "../utils/telegram.js";

export async function handleHelp({ env, ctx, chatId, threadId, message }) {
    ctx.waitUntil(setReaction(chatId, message.message_id, "👌", env)); // feedback reaction

    const helpText =
        `🛠 <b>Các lệnh của Lucia:</b>\n` +
        `- <code>/start</code>: Lời chào từ hệ thống\n` +
        `- <code>/help</code>: Hiển thị danh sách lệnh (bảng này)\n` +
        `- <code>/info</code>: Xem thông tin từ bot\n` +
        `- <code>/fbfix &lt;url&gt;</code>: Trả về preview, ảnh hoặc video, kèm thông tin (phần lớn) bài viết\n` +
        `- <code>/qr &lt;text&gt;</code>: Tạo mã QR từ văn bản, có thể thêm logo cá nhân hoá đi kèm\n` +
        // `<code>/testfbfix &lt;url&gt;</code> - Môi trường thử nghiệm tính năng fbfix mới\n` +
        `\n` +
        `💡 <b>Mẹo:</b>\n` +
        `- Sử dụng phím <b>Tab</b> trên máy tính, hoặc <b>nhấn giữ lệnh</b> trên điện thoại để hoàn thành cú pháp gọi nhưng không không gửi đi, để sau đó có thể điển tham số.`;

    // clean up messages button
    const callbackDataPayload = `del_msg|${message.message_id}`;
    const replyMarkup = createInlineKeyboard([[{ text: "Đã hiểu!", callback_data: callbackDataPayload }]]);

    // ===== send help message =====
    ctx.waitUntil(
        (async () => {
            const payload = {
                chat_id: chatId,
                text: helpText,
                parse_mode: "HTML",
                reply_markup: replyMarkup,
            };
            if (threadId) payload.message_thread_id = threadId;

            await callTelegramApi("sendMessage", payload, env);
        })(),
    );
    return new Response("OK", { status: 200 });
}
