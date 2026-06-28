import { callTelegramApi, setReaction } from "../utils/telegram.js";
import { createInlineKeyboard } from "../utils/telegram.js";

export async function handleInfo({ message, threadId, chatId, request, env, ctx }) {
    ctx.waitUntil(setReaction(chatId, message.message_id, "👌", env)); // feedback reaction

    // pre-extract due to waitUntil async
    const from = message.from;
    const name = `${from.first_name || ""} ${from.last_name || ""}`.trim() || "N/A";
    const username = from.username ? `@${from.username}` : "N/A";
    const userId = from.id;
    const langCode = from.language_code || "N/A";
    const isPremium = from.is_premium ? "True" : "False";
    const isBot = from.is_bot ? "True" : "False";
    const segmentSender =
        `🪬 <b>Em biết gì vể ngài?</b>\n` +
        `- Tên: ${name}\n` +
        `- Username: ${username} | User ID: ${userId}\n` +
        `- Mã ngôn ngữ ứng dụng: ${langCode}\n` +
        `- Đã đăng ký Premium?: ${isPremium} | Là bot?: ${isBot}\n`;

    const chatType = message.chat.type;
    const topicId = message.message_thread_id;
    let segmentPositioning = `\n🗺 <b>Đây là đâu?</b>\n` + `- Phân loại chat: ${chatType} | Chat ID: ${chatId}\n`;
    if (topicId) segmentPositioning += `- Có chia topic?: True | Topic ID: ${topicId}\n`;

    const ip = request.headers?.get("cf-connecting-ip") || "Unknown";
    const country = request.headers?.get("cf-ipcountry") || "Unknown";
    const colo = request.cf?.colo || "Unknown";
    const asnOrg = request.cf?.asOrganization || "Unknown";
    const versionId = env.CF_VERSION_METADATA?.id.substring(0, 8) || "N/A";
    const segmentServer =
        `\n🛰 <b>Nơi nào chứa em?</b>\n` +
        `- IP: ${ip} | Quốc gia: ${country}\n` +
        `- Colo (Máy chủ vật lý): ${colo} | ISP: ${asnOrg}\n` +
        `- ID phiên bản triển khai cuối: <code>${versionId}</code>\n`;

    const infoText = segmentSender + segmentPositioning + segmentServer;

    // clean up messages button
    const callbackDataPayload = `del_msg|${message.message_id}`;
    const replyMarkup = createInlineKeyboard([[{ text: "Đã hiểu!", callback_data: callbackDataPayload }]]);

    // ===== send detailed info =====
    ctx.waitUntil(
        (async () => {
            const payload = {
                chat_id: chatId,
                text: infoText,
                parse_mode: "HTML",
                reply_markup: replyMarkup,
            };
            if (threadId) payload.message_thread_id = threadId;

            await callTelegramApi("sendMessage", payload, env);
        })(),
    );
    return new Response("OK", { status: 200 });
}
