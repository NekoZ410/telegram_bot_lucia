import { handleStart } from "./commands/cmd_start.js";
import { handleInfo } from "./commands/cmd_info.js";
import { handleFbfix } from "./commands/cmd_fbfix.js";
import { handleTestfbfix } from "./commands/cmd_testfbfix.js";
import { handleHelp } from "./commands/cmd_help.js";
import { callTelegramApi } from "./utils/telegram.js";

const COMMAND_ROUTER = {
    start: handleStart,
    info: handleInfo,
    fbfix: handleFbfix,
    testfbfix: handleTestfbfix,
    help: handleHelp,
};

export default {
    async fetch(request, env, ctx) {
        if (request.method !== "POST") return new Response("Bot is running", { status: 200 });

        let chatId = null;
        let threadId = null;
        try {
            const update = await request.json();

            // handle callback message
            if (update.callback_query) {
                const cbQuery = update.callback_query;
                const cbData = cbQuery.data;
                const cbChatId = cbQuery.message.chat.id;
                const cbBotMsgId = cbQuery.message.message_id;

                if (cbData.startsWith("del_msg|")) {
                    const triggerMsgId = cbData.split("|")[1];
                    ctx.waitUntil(
                        (async () => {
                            await callTelegramApi("answerCallbackQuery", { callback_query_id: cbQuery.id }, env);
                            await callTelegramApi("deleteMessage", { chat_id: cbChatId, message_id: cbBotMsgId }, env);
                            if (triggerMsgId) await callTelegramApi("deleteMessage", { chat_id: cbChatId, message_id: triggerMsgId }, env);
                        })(),
                    );
                }
                return new Response("OK", { status: 200 });
            }

            // handle normal message
            const message = update.message || update.edited_message;
            if (!message || !message.text) return new Response("OK", { status: 200 });

            chatId = message.chat.id;
            threadId = message.is_topic_message ? message.message_thread_id : null;

            const text = (message.text || message.caption || "").trim();
            if (!text) return new Response("OK", { status: 200 });

            if (text.startsWith("/")) {
                const BOT_USERNAME = "uruha_lucia_bot";
                const regex = new RegExp(`^\\/(\\w+)(?:@${BOT_USERNAME})?(?:\\s+(.*))?$`, "is");
                const match = text.match(regex);
                if (match) {
                    const command = match[1].toLowerCase();
                    const args = match[2] ? match[2].trim() : "";
                    const handler = COMMAND_ROUTER[command];
                    if (handler) return await handler({ env, ctx, chatId, threadId, message, args, request });
                }
            }

            return new Response("OK", { status: 200 });
        } catch (e) {
            console.error("❌ [Global Router Error]:", e.message, "\nStack:", e.stack);
            if (chatId) {
                ctx.waitUntil(
                    (async () => {
                        try {
                            await setReaction(chatId, message.message_id, "😭", env); // feedback reaction

                            const payload = {
                                chat_id: chatId,
                                text: `❌ <b>[Cảnh báo Hệ thống Bot]</b>\nĐã xảy ra lỗi đồng bộ nghiêm trọng tại Router!\n\n<b>Chi tiết lỗi:</b> <code>${e.message}</code>\n<i>Vui lòng kiểm tra lại log Cloudflare Console nếu cần xem stack trace.</i>`,
                                parse_mode: "HTML",
                            };
                            if (threadId) payload.message_thread_id = threadId;

                            await callTelegramApi("sendMessage", payload, env);
                        } catch (tgError) {
                            console.error("❌ Không thể gửi tin nhắn cảnh báo lỗi về Telegram:", tgError.message);
                        }
                    })(),
                );
            }

            return new Response("OK", { status: 200 });
        }
    },
};
