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
                    headers: { "User-Agent": "curl/7.81.0", Accept: "*/*" },
                    redirect: "manual",
                });

                // fetching finalUrl
                let finalUrl = "";
                if (response.status >= 300 && response.status < 400) {
                    const location = response.headers.get("Location");
                    if (location) {
                        if (location.includes("/login/") && location.includes("next=")) {
                            try {
                                const urlObj = new URL(location, "https://www.facebook.com");
                                const nextParam = urlObj.searchParams.get("next");
                                if (nextParam) {
                                    finalUrl = decodeURIComponent(nextParam);
                                } else {
                                    finalUrl = location;
                                }
                            } catch (e) {
                                finalUrl = location;
                            }
                        } else {
                            finalUrl = location;
                        }
                    }
                }

                // extracting og:url
                if (!finalUrl) {
                    const html = await response.text();
                    const ogUrlMatch =
                        html.match(/<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:url["']/i);
                    if (ogUrlMatch && ogUrlMatch[1]) {
                        finalUrl = ogUrlMatch[1].replace(/&amp;/g, "&");
                    }
                }
                if (!finalUrl) return "❌ Không tìm thấy thẻ <code>og:url</code> trong trang đích."; // if not found og:url

                // processing finalUrl
                try {
                    finalUrl = decodeURIComponent(finalUrl); // decode url-encoded characters

                    // cleaning tracking parameters
                    try {
                        const parsedUrl = new URL(finalUrl);
                        parsedUrl.searchParams.delete("rdid");
                        parsedUrl.searchParams.delete("share_url");
                        finalUrl = parsedUrl.toString();
                    } catch (err) {
                        // if cleaning fails, keep original finalUrl
                    }
                } catch (e) {
                    // if decoding fails, keep original finalUrl
                }

                // detecting private groups/pages or professional profiles
                if (finalUrl.includes("facebook.com/login")) {
                    return "❌ Không thể lấy được URL gốc do nguồn cấp là nhóm kín, trang cá nhân chuyên nghiệp hoặc lỗi khác.\nThử lại với URL từ tính năng Chia sẻ của Facebook thay vì copy link trực tiếp từ thanh địa chỉ.";
                }

                const prefix = userDisplayContext ? `${userDisplayContext}\n` : "";
                return `${prefix}✅ <b>URL Gốc:</b>\n${finalUrl}`;
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

                        const replyText = await fetchFacebookOgUrl(matchUrl[0], userDisplay);

                        ctx.waitUntil(
                            (async () => {
                                const sendPayload = {
                                    chat_id: chatId,
                                    text: replyText,
                                    parse_mode: "HTML",
                                    link_preview_options: { prefer_large_media: true },
                                };
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
                        };
                        if (threadId) payload.message_thread_id = threadId;
                        return new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } });
                    }
                } else {
                    const payload = {
                        method: "sendMessage",
                        chat_id: chatId,
                        text: "⚠️ Vui lòng sử dụng cú pháp:\n<code>/fbfix &lt;facebookUrl&gt;</code>\n<code>/fbfix@nekoz410_lucia_bot &lt;facebookUrl&gt;</code>",
                        parse_mode: "HTML",
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
