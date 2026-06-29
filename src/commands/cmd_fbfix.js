import { fetchFacebookOgUrl, fetchVideoWithFallback } from "../utils/facebook.js";
import { callTelegramApi, autoDeleteMessage, setReaction, escapeTgHtml } from "../utils/telegram.js";

export async function handleFbfix({ env, ctx, chatId, threadId, message, args }) {
    if (args) {
        const urlRegex = /(https?:\/\/(?:[\w-]+\.)?(?:facebook\.com|fb\.watch|fb\.com)\/[^\s\n\r"']+)/i;
        const matchUrl = args.match(urlRegex);

        if (matchUrl) {
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
                    await setReaction(chatId, message.message_id, "👌", env); // feedback reaction

                    try {
                        let userDisplay = null;
                        const result = await fetchFacebookOgUrl(matchUrl[0], userDisplay);
                        if (result.text.includes("❌")) throw new Error(result.text); // if fetch fails, throw error

                        let isMediaSentSuccess = false;
                        let tgErrorLog = "";

                        const isReel =
                            (result.url && (result.url.includes("/reel/") || result.url.includes("/watch/") || result.url.includes("/videos/"))) ||
                            (matchUrl[0] &&
                                (matchUrl[0].includes("/reel/") ||
                                    matchUrl[0].includes("/watch/") ||
                                    matchUrl[0].includes("/videos/") ||
                                    matchUrl[0].includes("/share/v/") ||
                                    matchUrl[0].includes("/share/r/")));

                        // if post is a video => video from api, or parsed url + metadata + og:image (preview replacement)
                        if (isReel) {
                            const apiResult = await fetchVideoWithFallback(matchUrl[0], env);

                            let quotaText = "";
                            if (apiResult.quota) {
                                const q = apiResult.quota;
                                const limitStr = q.limit !== "N/A" ? `/${q.limit}` : "";
                                quotaText = `\n\n📊 ${q.name} quota: Used ${q.used}${limitStr} (${q.attempt}/${q.total})`;
                            }

                            let finalCaption = result.text;
                            if (apiResult.url) {
                                finalCaption = finalCaption.replace(/(👤 <b>Nguồn:<\/b> <a href="[^"]+">.*?<\/a>)/, `$1 | <a href="${escapeTgHtml(apiResult.url)}">MEDIA</a>`);
                            }
                            if (quotaText) finalCaption += quotaText;

                            const MAX_TG_SIZE = 50 * 1024 * 1024; // upload limit for bots = 50MB
                            // if video size < 50MB, send video
                            if (apiResult.url) {
                                if (apiResult.size > 0 && apiResult.size < MAX_TG_SIZE) {
                                    const payload = {
                                        chat_id: chatId,
                                        text: finalCaption,
                                        parse_mode: "HTML",
                                        reply_parameters: { message_id: message.message_id },
                                        link_preview_options: {
                                            is_disabled: false,
                                            prefer_large_media: true,
                                            url: apiResult.url,
                                        },
                                    };
                                    if (threadId) payload.message_thread_id = threadId;

                                    let tgResponse = await callTelegramApi("sendMessage", payload, env);
                                    let jsonResponse = typeof tgResponse.json === "function" ? await tgResponse.json() : tgResponse;

                                    if (jsonResponse && jsonResponse.ok) {
                                        isMediaSentSuccess = true;
                                    } else {
                                        tgErrorLog = `Telegram SendMedia Error: ${jsonResponse.description}`;
                                    }
                                } else {
                                    const sizeStr = apiResult.size > 0 ? `${(apiResult.size / 1024 / 1024).toFixed(2)}MB` : "Unknown";
                                    tgErrorLog = `Media Size Limit Exceeded / Unknown (${sizeStr}). Triggering Photo Fallback.`;
                                }
                            } else {
                                tgErrorLog = `Media API Error: ${apiResult.error}`;
                            }

                            // if video > 50MB or fetch fails, send photo + encapsulated video url
                            const fallbackImage = result.ogImage || (result.mediaUrls && result.mediaUrls.length > 0 ? result.mediaUrls[0] : null);
                            if (!isMediaSentSuccess && fallbackImage) {
                                let photoCaption = finalCaption;
                                if (tgErrorLog) {
                                    const safeErr = tgErrorLog.length > 200 ? tgErrorLog.substring(0, 200) + "..." : tgErrorLog;
                                    photoCaption += `\n\n⚠️ <b>[Lỗi Lấy Video]:</b> <code>${escapeTgHtml(safeErr)}</code>`;
                                }

                                const payload = {
                                    chat_id: chatId,
                                    photo: fallbackImage,
                                    caption: photoCaption,
                                    parse_mode: "HTML",
                                    reply_parameters: { message_id: message.message_id },
                                };
                                if (threadId) payload.message_thread_id = threadId;

                                let tgResponse = await callTelegramApi("sendPhoto", payload, env);
                                let jsonResponse = typeof tgResponse.json === "function" ? await tgResponse.json() : tgResponse;

                                if (jsonResponse && jsonResponse.ok) {
                                    isMediaSentSuccess = true;
                                } else if (jsonResponse && !jsonResponse.ok) {
                                    tgErrorLog += ` | Telegram sendPhoto Error: ${jsonResponse.description}`;
                                }
                            }
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
                            let fallbackText =
                                isReel ?
                                    result.text.replace(/(👤 <b>Nguồn:<\/b> <a href="[^"]+">.*?<\/a>)/, `$1 | <a href="${escapeTgHtml(matchUrl[0])}">VIDEO</a>`)
                                :   result.text;

                            if (tgErrorLog) {
                                const safeErr = tgErrorLog.length > 200 ? tgErrorLog.substring(0, 200) + "..." : tgErrorLog;
                                fallbackText += `\n\n⚠️ <b>[Lỗi Gửi Media]:</b> <code>${escapeTgHtml(safeErr)}</code>`;
                            }

                            const sendPayload = {
                                chat_id: chatId,
                                text: fallbackText,
                                parse_mode: "HTML",
                                reply_parameters: { message_id: message.message_id },
                            };
                            if (threadId) sendPayload.message_thread_id = threadId;

                            sendPayload.link_preview_options = {
                                is_disabled: false,
                                prefer_large_media: true,
                                ...(result.url && { url: result.url }),
                            };

                            let tgResponse = await callTelegramApi("sendMessage", sendPayload, env);
                            let jsonResponse = typeof tgResponse.json === "function" ? await tgResponse.json() : tgResponse;

                            if (jsonResponse && !jsonResponse.ok) throw new Error(`Telegram Error: ${jsonResponse.description}`); // if fallback fails, throw error
                        }

                        if (tgErrorLog) ctx.waitUntil(setReaction(chatId, message.message_id, "😢", env)); // feedback reaction
                    } catch (e) {
                        await setReaction(chatId, message.message_id, "😭", env); // feedback reaction

                        const errorMsg =
                            e.message.includes("❌") ?
                                e.message
                            :   "❌ Lỗi không xác định khi tải nội dung. Mạng không ổn định hoặc facebook đã đổi thuật toán!\n\n<b>[Thông báo sẽ tự động xoá sau 5s.]</b>";
                        const payload = {
                            chat_id: chatId,
                            text: `${errorMsg}`,
                            parse_mode: "HTML",
                            reply_parameters: { message_id: message.message_id },
                        };
                        if (threadId) payload.message_thread_id = threadId;

                        let tgResponse = await callTelegramApi("sendMessage", payload, env);
                        if (tgResponse && typeof tgResponse.json === "function") tgResponse = await tgResponse.json();
                        if (tgResponse && tgResponse.ok) {
                            ctx.waitUntil(autoDeleteMessage(chatId, tgResponse.result.message_id, env, 5000));
                            ctx.waitUntil(autoDeleteMessage(chatId, message.message_id, env, 5000));
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
            await setReaction(chatId, message.message_id, "😢", env); // feedback reaction

            const payload = {
                chat_id: chatId,
                text:
                    `⚠️ <b>Sai cú pháp!</b>\n\n` +
                    `Vui lòng sử dụng cú pháp:\n` +
                    `<code>/testfbfix &lt;facebookUrl&gt;</code>\n` +
                    `<code>/testfbfix@uruha_lucia_bot &lt;facebookUrl&gt;</code>\n\n` +
                    `<b>[Thông báo sẽ tự động xoá sau 5s.]</b>`,
                parse_mode: "HTML",
                reply_parameters: { message_id: message.message_id },
            };
            if (threadId) payload.message_thread_id = threadId;

            let tgResponse = await callTelegramApi("sendMessage", payload, env);
            if (tgResponse && typeof tgResponse.json === "function") tgResponse = await tgResponse.json();

            if (tgResponse && tgResponse.ok) {
                ctx.waitUntil(autoDeleteMessage(chatId, tgResponse.result.message_id, env, 5000));
                ctx.waitUntil(autoDeleteMessage(chatId, message.message_id, env, 5000));
            }
        })(),
    );
    return new Response("OK", { status: 200 });
}
