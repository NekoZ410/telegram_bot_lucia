import { callTelegramApi, setReaction } from "../utils/telegram.js";

export async function handleStart({ env, ctx, chatId, threadId, message }) {
    // ===== reaction feedback for trigger =====
    ctx.waitUntil(setReaction(chatId, message.message_id, "👌", env));

    // ===== send start greeting =====
    ctx.waitUntil(
        (async () => {
            const payload = {
                chat_id: chatId,
                text: `✨ Chào ngài! Em là Lucia.\n\nNhập <code>\/</code> để xem những lệnh mà em có thể thực hiện nhé.`,
                parse_mode: "HTML",
            };
            if (threadId) payload.message_thread_id = threadId;

            await callTelegramApi("sendMessage", payload, env);
        })(),
    );
    return new Response("OK", { status: 200 });
}
