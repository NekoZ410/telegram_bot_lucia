import { callTelegramApi, setReaction } from "../utils/telegram.js";

export async function handleInfo({ message, threadId, chatId, request, env, ctx }) {
    // ===== pre-extract due to waitUntil async =====
    const from = message.from;
    const name = `${from.first_name || ""} ${from.last_name || ""}`.trim() || "N/A";
    const username = from.username ? `@${from.username}` : "N/A";
    const userId = from.id;
    const langCode = from.language_code || "N/A";
    const isPremium = from.is_premium ? "True" : "False";
    const isBot = from.is_bot ? "True" : "False";

    const segmentA =
        `<b>What know about you:</b>\n` +
        `- Name: ${name}\n` +
        `- Username: ${username} | User ID: ${userId}\n` +
        `- Language code: ${langCode}\n` +
        `- Is Premium: ${isPremium} | Is Bot: ${isBot}\n\n`;

    const chatType = message.chat.type;
    const topicId = message.message_thread_id;
    let segmentB = `<b>Where am I:</b>\n` + `- Chat type: ${chatType} | Chat ID: ${chatId}\n`;
    if (topicId) segmentB += `- Is in a Topic: True | Topic ID: ${topicId}\n`;

    const ip = request.headers.get("cf-connecting-ip") || "Unknown";
    const country = request.headers.get("cf-ipcountry") || "Unknown";
    const segmentC = `\n<b>Where I reside:</b>\n` + `- IP: ${ip} | Country: ${country}`;

    // ===== reaction feedback for trigger =====
    ctx.waitUntil(setReaction(chatId, message.message_id, "👌", env));

    // ===== send detailed info =====
    ctx.waitUntil(
        (async () => {
            const payload = {
                chat_id: chatId,
                text: segmentA + segmentB + segmentC,
                parse_mode: "HTML",
            };
            if (threadId) payload.message_thread_id = threadId;

            await callTelegramApi("sendMessage", payload, env);
        })(),
    );
    return new Response("OK", { status: 200 });
}
