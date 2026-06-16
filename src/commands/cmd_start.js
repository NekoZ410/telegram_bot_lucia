export async function handleStart({ message, threadId, chatId }) {
    const payload = {
        method: "sendMessage",
        chat_id: chatId,
        text: "👋 Xin chào! Tôi là Lucia Bot.\n\nHãy gõ \/ để xem tôi có thể giúp gì cho bạn.",
        parse_mode: "HTML",
    };

    if (threadId) payload.message_thread_id = threadId;

    return new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } });
}
