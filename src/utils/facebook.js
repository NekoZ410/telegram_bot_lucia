// helper: fbfix - fetch facebook og url
export const fetchFacebookOgUrl = async (inputUrl, userDisplayContext = "") => {
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

        let finalUrl = response.url;
        if (finalUrl.includes("/login/") && finalUrl.includes("next=")) {
            try {
                const urlObj = new URL(finalUrl);
                const nextParam = urlObj.searchParams.get("next");
                if (nextParam) finalUrl = decodeURIComponent(nextParam);
            } catch (e) {}
        } else {
            const html = await response.text();
            const ogUrlMatch =
                html.match(/<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["']/i) || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:url["']/i);
            if (ogUrlMatch && ogUrlMatch[1]) {
                finalUrl = ogUrlMatch[1].replace(/&amp;/g, "&");
            }
        }
        if (!finalUrl) return { text: "❌ Không tìm thấy URL hợp lệ.", url: null };

        try {
            const parsedUrl = new URL(finalUrl);
            if (parsedUrl.pathname.includes("story.php") || parsedUrl.pathname.includes("permalink.php")) {
                const storyId = parsedUrl.searchParams.get("story_fbid");
                const pageId = parsedUrl.searchParams.get("id");
                if (storyId && pageId) finalUrl = `https://www.facebook.com/${pageId}/posts/${storyId}/`;
            }
        } catch (e) {}

        try {
            const parsedUrl = new URL(finalUrl);
            parsedUrl.searchParams.delete("rdid");
            parsedUrl.searchParams.delete("share_url");
            finalUrl = parsedUrl.toString();
        } catch (err) {}

        if (finalUrl.includes("facebook.com/login")) {
            return {
                text: "❌ Không thể lấy được URL gốc do nguồn cấp là nhóm kín, trang cá nhân chuyên nghiệp hoặc lỗi khác.\nThử lại với URL từ tính năng Chia sẻ của Facebook thay vì copy link trực tiếp từ thanh địa chỉ.",
                url: null,
            };
        }

        const prefix = userDisplayContext ? `${userDisplayContext}\n` : "";
        return { text: `${prefix}✅ <b>URL Gốc:</b>\n${finalUrl}`, url: finalUrl };
    } catch (error) {
        return { text: "❌ Đã xảy ra lỗi mạng khi kết nối đến Facebook.", url: null };
    }
};
