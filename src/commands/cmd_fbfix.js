import { fetchFacebookOgUrl } from "../utils/facebook.js";
import { callTelegramApi, autoDelErrMsg } from "../utils/telegram.js";

export async function handleFbfix({ env, ctx, chatId, threadId, message, args }) {
    if (args) {
        const urlRegex = /(?:https?:\/\/)?(?:www\.)?facebook\.com\/[^\s]+/i;
        const matchUrl = args.match(urlRegex);

        if (matchUrl) {
            // const firstName = message.from.first_name || "";
            // const lastName = message.from.last_name || "";
            // const username = message.from.username ? `@${message.from.username}` : "<username not set>";

            // const nameStr = `${firstName} ${lastName}`.trim() || "Người dùng";
            // let userDisplay = `🙍‍♂️ Phản hồi cho: ${nameStr}`;
            // if (username) userDisplay += ` - ${username}`;

            // const result = await fetchFacebookOgUrl(matchUrl[0], userDisplay);

            let userDisplay = null;
            const result = await fetchFacebookOgUrl(matchUrl[0], userDisplay);

            ctx.waitUntil(
                (async () => {
                    const sendPayload = {
                        chat_id: chatId,
                        text: result.text,
                        parse_mode: "HTML",
                        link_preview_options: { prefer_large_media: true },
                        reply_parameters: { message_id: message.message_id },
                    };

                    if (result.url) {
                        sendPayload.link_preview_options.url = result.url;
                        sendPayload.link_preview_options.show_above_text = true;
                    }

                    if (threadId) sendPayload.message_thread_id = threadId;

                    let tgResponse = await callTelegramApi("sendMessage", sendPayload, env);
                    if (tgResponse && typeof tgResponse.json === "function") tgResponse = await tgResponse.json();

                    if (!result.url && tgResponse && tgResponse.ok) await autoDelErrMsg(chatId, tgResponse.result.message_id, message.message_id, env);
                })(),
            );
            return new Response("OK", { status: 200 });
        } else {
            ctx.waitUntil(
                (async () => {
                    const payload = {
                        chat_id: chatId,
                        text: "❌ Link không hợp lệ. Vui lòng cung cấp link Facebook đúng định dạng.\n\n<i>Tin nhắn sẽ tự động xoá sau 5s.</i>",
                        parse_mode: "HTML",
                        reply_parameters: { message_id: message.message_id },
                    };
                    if (threadId) payload.message_thread_id = threadId;

                    let tgResponse = await callTelegramApi("sendMessage", payload, env);
                    if (tgResponse && typeof tgResponse.json === "function") tgResponse = await tgResponse.json();

                    if (tgResponse && tgResponse.ok) await autoDelErrMsg(chatId, tgResponse.result.message_id, message.message_id, env);
                })(),
            );
            return new Response("OK", { status: 200 });
        }
    } else {
        ctx.waitUntil(
            (async () => {
                const payload = {
                    chat_id: chatId,
                    text: "⚠️ Vui lòng sử dụng cú pháp:\n<code>/fbfix &lt;facebookUrl&gt;</code>\n<code>/fbfix@nekoz410_lucia_bot &lt;facebookUrl&gt;</code>\n\n<i>Tin nhắn sẽ tự động xoá sau 5s.</i>",
                    parse_mode: "HTML",
                    reply_parameters: { message_id: message.message_id },
                };
                if (threadId) payload.message_thread_id = threadId;

                let tgResponse = await callTelegramApi("sendMessage", payload, env);
                if (tgResponse && typeof tgResponse.json === "function") tgResponse = await tgResponse.json();

                if (tgResponse && tgResponse.ok) await autoDelErrMsg(chatId, tgResponse.result.message_id, message.message_id, env);
            })(),
        );
        return new Response("OK", { status: 200 });
    }
}
