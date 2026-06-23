// main: call telegram api
export const callTelegramApi = async (method, payload, env) => {
    const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;
    return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
};

// helper: auto delete error messages
export const autoDeleteMessage = async (chatId, botMsgId, userMsgId, env, delayMs = 5000) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await callTelegramApi(
        "deleteMessages",
        {
            chat_id: chatId,
            message_ids: [botMsgId, userMsgId],
        },
        env,
    );
};

// helper: set reaction
export const setReaction = async (chatId, messageId, emoji, env) => {
    return callTelegramApi(
        "setMessageReaction",
        {
            chat_id: chatId,
            message_id: messageId,
            reaction: [{ type: "emoji", emoji: emoji }],
        },
        env,
    );
};
