import { callTelegramApi, setReaction } from "../utils/telegram.js";
import { createInlineKeyboard } from "../utils/telegram.js";

export async function handleStart({ env, ctx, chatId, threadId, message }) {
    ctx.waitUntil(setReaction(chatId, message.message_id, "👌", env)); // feedback reaction

    // clean up messages button
    const callbackDataPayload = `del_msg|${message.message_id}`;
    const replyMarkup = createInlineKeyboard([[{ text: "Đã hiểu!", callback_data: callbackDataPayload }]]);

    // ===== send start greeting =====
    ctx.waitUntil(
        (async () => {
            const payload = {
                chat_id: chatId,
                text: `✨ Chào ngài! Em là Lucia.\n\nNhập <code>\/help</code> để xem những lệnh mà em có thể thực hiện nhé!`,
                parse_mode: "HTML",
                reply_markup: replyMarkup,
            };
            if (threadId) payload.message_thread_id = threadId;

            await callTelegramApi("sendMessage", payload, env);
        })(),
    );
    return new Response("OK", { status: 200 });
}
