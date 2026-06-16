export default {
    async fetch(request, env, ctx) {
        // =============================================
        // setup
        const callTelegramApi = async (method, payload) => {
            const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;
            return fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
        };

        // fbfix: logic
        const fetchFacebookOgUrl = async (inputUrl, userDisplayContext = "") => {
            try {
                const response = await fetch(inputUrl, {
                    method: "GET",
                    headers: {
                        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
                        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
                    },
                    redirect: "follow",
                });

                // fetching finalUrl
                let finalUrl = response.url;
                if (finalUrl.includes("/login/") && finalUrl.includes("next=")) {
                    try {
                        const urlObj = new URL(finalUrl);
                        const nextParam = urlObj.searchParams.get("next");
                        if (nextParam) {
                            finalUrl = decodeURIComponent(nextParam);
                        }
                    } catch (e) {}
                } else {
                    const html = await response.text();
                    const ogUrlMatch =
                        html.match(/<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:url["']/i);
                    if (ogUrlMatch && ogUrlMatch[1]) {
                        finalUrl = ogUrlMatch[1].replace(/&amp;/g, "&");
                    }
                }
                if (!finalUrl) return { text: "❌ Không tìm thấy URL hợp lệ.", url: null };

                // recreating canonical url when encountered professional profile
                try {
                    const parsedUrl = new URL(finalUrl);
                    if (parsedUrl.pathname.includes("story.php") || parsedUrl.pathname.includes("permalink.php")) {
                        const storyId = parsedUrl.searchParams.get("story_fbid");
                        const pageId = parsedUrl.searchParams.get("id");

                        if (storyId && pageId) {
                            finalUrl = `https://www.facebook.com/${pageId}/posts/${storyId}/`;
                        }
                    }
                } catch (e) {}

                // cleaning tracking parameters
                try {
                    const parsedUrl = new URL(finalUrl);
                    parsedUrl.searchParams.delete("rdid");
                    parsedUrl.searchParams.delete("share_url");
                    finalUrl = parsedUrl.toString();
                } catch (err) {}

                // decoding url-encoded characters
                // try {
                //     finalUrl = decodeURI(finalUrl);
                // } catch (e) {}

                // detecting private groups/pages
                if (finalUrl.includes("facebook.com/login")) {
                    return {
                        text: "❌ Không thể lấy được URL gốc do nguồn cấp là nhóm kín, trang cá nhân chuyên nghiệp hoặc lỗi khác.\nThử lại với URL từ tính năng Chia sẻ của Facebook thay vì copy link trực tiếp từ thanh địa chỉ.",
                        url: null,
                    };
                }

                const prefix = userDisplayContext ? `${userDisplayContext}\n` : "";
                return { text: `${prefix}✅ <b>URL Gốc:</b>\n${finalUrl}`, url: finalUrl };
            } catch (error) {
                return "❌ Đã xảy ra lỗi mạng khi kết nối đến Facebook."; // if network error
            }
        };

        // =============================================
        // handle request
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

            // command: start
            if (command === "start") {
                const payload = {
                    method: "sendMessage",
                    chat_id: chatId,
                    text: "👋 Xin chào! Tôi là Lucia Bot.\n\nHãy xem qua danh sách lệnh để xem tôi có thể giúp gì cho bạn.",
                    parse_mode: "HTML",
                };
                if (threadId) payload.message_thread_id = threadId;
                return new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } });
            }

            // command: info
            if (command === "info") {
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
                if (topicId) {
                    segmentB += `- Is in a Topic: True | Topic ID: ${topicId}\n`;
                }

                const ip = reqHeaders.get("cf-connecting-ip") || "Unknown";
                const country = reqHeaders.get("cf-ipcountry") || "Unknown";
                const segmentC = `\n<b>Where I reside:</b>\n` + `- IP: ${ip} | Country: ${country}`;

                let infoText = segmentA + segmentB + segmentC;

                const payload = {
                    method: "sendMessage",
                    chat_id: chatId,
                    text: infoText,
                    parse_mode: "HTML",
                };
                if (threadId) payload.message_thread_id = threadId;
                return new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } });
            }

            // command: fbfix
            if (command === "fbfix") {
                if (args) {
                    const urlRegex = /(?:https?:\/\/)?(?:www\.)?facebook\.com\/[^\s]+/i;
                    const matchUrl = args.match(urlRegex);

                    if (matchUrl) {
                        const firstName = message.from.first_name || "";
                        const lastName = message.from.last_name || "";
                        const username = message.from.username ? `@${message.from.username}` : "<username not set>";

                        const nameStr = `${firstName} ${lastName}`.trim() || "Người dùng";
                        let userDisplay = `🙍‍♂️ Phản hồi cho: ${nameStr}`;
                        if (username) userDisplay += ` - ${username}`;

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
                                await callTelegramApi("sendMessage", sendPayload);
                            })(),
                        );
                        return new Response("OK", { status: 200 });
                    } else {
                        const payload = {
                            method: "sendMessage",
                            chat_id: chatId,
                            text: "❌ Link không hợp lệ. Vui lòng cung cấp link Facebook đúng định dạng.",
                            parse_mode: "HTML",
                            reply_parameters: { message_id: message.message_id },
                        };
                        if (threadId) payload.message_thread_id = threadId;
                        return new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } });
                    }
                } else {
                    const payload = {
                        method: "sendMessage",
                        chat_id: chatId,
                        text: "⚠️ Vui lòng sử dụng cú pháp:\n<code>/fbfix &lt;facebookUrl&gt;</code>\n<code>/fbfix@@uruha_lucia_bot &lt;facebookUrl&gt;</code>",
                        parse_mode: "HTML",
                        reply_parameters: { message_id: message.message_id },
                    };
                    if (threadId) payload.message_thread_id = threadId;
                    return new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } });
                }
            }

            return new Response("OK", { status: 200 });
        } catch (error) {
            console.error("Error parsing webhook:", error);
            return new Response("Internal Server Error", { status: 500 });
        }
    },
};
