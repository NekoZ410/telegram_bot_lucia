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
export const autoDelErrMsg = async (chatId, botMsgId, userMsgId, env) => {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await callTelegramApi(
        "deleteMessages",
        {
            chat_id: chatId,
            message_ids: [botMsgId, userMsgId],
        },
        env,
    );
};
