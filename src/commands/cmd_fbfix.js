import { fetchFacebookOgUrl } from "../utils/facebook.js";
import { callTelegramApi, autoDeleteMessage, setReaction } from "../utils/telegram.js";

export async function handleFbfix({ env, ctx, chatId, threadId, message, args }) {
    if (args) {
        const urlRegex = /(?:https?:\/\/)?(?:www\.)?facebook\.com\/[^\s]+/i;
        const matchUrl = args.match(urlRegex);

        if (matchUrl) {
            // ===== reaction feedback for trigger =====
            ctx.waitUntil(setReaction(chatId, message.message_id, "👌", env));

            // ===== sender info - disabled =====
            // const firstName = message.from.first_name || "";
            // const lastName = message.from.last_name || "";
            // const username = message.from.username ? `@${message.from.username}` : "<username not set>";

            // const nameStr = `${firstName} ${lastName}`.trim() || "Người dùng";
            // let userDisplay = `🙍‍♂️ Phản hồi cho: ${nameStr}`;
            // if (username) userDisplay += ` - ${username}`;

            // const result = await fetchFacebookOgUrl(matchUrl[0], userDisplay);

            // ===== send message based on post type =====
            ctx.waitUntil(
                (async () => {
                    try {
                        let userDisplay = null;
                        const result = await fetchFacebookOgUrl(matchUrl[0], userDisplay);
                        if (result.text.includes("❌")) throw new Error(result.text); // if fetch fails, throw error

                        let isMediaSentSuccess = false;
                        const isReel = result.url && (result.url.includes("/reel/") || result.url.includes("/watch/") || result.url.includes("/videos/")); // check if it's a video

                        // if post is a video => parsed url + metadata + og:image (preview replacement)
                        if (isReel && result.ogImage) {
                            const payload = {
                                chat_id: chatId,
                                photo: result.ogImage,
                                caption: result.text,
                                parse_mode: "HTML",
                                reply_parameters: { message_id: message.message_id },
                            };
                            if (threadId) payload.message_thread_id = threadId;

                            let tgResponse = await callTelegramApi("sendPhoto", payload, env);
                            let jsonResponse = typeof tgResponse.json === "function" ? await tgResponse.json() : tgResponse;
                            if (jsonResponse && jsonResponse.ok) isMediaSentSuccess = true;
                        }
                        // if post with multiple images => parsed url + metadata + images group
                        else if (!isReel && result.mediaUrls && result.mediaUrls.length > 1) {
                            const mediaGroup = result.mediaUrls.map((url, index) => {
                                const item = { type: "photo", media: url };
                                if (index === 0) {
                                    item.caption = result.text;
                                    item.parse_mode = "HTML";
                                }
                                return item;
                            });

                            const payload = {
                                chat_id: chatId,
                                media: mediaGroup,
                                reply_parameters: { message_id: message.message_id },
                            };
                            if (threadId) payload.message_thread_id = threadId;

                            let tgResponse = await callTelegramApi("sendMediaGroup", payload, env);
                            let jsonResponse = typeof tgResponse.json === "function" ? await tgResponse.json() : tgResponse;
                            if (jsonResponse && jsonResponse.ok) isMediaSentSuccess = true;
                        }

                        // if post have only 1 image, 0 image, or error => parsed url + metadata
                        if (!isMediaSentSuccess) {
                            const sendPayload = {
                                chat_id: chatId,
                                text: result.text,
                                parse_mode: "HTML",
                                reply_parameters: { message_id: message.message_id },
                            };
                            if (threadId) sendPayload.message_thread_id = threadId;

                            sendPayload.link_preview_options = {
                                is_disabled: false,
                                prefer_large_media: true,
                                ...(result.url && { url: result.url }), // url will be included if result.url valid
                            };

                            let tgResponse = await callTelegramApi("sendMessage", sendPayload, env);
                            let jsonResponse = typeof tgResponse.json === "function" ? await tgResponse.json() : tgResponse;

                            if (jsonResponse && !jsonResponse.ok) throw new Error(`Telegram Error: ${jsonResponse.description}`); // if fallback fails, throw error
                        }
                    } catch (e) {
                        await setReaction(chatId, message.message_id, "👎", env); // change reaction feedback to notify fails

                        const errorMsg =
                            e.message.includes("❌") ?
                                e.message
                            :   "❌ Lỗi không xác định khi tải nội dung. Mạng không ổn định hoặc facebook đã đổi thuật toán!\n\n<b>[Thông báo sẽ tự động xoá sau 5s.]</b>";
                        const payload = {
                            chat_id: chatId,
                            text: `${errorMsg}\n\n<b>[Thông báo sẽ tự động xoá sau 5s.]</b>`,
                            parse_mode: "HTML",
                            reply_parameters: { message_id: message.message_id },
                        };
                        if (threadId) payload.message_thread_id = threadId;

                        let tgResponse = await callTelegramApi("sendMessage", payload, env);
                        if (tgResponse && typeof tgResponse.json === "function") tgResponse = await tgResponse.json();

                        if (tgResponse && tgResponse.ok) {
                            autoDeleteMessage(chatId, tgResponse.result.message_id, env, 5000);
                            await autoDeleteMessage(chatId, message.message_id, env, 5000);
                        }
                    }
                })(),
            );
            return new Response("OK", { status: 200 });
        }
    }

    // when no args
    ctx.waitUntil(
        (async () => {
            const payload = {
                chat_id: chatId,
                text: "⚠️ Vui lòng sử dụng cú pháp:\n<code>/fbfix &lt;facebookUrl&gt;</code>\n<code>/fbfix@uruha_lucia_bot &lt;facebookUrl&gt;</code>\n\n<b>[Thông báo sẽ tự động xoá sau 5s.]</b>",
                parse_mode: "HTML",
                reply_parameters: { message_id: message.message_id },
            };
            if (threadId) payload.message_thread_id = threadId;

            let tgResponse = await callTelegramApi("sendMessage", payload, env);
            if (tgResponse && typeof tgResponse.json === "function") tgResponse = await tgResponse.json();

            if (tgResponse && tgResponse.ok) {
                autoDeleteMessage(chatId, tgResponse.result.message_id, env, 5000);
                await autoDeleteMessage(chatId, message.message_id, env, 5000);
            }
        })(),
    );
    return new Response("OK", { status: 200 });
}
