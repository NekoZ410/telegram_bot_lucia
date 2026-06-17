import { handleStart } from "./commands/cmd_start.js";
import { handleInfo } from "./commands/cmd_info.js";
import { handleFbfix } from "./commands/cmd_fbfix.js";

const COMMAND_ROUTER = {
    start: handleStart,
    info: handleInfo,
    fbfix: handleFbfix,
};

export default {
    async fetch(request, env, ctx) {
        if (request.method !== "POST") return new Response("Bot is running", { status: 200 });

        try {
            const update = await request.json();
            const message = update.message || update.edited_message;
            if (!message || !message.text) return new Response("OK", { status: 200 });

            const chatId = message.chat.id;
            const threadId = message.is_topic_message ? message.message_thread_id : null;
            const text = message.text.trim();

            if (text.startsWith("/")) {
                const match = text.match(/^\/([a-zA-Z0-9_]+)(?:@[a-zA-Z0-9_]+bot)?(?:\s+(.*))?$/i);
                if (match) {
                    const command = match[1].toLowerCase();
                    const args = match[2] ? match[2].trim() : "";

                    const handler = COMMAND_ROUTER[command];

                    if (handler) return await handler({ env, ctx, chatId, threadId, message, args, request });
                }
            }

            return new Response("OK", { status: 200 });
        } catch (error) {
            console.error("❌ Router Error:", error);
            return new Response("OK", { status: 200 });
        }
    },
};
