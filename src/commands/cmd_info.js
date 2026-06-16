export async function handleInfo({ message, threadId, chatId, request }) {
    const from = message.from;
    const reqHeaders = request.headers;

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

    const ip = reqHeaders.get("cf-connecting-ip") || "Unknown";
    const country = reqHeaders.get("cf-ipcountry") || "Unknown";
    const segmentC = `\n<b>Where I reside:</b>\n` + `- IP: ${ip} | Country: ${country}`;

    const payload = {
        method: "sendMessage",
        chat_id: chatId,
        text: segmentA + segmentB + segmentC,
        parse_mode: "HTML",
    };

    if (threadId) payload.message_thread_id = threadId;

    return new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } });
}
