import { handleStart } from "./commands/cmd_start.js";
import { handleInfo } from "./commands/cmd_info.js";
import { handleFbfix } from "./commands/cmd_fbfix.js";

export default {
    async fetch(request, env, ctx) {
        try {
            const update = await request.json();
            const message = update.message;
            if (!message || !message.text) return new Response("OK", { status: 200 });

            const chatId = message.chat.id;
            const text = message.text.trim();
            const threadId = message.message_thread_id;

            let command = null;
            let args = null;
            if (text.startsWith("/")) {
                const firstWord = text.split(/\s+/)[0];
                const parts = firstWord.split("@");
                command = parts[0].substring(1).toLowerCase();
                args = text.substring(firstWord.length).trim();
            }

            // packing context
            const context = { message, command, args, threadId, chatId, request, env, ctx };

            // router
            switch (command) {
                case "start":
                    return await handleStart(context);
                case "info":
                    return await handleInfo(context);
                case "fbfix":
                    return await handleFbfix(context);
                default:
                    return new Response("OK", { status: 200 });
            }
        } catch (error) {
            console.error("Error parsing webhook:", error);
            return new Response("Internal Server Error", { status: 500 });
        }
    },
};
