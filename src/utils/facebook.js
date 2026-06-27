// helper: decode HTML entities and JSON unicode escapes
const decodeFbEntities = (str) => {
    if (!str) return "";
    let decoded = str
        .replace(/\\u([0-9a-fA-F]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))) // unicode escapes
        .replace(/\\n/g, "\n") // JSON newlines
        .replace(/\\"/g, '"') // quotes
        .replace(/\\\//g, "/"); // slashes

    decoded = decoded.replace(/\\\\/g, "\\"); // double escaping

    // HTML entities
    return decoded
        .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
};

// helper: escape HTML specifically for Telegram parse_mode
const escapeTgHtml = (text) => {
    if (!text) return "";
    return text
        .replace(/&(?!amp;|lt;|gt;|quot;|apos;)/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
};

// helper: get visible length of a string
const getVisibleLength = (htmlStr) => {
    if (!htmlStr) return 0;
    let plain = htmlStr.replace(/<[^>]*>?/gm, "");
    return plain
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'").length;
};

const GET_VIDEO_APIS = [
    {
        name: "ig-scraper-api", // 10 reqs/month
        buildRequest: (videoUrl, env) => {
            const url = new URL("https://instagram-scraper-api-stories-reels-va-post.p.rapidapi.com/");
            url.searchParams.append("url", videoUrl);
            return {
                url: url.toString(),
                options: {
                    method: "GET",
                    headers: {
                        "x-rapidapi-key": env.RAPIDAPI_KEY,
                        "x-rapidapi-host": "instagram-scraper-api-stories-reels-va-post.p.rapidapi.com",
                        "Content-Type": "application/json",
                    },
                },
            };
        },
    },
    {
        name: "ig-downloader", // 50 reqs/month
        buildRequest: (videoUrl, env) => {
            const url = new URL("https://instagram-downloader-download-instagram-videos-stories1.p.rapidapi.com/get-info-rapidapi");
            url.searchParams.append("url", videoUrl);
            return {
                url: url.toString(),
                options: {
                    method: "GET",
                    headers: {
                        "x-rapidapi-key": env.RAPIDAPI_KEY,
                        "x-rapidapi-host": "instagram-downloader-download-instagram-videos-stories1.p.rapidapi.com",
                        "Content-Type": "application/json",
                    },
                },
            };
        },
    },
    {
        name: "fb-media-api", // 100 reqs/month
        buildRequest: (videoUrl, env) => {
            return {
                url: "https://facebook-media-api.p.rapidapi.com/media/html",
                options: {
                    method: "POST",
                    headers: {
                        "x-rapidapi-key": env.RAPIDAPI_KEY,
                        "x-rapidapi-host": "facebook-media-api.p.rapidapi.com",
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ url: videoUrl, cookie: "" }),
                },
            };
        },
    },
    {
        name: "snap-video3", // 100 reqs/month
        buildRequest: (videoUrl, env) => {
            return {
                url: "https://snap-video3.p.rapidapi.com/download",
                options: {
                    method: "POST",
                    headers: {
                        "x-rapidapi-key": env.RAPIDAPI_KEY,
                        "x-rapidapi-host": "snap-video3.p.rapidapi.com",
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ url: videoUrl, "shortcuts-json-format": false }),
                },
            };
        },
    },
    {
        name: "fastsaver", // => ~500 reqs/month (1000 credits/month, fb cost 2)
        buildRequest: (videoUrl, env) => {
            const url = new URL("https://api.fastsaver.io/v1/fetch");
            url.searchParams.append("url", videoUrl);
            return {
                url: url.toString(),
                options: {
                    method: "GET",
                    headers: {
                        "X-Api-Key": env.FASTSAVER_API_KEY,
                    },
                },
            };
        },
    },
];

// helper: fetch video from api
export const fetchVideoWithFallback = async (videoUrl, env) => {
    let errorLogs = [];
    const totalApis = GET_VIDEO_APIS.length;

    for (let i = 0; i < totalApis; i++) {
        const api = GET_VIDEO_APIS[i];
        const attemptNum = i + 1;

        try {
            const requestData = api.buildRequest(videoUrl, env);
            const response = await fetch(requestData.url, requestData.options);

            // quota check
            const limitHeader = response.headers.get("x-ratelimit-requests-limit") || response.headers.get("x-ratelimit-limit");
            const remainingHeader = response.headers.get("x-ratelimit-requests-remaining") || response.headers.get("x-ratelimit-remaining");
            let quotaInfo = {
                name: api.name,
                limit: limitHeader ? parseInt(limitHeader) : "N/A",
                remaining: remainingHeader ? parseInt(remainingHeader) : "N/A",
                used: limitHeader && remainingHeader ? parseInt(limitHeader) - parseInt(remainingHeader) : "N/A",
                attempt: attemptNum,
                total: totalApis,
            };
            if (quotaInfo.remaining !== "N/A" && quotaInfo.remaining <= 0) {
                errorLogs.push(`Quota Exceeded (${api.name})`);
                continue;
            }

            // error check
            if (!response.ok) {
                let errorText = await response.text();
                if (errorText.length > 500) errorText = errorText.substring(0, 500) + "...";
                errorLogs.push(`[${response.status}] ${errorText} (${api.name})`);
                continue;
            }

            // JSON decoder
            const data = await response.json();
            let foundUrl = null;
            // prioritize "medias" array
            if (data.medias && Array.isArray(data.medias) && data.medias.length > 0) {
                const videos = data.medias.filter((m) => m.type !== "audio");
                const targetList = videos.length > 0 ? videos : data.medias;
                const hdVideo = targetList.find((m) => m.quality && m.quality.toLowerCase().includes("hd"));
                foundUrl = hdVideo ? hdVideo.url : targetList[0].url;
            }
            // use specific fields
            else if (data.download_url) foundUrl = data.download_url;
            else if (data.video_url) foundUrl = data.video_url;
            else if (data.data && data.data.hd) foundUrl = data.data.hd;
            else if (data.data && data.data.video) foundUrl = data.data.video;
            else if (data.data && data.data.url) foundUrl = data.data.url;
            else if (data.links && Array.isArray(data.links) && data.links.length > 0) foundUrl = data.links[0].url || data.links[0].link;
            // use common fields
            else if (data.url && typeof data.url === "string" && data.url !== videoUrl) foundUrl = data.url;

            if (foundUrl) return { url: foundUrl, error: null, quota: quotaInfo };
            errorLogs.push(`Unknown JSON (${api.name}): ${JSON.stringify(data).substring(0, 100)}`);
        } catch (error) {
            errorLogs.push(`Lỗi Mạng: ${error.message} (${api.name})`);
        }
    }

    return { url: null, error: errorLogs.join(" -> "), quota: null };
};

// helper: fetch facebook og url and media list
export const fetchFacebookOgUrl = async (inputUrl, userDisplayContext = "") => {
    const DEBUG_NETWORK = false;
    const DEBUG_MEDIA = false;
    let debugNetworkText = "";
    let debugMediaText = "";

    const fetchSettings = {
        method: "GET",
        headers: {
            "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        redirect: "follow",
    };

    try {
        // ===== initial fetch =====
        // DEBUG: print pre-fetch info
        if (DEBUG_NETWORK) debugNetworkText += `\n\n🌐 <b>[DEBUG NETWORK]</b>\n- <b>Input URL:</b> <a href="${escapeTgHtml(inputUrl)}">INPUT URL</a>`;

        const response = await fetch(inputUrl, fetchSettings);

        // ===== process & standardize original url =====
        let finalUrl = response.url;
        let html = "";
        let needsRefetch = false;

        // process response
        if (finalUrl.includes("/login/") && finalUrl.includes("next=")) {
            // DEBUG: print post-fetch info
            if (DEBUG_NETWORK) debugNetworkText += `\n- <b>Fetch response:</b> [${response.status}] | Force login (with next param)`;

            try {
                const urlObj = new URL(finalUrl);
                const nextParam = urlObj.searchParams.get("next");
                if (nextParam) {
                    finalUrl = decodeURIComponent(nextParam);
                    needsRefetch = true;

                    // DEBUG: print post-fetch info
                    if (DEBUG_NETWORK) debugNetworkText += ` | <a href="${escapeTgHtml(finalUrl)}">FETCHED URL</a>`;
                }
            } catch (e) {}
        } else {
            html = await response.text();

            // DEBUG: print post-fetch info
            if (DEBUG_NETWORK) {
                debugNetworkText += `\n- <b>Fetch response:</b> [${response.status}] | ${(html.length / 1024).toFixed(1)} KB`;
                if (finalUrl !== inputUrl) debugNetworkText += ` | <a href="${escapeTgHtml(finalUrl)}">FETCHED URL</a>`;
            }

            const ogUrlMatch =
                html.match(/<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["']/i) ||
                html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:url["']/i) ||
                html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) ||
                html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);

            if (ogUrlMatch && ogUrlMatch[1]) {
                const newUrl = ogUrlMatch[1].replace(/&amp;/g, "&");
                if (newUrl.includes("facebook.com") && newUrl !== finalUrl) {
                    finalUrl = newUrl;

                    // DEBUG: print prioritized url if found
                    if (DEBUG_NETWORK) debugNetworkText += `\n- <b>Prioritized URL (og:url/link:rel=canonical):</b> <a href="${escapeTgHtml(finalUrl)}">PRIORITIZED URL</a>`;
                }
            }
        }
        if (!finalUrl) return { text: "❌ Không tìm thấy URL hợp lệ.", url: null, mediaUrls: [] };

        // standardize url
        try {
            let parsedUrl = new URL(finalUrl);
            parsedUrl.searchParams.delete("rdid");
            parsedUrl.searchParams.delete("share_url");
            finalUrl = parsedUrl.toString();

            if (parsedUrl.pathname.includes("story.php") || parsedUrl.pathname.includes("permalink.php")) {
                const storyId = parsedUrl.searchParams.get("story_fbid");
                const pageId = parsedUrl.searchParams.get("id");
                if (storyId && pageId) {
                    finalUrl = `https://www.facebook.com/${pageId}/posts/${storyId}/`;
                    needsRefetch = true;
                }
            }
        } catch (err) {}
        if (finalUrl.includes("facebook.com/login")) return { text: "❌ Không thể lấy được URL gốc do nguồn cấp là nhóm kín.", url: null, mediaUrls: [] };

        // refecth if needed
        if (needsRefetch) {
            try {
                // DEBUG: print pre-refetch info
                if (DEBUG_NETWORK) debugNetworkText += `\n- <b>Refetch input URL:</b> <a href="${escapeTgHtml(finalUrl)}">REFETCH INPUT URL</a>`;

                const refetchResponse = await fetch(finalUrl, fetchSettings);
                if (refetchResponse.ok) {
                    html = await refetchResponse.text();

                    // DEBUG: print post-refetch info
                    if (DEBUG_NETWORK) {
                        debugNetworkText += `\n- <b>Refetch response:</b> [${refetchResponse.status}] | ${(html.length / 1024).toFixed(1)} KB`;
                        if (refetchResponse.url !== finalUrl) {
                            debugNetworkText += ` | <a href="${escapeTgHtml(refetchResponse.url)}">REFETCHED URL</a>`;
                        } else {
                            debugNetworkText += ` | REFETCHED URL = FETCHED URL`;
                        }
                        if (refetchResponse.url.includes("/login")) debugNetworkText += `\n- ⚠️ <b>CẢNH BÁO:</b> Lần 2 đã bị Facebook chặn và ép đăng nhập!`;
                    }

                    // catch og:url or link:rel=canonical
                    const reFetchOgMatch =
                        html.match(/<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:url["']/i) ||
                        html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) ||
                        html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);

                    if (reFetchOgMatch && reFetchOgMatch[1]) {
                        const newUrl = reFetchOgMatch[1].replace(/&amp;/g, "&");
                        if (newUrl.includes("facebook.com") && !newUrl.includes("story.php") && newUrl !== finalUrl) {
                            finalUrl = newUrl;

                            // DEBUG: print prioritized url if found
                            if (DEBUG_NETWORK)
                                debugNetworkText += `\n- <b>Prioritized URL (og:url/link:rel=canonical):</b> <a href="${escapeTgHtml(finalUrl)}">PRIORITIZED URL</a>`;
                        }
                    }
                }
            } catch (e) {
                // DEBUG: print error
                if (DEBUG_NETWORK) debugNetworkText += `\n- ❌ <b>Fetch Lần 2 thất bại:</b> ${escapeTgHtml(e.message)}`;
            }
        }

        // ===== fetch media =====
        const mediaUrls = [];
        let ogImage = null;
        if (html) {
            // take og:image as fallback image
            const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
            if (ogImageMatch && ogImageMatch[1]) {
                ogImage = decodeFbEntities(ogImageMatch[1]);
            }

            let validIds = [];

            // using smart regex first
            const attachmentRegex = /"all_subattachments"\s*:\s*\{"nodes"\s*:\s*\[([\s\S]*?)\]\}/;
            const attachMatch = html.match(attachmentRegex);
            if (attachMatch) {
                const nodeStr = attachMatch[1];
                const idRegex = /"id"\s*:\s*"(\d{14,18})"/g;
                let idMatch;
                while ((idMatch = idRegex.exec(nodeStr)) !== null) {
                    validIds.push(idMatch[1]);
                }
            }

            // using lookaside api then
            if (validIds.length === 0) {
                const lookasideRegex = /media_id=(\d{14,18})/g;
                const allIds = [];
                let match;
                while ((match = lookasideRegex.exec(html)) !== null) allIds.push(match[1]);

                if (allIds.length > 0) {
                    const baseId = allIds[0];
                    const basePrefix = baseId.substring(0, 5);
                    const baseLen = baseId.length;
                    validIds = [...new Set(allIds)].filter((id) => id.length === baseLen && id.substring(0, 5) === basePrefix); // only keep ones with same prefix
                }
            }

            validIds = [...new Set(validIds)].slice(0, 10); // remove duplication and limit at first 10 images
            // if post has multiple images
            if (validIds.length > 0) {
                const finalUrls = validIds.map((id) => `https://lookaside.fbsbx.com/lookaside/crawler/media/?media_id=${id}`); // using lookaside api
                mediaUrls.push(...finalUrls);

                // DEBUG: print media fetch info
                if (DEBUG_MEDIA) {
                    debugMediaText = `\n\n🖼 <b>[DEBUG MEDIA]</b>\n` + `- <b>Valid IDs:</b> ${validIds.length}\n` + `- <b>Image URL list (max 10):</b>\n`;

                    const chunks = [];
                    for (let i = 0; i < mediaUrls.length; i += 5) chunks.push(mediaUrls.slice(i, i + 5)); // chunks of 5
                    const rows = chunks.map((chunk, chunkIdx) => {
                        return chunk
                            .map((url, idx) => {
                                const globalIdx = chunkIdx * 5 + idx + 1;
                                return `<a href="${escapeTgHtml(url)}">IMAGE ${globalIdx}</a>`;
                            })
                            .join(" | ");
                    });
                    debugMediaText += rows.join("\n");
                }
            }
            // else, fallback to og:image
            else if (ogImage) {
                mediaUrls.push(ogImage); // fallback to og:image
            }
        }

        // ===== extract metadata =====
        let author = "Không rõ";
        let caption = "";
        let interactions = "Không rõ";
        let time = "Không rõ";

        if (html) {
            // get author: deep regex scanning
            const authorJsonMatch =
                html.match(/"video_owner":\{[^}]*?"name":"([^"]+)"/i) ||
                html.match(/"owning_profile":\{[^}]*?"name":"([^"]+)"/i) ||
                html.match(/"owner":\{[^}]*?"__isVideoOwner"[^}]*?"name":"([^"]+)"/i) ||
                html.match(/"owner":\{[^}]*?"name":"([^"]+)"[^}]*?"__isVideoOwner"/i) ||
                html.match(/"publisher":\{"@type":"[^"]+","name":"([^"]+)"/i) ||
                html.match(/"ownerName":"([^"]+)"/i) ||
                html.match(/"page":\{"__typename":"Page","id":"[^"]+","name":"([^"]+)"/i) ||
                html.match(/"node":\{"__typename":"(?:Page|User)","id":"[^"]+","name":"([^"]+)"/i) ||
                html.match(/"author":\{"__typename":"(?:Page|Group|User)","[^}]*?"name":"([^"]+)"/i) ||
                html.match(/"author":\{"__typename":"[^"]+","id":"[^"]+","name":"([^"]+)"/i) ||
                html.match(/"actors":\s*\[\s*\{[^}]*?"name":"([^"]+)"/i) ||
                html.match(/"actor":\s*\{[^}]*?"name":"([^"]+)"/i) ||
                html.match(/"name":"([^"]+)","__isActor"/i) ||
                html.match(/"name":"([^"]+)","__isProfile"/i);
            if (authorJsonMatch && authorJsonMatch[1]) author = decodeFbEntities(authorJsonMatch[1]);

            // get author: looking for title
            if (author === "Không rõ") {
                const titleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
                if (titleMatch) {
                    const fullTitle = decodeFbEntities(titleMatch[1]);
                    const parts = fullTitle.split(/[-|]/).map((p) => p.trim());

                    author =
                        parts.find((part) => {
                            const lower = part.toLowerCase();
                            return (
                                lower !== "facebook" &&
                                lower !== "watch" &&
                                lower !== "reels" &&
                                !lower.includes("lượt xem") &&
                                !lower.includes("views") &&
                                !lower.includes("cảm xúc") &&
                                !lower.includes("reactions")
                            );
                        }) || "Không rõ";
                }
            }

            // get author: looking for group name
            if (finalUrl.includes("/groups/")) {
                const groupJsonMatch =
                    html.match(/"group"\s*:\s*\{[^}]*?"name"\s*:\s*"([^"]+)"/i) ||
                    html.match(/"__typename"\s*:\s*"Group"(?:[^}]*?)"name"\s*:\s*"([^"]+)"/i) ||
                    html.match(/"group_name"\s*:\s*"([^"]+)"/i);

                if (groupJsonMatch && groupJsonMatch[1]) {
                    const groupName = decodeFbEntities(groupJsonMatch[1]);

                    if (author !== "Không rõ" && author !== groupName && !author.includes(groupName)) {
                        author = `${author} • ${groupName}`;
                    } else if (author === "Không rõ") {
                        author = groupName;
                    }
                }
            }

            // get caption: choosing the longest one
            let captionCandidates = [];
            const descMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
            let baseCaption = "";
            if (descMatch) {
                baseCaption = decodeFbEntities(descMatch[1]).trim();
                captionCandidates.push(baseCaption);
            }

            const snippet = baseCaption
                .replace(/\.\.\.\s*$/, "")
                .substring(0, 20)
                .trim();

            // get caption: looking for title tag
            const titleTagMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
            if (titleTagMatch) {
                let titleText = decodeFbEntities(titleTagMatch[1]).trim();
                const lastPipeIndex = titleText.lastIndexOf(" | ");
                if (lastPipeIndex !== -1) {
                    titleText = titleText.substring(0, lastPipeIndex).trim();
                }
                if (!snippet || titleText.includes(snippet)) {
                    captionCandidates.push(titleText);
                }
            }

            // get caption: decoding message
            const messageRegex = /"message":\s*\{\s*"text":\s*"((?:[^"\\]|\\.)*)"\s*\}/gi;
            let msgMatch;
            while ((msgMatch = messageRegex.exec(html)) !== null) {
                const decodedMsg = decodeFbEntities(msgMatch[1]).trim();
                if (snippet && decodedMsg.includes(snippet)) captionCandidates.push(decodedMsg);
            }
            if (captionCandidates.length > 0) {
                caption = captionCandidates.reduce((a, b) => (a.length > b.length ? a : b), "");
                caption = caption.replace(/@(?=\S)/g, "@ ").replace(/#(?=\S)/g, "# ");

                if (author && author !== "Không rõ") {
                    const authorParts = author.split(" • ");
                    for (const part of authorParts) {
                        const escapedPart = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // escape special characters
                        const startRegex = new RegExp(`^${escapedPart}\\s*[-|:,]?\\s*`, "i"); // remove author, at the beginning
                        const endRegex = new RegExp(`\\s*[-|:,]?\\s*${escapedPart}$`, "i"); // remove author, at the end
                        caption = caption.replace(startRegex, "").replace(endRegex, "").trim();
                    }
                    caption = caption.replace(/^[-|:,]\s*/, ""); // remove leading punctuation
                }
            }

            // get timestamp
            const timeMatch = html.match(/"creation_time":\s*(\d+)/i) || html.match(/"publish_time":\s*(\d+)/i);
            if (timeMatch && timeMatch[1]) {
                const date = new Date(parseInt(timeMatch[1]) * 1000);
                time = date.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
            } else {
                const datePubMatch = html.match(/"datePublished":"([^"]+)"/i);
                if (datePubMatch && datePubMatch[1]) time = new Date(datePubMatch[1]).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
            }

            // get interactions
            let interactionArr = [];
            let likes = null,
                comments = null,
                shares = null,
                views = null;

            const likeLD = html.match(/"interactionType":\s*"https?:\/\/schema\.org\/LikeAction"[^}]+?"userInteractionCount":\s*(\d+)/i);
            if (likeLD) likes = parseInt(likeLD[1]);

            const commentLD = html.match(/"interactionType":\s*"https?:\/\/schema\.org\/CommentAction"[^}]+?"userInteractionCount":\s*(\d+)/i);
            if (commentLD) comments = parseInt(commentLD[1]);

            const shareLD = html.match(/"interactionType":\s*"https?:\/\/schema\.org\/ShareAction"[^}]+?"userInteractionCount":\s*(\d+)/i);
            if (shareLD) shares = parseInt(shareLD[1]);

            if (likes === null) {
                const reactionMatch = html.match(/"reaction_count":\s*\{\s*"count":\s*(\d+)/i) || html.match(/"like_count":\s*\{\s*"count":\s*(\d+)/i);
                if (reactionMatch) likes = parseInt(reactionMatch[1]);
            }
            if (comments === null) {
                const commentMatch =
                    html.match(/"comments":\s*\{\s*"total_count":\s*(\d+)/i) ||
                    html.match(/"comment_count":\s*\{\s*"total_count":\s*(\d+)/i) ||
                    html.match(/"total_comment_count":\s*(\d+)/i);
                if (commentMatch) comments = parseInt(commentMatch[1]);
            }
            if (shares === null) {
                const shareMatch = html.match(/"share_count":\s*\{\s*"count":\s*(\d+)/i);
                if (shareMatch) shares = parseInt(shareMatch[1]);
            }
            if (views === null) {
                const viewMatch = html.match(/"play_count":\s*(\d+)/i) || html.match(/"video_view_count":\s*(\d+)/i);
                if (viewMatch) views = parseInt(viewMatch[1]);
            }

            if (views !== null) interactionArr.push(`${views.toLocaleString("vi-VN")} 👁️`);
            if (likes !== null) interactionArr.push(`${likes.toLocaleString("vi-VN")} ✋`);
            if (comments !== null) interactionArr.push(`${comments.toLocaleString("vi-VN")} 💬`);
            if (shares !== null) interactionArr.push(`${shares.toLocaleString("vi-VN")} ↪️`);
            if (interactionArr.length > 0) interactions = interactionArr.join(" • ");
        }

        // ===== render results =====
        const prefix = userDisplayContext ? `${userDisplayContext}\n` : "";
        const authorText = `${prefix}👤 <b>Nguồn:</b> <a href="${escapeTgHtml(finalUrl)}">${escapeTgHtml(author)}</a>\n`;
        const timestampText = time !== "Không rõ" ? `🕒 <b>Thời gian:</b> ${escapeTgHtml(time)}\n` : "";
        const interactionsText = interactions !== "Không rõ" ? `❤️ <b>Tương tác:</b> ${escapeTgHtml(interactions)}\n` : "";
        const contentText = "📝 <b>Nội dung:</b>";
        const truncationMsg = "\n\n<b>[Nội dung bị thu gọn do giới hạn của Telegram]</b>";

        // accumulate debug text
        let debugTextTotal = "";
        if (DEBUG_NETWORK && debugNetworkText) debugTextTotal += debugNetworkText;
        if (DEBUG_MEDIA && debugMediaText) debugTextTotal += debugMediaText;

        let resultText = `${authorText}${timestampText}${interactionsText}`;
        if (caption) {
            // identify post type
            const isReel = finalUrl.includes("/reel/") || finalUrl.includes("/watch/") || finalUrl.includes("/videos/");
            const willSendAsMedia = (isReel && ogImage) || (!isReel && mediaUrls.length > 1);

            // calculate and determine available space
            const telegramMaxLimit = willSendAsMedia ? 1024 : 4096; // text = 4096, media = 1024
            const reservedQuotaTextLength = isReel ? 50 : 0;

            const visibleResultTextLength = getVisibleLength(resultText);
            const visibleDebugTextLength = getVisibleLength(debugTextTotal);
            const visibleCaptionTextLength = getVisibleLength(captionText);
            const visibleTruncationMsgLength = getVisibleLength(truncationMsg);

            const otherTextLength = visibleResultTextLength + visibleDebugTextLength + visibleCaptionTextLength + visibleTruncationMsgLength + 15 + reservedQuotaTextLength;
            const availableSpace = telegramMaxLimit - otherTextLength;
            const maxLength = Math.max(0, Math.floor(availableSpace / 25) * 25); // using nearest multiple of 25

            let isTruncated = false;
            let safeCaption = caption;

            if (caption.length > maxLength) {
                safeCaption = caption.substring(0, maxLength) + "...";
                isTruncated = true;
            }
            resultText += `${captionText}\n<i>${escapeTgHtml(safeCaption)}</i>`;

            if (isTruncated) resultText += truncationMsg;
        }

        // add debug text
        resultText += debugTextTotal;

        return { text: resultText, url: finalUrl, mediaUrls: mediaUrls, ogImage: ogImage };
    } catch (error) {
        return { text: `❌ Lỗi kết nối: ${error.message}`, url: null, mediaUrls: [] };
    }
};
