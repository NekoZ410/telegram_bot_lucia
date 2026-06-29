import { Buffer } from "node:buffer";
import { callTelegramApi, callTelegramApiMultipart, setReaction, autoDeleteMessage, escapeTgHtml } from "../utils/telegram.js";

export async function handleQr({ env, ctx, chatId, threadId, message, args }) {
    if (args) {
        ctx.waitUntil(
            (async () => {
                await setReaction(chatId, message.message_id, "👌", env);

                try {
                    if (args.length > 1000) throw new Error(`❌ <b>Nội dung quá dài!</b>\n\nVui lòng nhập dưới 1000 ký tự.`);

                    let fileId = null;
                    let imgWidth = 0;
                    let imgHeight = 0;
                    let base64Data = null;

                    // choose appropriate image size
                    if (message.photo && message.photo.length > 0) {
                        let bestPhoto = message.photo[0];
                        for (const p of message.photo) {
                            bestPhoto = p;
                            if (p.width >= 300 || p.height >= 300) break;
                        }
                        fileId = bestPhoto.file_id;
                        imgWidth = bestPhoto.width;
                        imgHeight = bestPhoto.height;
                    } else if (message.document && message.document.mime_type && message.document.mime_type.startsWith("image/")) {
                        if (message.document.thumbnail) {
                            fileId = message.document.thumbnail.file_id;
                            imgWidth = message.document.thumbnail.width;
                            imgHeight = message.document.thumbnail.height;
                        } else {
                            fileId = message.document.file_id;
                            imgWidth = 1;
                            imgHeight = 1;
                        }
                    }

                    // handle attached image
                    const hasImage = fileId !== null;
                    if (hasImage) {
                        if (imgWidth > 0 && imgHeight > 0) {
                            const ratioDiff = Math.abs(imgWidth - imgHeight) / Math.max(imgWidth, imgHeight);
                            // if error ratio > 15%
                            if (ratioDiff > 0.15) {
                                throw new Error(
                                    `❌ <b>Ảnh đính kèm không có tỷ lệ 1:1 (vuông).</b>\n\n` +
                                        `💡 <b>Mẹo:</b>\n` +
                                        `- Sử dụng công cụ chỉnh sửa ảnh (Crop) có sẵn của Telegram để cắt thành hình vuông trước khi gửi.`,
                                );
                            }
                        }

                        const fileRes = await callTelegramApi("getFile", { file_id: fileId }, env);
                        const fileJson = await fileRes.json();
                        if (!fileJson.ok) throw new Error("Không thể tải thông tin ảnh từ Telegram.");

                        const filePath = fileJson.result.file_path;
                        const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`;

                        const imageFetch = await fetch(fileUrl, { signal: AbortSignal.timeout(6000) });
                        const imageBuffer = await imageFetch.arrayBuffer();

                        base64Data = Buffer.from(imageBuffer).toString("base64");
                    }

                    // render QR via quickchart API
                    const qcPayload = {
                        text: args,
                        format: "png",
                        size: 512,
                        margin: 2,
                        ecLevel: hasImage ? "H" : "M", // increase error correction level if image is attached
                    };

                    if (base64Data) {
                        qcPayload.centerImageUrl = `data:image/jpeg;base64,${base64Data}`;
                        qcPayload.centerImageSizeRatio = 0.3; // maximum ratio size of logo
                    }

                    const qcResponse = await fetch("https://quickchart.io/qr", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(qcPayload),
                        signal: AbortSignal.timeout(10000), // maximum time to wait
                    });
                    if (!qcResponse.ok) throw new Error(`Dịch vụ tạo mã QR đang lỗi (HTTP ${qcResponse.status}).`);

                    // encapsulate data
                    const qrBuffer = await qcResponse.arrayBuffer();
                    const formData = new FormData();
                    formData.append("chat_id", chatId);
                    formData.append("reply_parameters", JSON.stringify({ message_id: message.message_id }));
                    if (threadId) formData.append("message_thread_id", threadId);

                    const blob = new Blob([qrBuffer], { type: "image/png" });
                    formData.append("photo", blob, "qrcode.png");

                    // send response
                    const tgResponse = await callTelegramApiMultipart("sendPhoto", formData, env);
                    const jsonResponse = await tgResponse.json();

                    if (!jsonResponse.ok) throw new Error(`Lỗi gửi ảnh Telegram: ${jsonResponse.description}`);
                } catch (e) {
                    await setReaction(chatId, message.message_id, "😭", env);

                    const errorMsg =
                        e.message.includes("❌") ?
                            e.message + "\n\n<b>[Thông báo sẽ tự động xoá sau 10s.]</b>"
                        :   `❌ Lỗi hệ thống: <code>${escapeTgHtml(e.message)}</code>\n\n<b>[Thông báo sẽ tự động xoá sau 10s.]</b>`;
                    const payload = {
                        chat_id: chatId,
                        text: errorMsg,
                        parse_mode: "HTML",
                        reply_parameters: { message_id: message.message_id },
                    };
                    if (threadId) payload.message_thread_id = threadId;

                    let tgResponse = await callTelegramApi("sendMessage", payload, env);
                    let tgJson = typeof tgResponse.json === "function" ? await tgResponse.json() : tgResponse;
                    if (tgJson && tgJson.ok) {
                        ctx.waitUntil(autoDeleteMessage(chatId, tgJson.result.message_id, env, 10000));
                        ctx.waitUntil(autoDeleteMessage(chatId, message.message_id, env, 10000));
                    }
                }
            })(),
        );
        return new Response("OK", { status: 200 });
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
                    `<code>/qr &lt;nội dung&gt;</code>\n\n` +
                    `🛠 <b>Nâng cao:</b>\n` +
                    `- Có thể chèn ảnh tỷ lệ 1:1 (vuông) vào giữa để tạo logo cá nhân hoá, hỗ trợ cả <b>Gửi nhanh</b> và <b>Gửi dưới dạng tài liệu</b>.\n\n` +
                    `💡 <b>Mẹo:</b>\n` +
                    `- Sử dụng công cụ chỉnh sửa ảnh (crop) có sẵn của Telegram để cắt thành hình vuông trước khi gửi.\n` +
                    `<b>[Thông báo sẽ tự động xoá sau 10s.]</b>`,
                parse_mode: "HTML",
                reply_parameters: { message_id: message.message_id },
            };
            if (threadId) payload.message_thread_id = threadId;

            let tgResponse = await callTelegramApi("sendMessage", payload, env);
            let tgJson = typeof tgResponse.json === "function" ? await tgResponse.json() : tgResponse;

            if (tgJson && tgJson.ok) {
                ctx.waitUntil(autoDeleteMessage(chatId, tgJson.result.message_id, env, 10000));
                ctx.waitUntil(autoDeleteMessage(chatId, message.message_id, env, 10000));
            }
        })(),
    );
    return new Response("OK", { status: 200 });
}
