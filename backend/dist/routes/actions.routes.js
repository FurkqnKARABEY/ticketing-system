"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../config/supabase");
const validation_1 = require("../utils/validation");
const nodemailer_1 = __importDefault(require("nodemailer"));
const crypto_1 = require("crypto");
const router = (0, express_1.Router)();
const maxAttachmentBytes = 10 * 1024 * 1024;
const sanitizeFileName = (value) => {
    const cleanName = value.replace(/[^\w.\- ]/g, "_").trim();
    return cleanName || "attachment";
};
const prepareAttachments = (value) => {
    if (value === undefined || value === null)
        return [];
    if (!Array.isArray(value)) {
        throw new Error("Attachments must be an array");
    }
    return value.map((attachment) => {
        if (!attachment || typeof attachment !== "object") {
            throw new Error("Invalid attachment payload");
        }
        if (!attachment.file_name || typeof attachment.file_name !== "string") {
            throw new Error("Attachment file name is required");
        }
        if (!attachment.data_base64 || typeof attachment.data_base64 !== "string") {
            throw new Error("Attachment content is required");
        }
        const content = Buffer.from(attachment.data_base64, "base64");
        if (content.length === 0) {
            throw new Error("Attachment content is empty");
        }
        if (content.length > maxAttachmentBytes) {
            throw new Error("Attachment is too large. Maximum size is 10MB.");
        }
        return {
            fileName: sanitizeFileName(attachment.file_name),
            mimeType: attachment.mime_type || "application/octet-stream",
            sizeBytes: Number(attachment.size_bytes || content.length),
            content,
        };
    });
};
const uploadAttachment = async (attachment) => {
    const bucket = process.env.SUPABASE_ATTACHMENTS_BUCKET || "attachments";
    const storagePath = `outbound/${new Date().toISOString().slice(0, 10)}/${(0, crypto_1.randomUUID)()}-${attachment.fileName}`;
    const { error: uploadError } = await supabase_1.supabase.storage
        .from(bucket)
        .upload(storagePath, attachment.content, {
        contentType: attachment.mimeType,
        upsert: false,
    });
    if (uploadError) {
        throw new Error(`Failed to upload ${attachment.fileName}: ${uploadError.message}`);
    }
    const { data: signedUrlData } = await supabase_1.supabase.storage
        .from(bucket)
        .createSignedUrl(storagePath, 60 * 60 * 24 * 30);
    return {
        ...attachment,
        fileUrl: signedUrlData?.signedUrl || null,
        storageBucket: bucket,
        storagePath,
    };
};
const saveAttachmentRows = async ({ attachments, communicationId, ticketId, customerId, source, communicationChannel, }) => {
    if (attachments.length === 0)
        return [];
    const { data, error } = await supabase_1.supabase
        .from("attachments")
        .insert(attachments.map((attachment) => ({
        communication_id: communicationId,
        ticket_id: ticketId,
        customer_id: customerId,
        file_type: attachment.mimeType,
        file_name: attachment.fileName,
        file_url: attachment.fileUrl,
        source,
        storage_bucket: attachment.storageBucket,
        storage_path: attachment.storagePath,
        mime_type: attachment.mimeType,
        size_bytes: attachment.sizeBytes,
        communication_channel: communicationChannel,
    })))
        .select();
    if (error) {
        throw new Error(`Failed to save attachments: ${error.message}`);
    }
    return data || [];
};
const normalizeUsPhone = (value) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length === 10) {
        return `+1${digits}`;
    }
    if (digits.length === 11 && digits.startsWith("1")) {
        return `+${digits}`;
    }
    if (value.startsWith("+") && digits.length >= 10) {
        return value.trim();
    }
    return null;
};
const readOpenPhoneResponse = async (response) => {
    try {
        return await response.json();
    }
    catch {
        return null;
    }
};
router.post("/send-sms", async (req, res) => {
    try {
        const { ticket_id, customer_id, to, message, attachments } = req.body;
        const preparedAttachments = prepareAttachments(attachments);
        if (!to || typeof to !== "string") {
            return res.status(400).json({
                success: false,
                message: "Recipient phone number is required",
            });
        }
        if ((!message || typeof message !== "string" || message.trim().length === 0) &&
            preparedAttachments.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Message or attachment is required",
            });
        }
        if (typeof message === "string" && message.length > 1600) {
            return res.status(400).json({
                success: false,
                message: "Message is too long. Maximum length is 1600 characters.",
            });
        }
        if (ticket_id !== undefined && !(0, validation_1.isValidUuid)(ticket_id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid ticket ID format",
            });
        }
        if (customer_id !== undefined && !(0, validation_1.isValidUuid)(customer_id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid customer ID format",
            });
        }
        const normalizedTo = normalizeUsPhone(to);
        if (!normalizedTo) {
            return res.status(400).json({
                success: false,
                message: "Invalid recipient phone number format",
            });
        }
        const openphoneApiKey = process.env.OPENPHONE_API_KEY;
        const openphonePhoneNumberId = process.env.OPENPHONE_PHONE_NUMBER_ID;
        if (!openphoneApiKey || !openphonePhoneNumberId) {
            return res.status(500).json({
                success: false,
                message: "OpenPhone configuration is missing",
            });
        }
        const storedAttachments = preparedAttachments.length
            ? await Promise.all(preparedAttachments.map(uploadAttachment))
            : [];
        const attachmentLinks = storedAttachments
            .map((attachment) => attachment.fileUrl)
            .filter(Boolean);
        const smsContent = [
            typeof message === "string" ? message.trim() : "",
            attachmentLinks.length
                ? `Attachments:\n${attachmentLinks.join("\n")}`
                : "",
        ]
            .filter(Boolean)
            .join("\n\n");
        if (smsContent.length > 1600) {
            return res.status(400).json({
                success: false,
                message: "Message and attachment links are too long. Please remove files or shorten the message.",
            });
        }
        const openphoneResponse = await fetch("https://api.openphone.com/v1/messages", {
            method: "POST",
            headers: {
                Authorization: openphoneApiKey,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                content: smsContent,
                from: openphonePhoneNumberId,
                to: [normalizedTo],
            }),
        });
        const openphoneResult = await readOpenPhoneResponse(openphoneResponse);
        if (!openphoneResponse.ok) {
            const openphoneErrorCode = openphoneResult?.code;
            const openphoneStatus = openphoneResponse.status;
            if (openphoneStatus === 429 || openphoneErrorCode === "RATE_LIMIT_EXCEEDED") {
                return res.status(429).json({
                    success: false,
                    message: "OpenPhone rate limit reached. Please wait a few minutes and try again.",
                    code: "OPENPHONE_RATE_LIMIT",
                    error: openphoneResult,
                });
            }
            if (openphoneStatus === 401 || openphoneStatus === 403) {
                return res.status(openphoneStatus).json({
                    success: false,
                    message: "OpenPhone authorization failed. Please check the OpenPhone API key.",
                    code: "OPENPHONE_AUTH_ERROR",
                    error: openphoneResult,
                });
            }
            if (openphoneStatus === 400) {
                return res.status(400).json({
                    success: false,
                    message: "OpenPhone rejected the SMS request. Please check the phone number and message body.",
                    code: "OPENPHONE_BAD_REQUEST",
                    error: openphoneResult,
                });
            }
            return res.status(openphoneStatus).json({
                success: false,
                message: "Failed to send SMS through OpenPhone",
                code: "OPENPHONE_SEND_FAILED",
                error: openphoneResult,
            });
        }
        const openphoneMessage = openphoneResult?.data;
        const now = new Date().toISOString();
        const { data: communication, error: communicationError } = await supabase_1.supabase
            .from("communications")
            .insert({
            ticket_id: ticket_id || null,
            customer_id: customer_id || null,
            channel: "sms",
            direction: "outgoing",
            author_type: "agent",
            author_name: req.user?.full_name || "Support Team",
            phone_number: normalizedTo,
            phone_number_normalized: normalizedTo,
            message_body: smsContent,
            message_type: "sms",
            external_id: openphoneMessage?.id || null,
            openphone_message_id: openphoneMessage?.id || null,
            occurred_at: now,
        })
            .select(`
        id,
        ticket_id,
        customer_id,
        channel,
        direction,
        author_type,
        author_name,
        phone_number,
        phone_number_normalized,
        message_body,
        message_type,
        external_id,
        openphone_message_id,
        occurred_at,
        created_at
      `)
            .single();
        if (communicationError || !communication) {
            return res.status(500).json({
                success: false,
                message: "SMS was sent, but failed to save communication",
                error: communicationError?.message,
                openphone: openphoneResult,
            });
        }
        const savedAttachments = await saveAttachmentRows({
            attachments: storedAttachments,
            communicationId: communication.id,
            ticketId: ticket_id || null,
            customerId: customer_id || null,
            source: "openphone_sms",
            communicationChannel: "sms",
        });
        if (ticket_id) {
            await supabase_1.supabase
                .from("tickets")
                .update({
                last_activity_at: now,
                updated_at: now,
            })
                .eq("id", ticket_id);
        }
        return res.status(201).json({
            success: true,
            message: "SMS sent successfully",
            data: {
                communication,
                attachments: savedAttachments,
                openphone: openphoneMessage,
            },
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: "Unexpected server error",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
router.post("/send-email", async (req, res) => {
    try {
        const { ticket_id, customer_id, to, subject, message, attachments } = req.body;
        const preparedAttachments = prepareAttachments(attachments);
        if (!to || typeof to !== "string") {
            return res.status(400).json({
                success: false,
                message: "Recipient email is required",
            });
        }
        if (!subject || typeof subject !== "string" || subject.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: "Email subject is required",
            });
        }
        if ((!message || typeof message !== "string" || message.trim().length === 0) &&
            preparedAttachments.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Email message or attachment is required",
            });
        }
        if (subject.length > 300) {
            return res.status(400).json({
                success: false,
                message: "Subject is too long. Maximum length is 300 characters.",
            });
        }
        if (typeof message === "string" && message.length > 10000) {
            return res.status(400).json({
                success: false,
                message: "Message is too long. Maximum length is 10000 characters.",
            });
        }
        if (ticket_id !== undefined && !(0, validation_1.isValidUuid)(ticket_id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid ticket ID format",
            });
        }
        if (customer_id !== undefined && !(0, validation_1.isValidUuid)(customer_id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid customer ID format",
            });
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(to.trim())) {
            return res.status(400).json({
                success: false,
                message: "Invalid recipient email format",
            });
        }
        const smtpHost = process.env.SMTP_HOST;
        const smtpPort = Number(process.env.SMTP_PORT || 587);
        const smtpSecure = process.env.SMTP_SECURE === "true";
        const smtpUser = process.env.SMTP_USER;
        const smtpPass = process.env.SMTP_PASS;
        const smtpFromName = process.env.SMTP_FROM_NAME || "Support Desk";
        const smtpFromEmail = process.env.SMTP_FROM_EMAIL || smtpUser;
        if (!smtpHost || !smtpUser || !smtpPass || !smtpFromEmail) {
            return res.status(500).json({
                success: false,
                message: "SMTP configuration is missing",
            });
        }
        const transporter = nodemailer_1.default.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure,
            auth: {
                user: smtpUser,
                pass: smtpPass,
            },
        });
        const emailResult = await transporter.sendMail({
            from: `"${smtpFromName}" <${smtpFromEmail}>`,
            to: to.trim(),
            subject: subject.trim(),
            text: typeof message === "string" ? message.trim() : "",
            html: typeof message === "string" ? message.trim().replace(/\n/g, "<br />") : "",
            attachments: preparedAttachments.map((attachment) => ({
                filename: attachment.fileName,
                content: attachment.content,
                contentType: attachment.mimeType,
            })),
        });
        const now = new Date().toISOString();
        const { data: communication, error: communicationError } = await supabase_1.supabase
            .from("communications")
            .insert({
            ticket_id: ticket_id || null,
            customer_id: customer_id || null,
            channel: "email",
            direction: "outgoing",
            author_type: "agent",
            author_name: req.user?.full_name || "Support Team",
            email_address: to.trim(),
            subject: subject.trim(),
            message_body: typeof message === "string" ? message.trim() : "",
            message_type: "email",
            external_id: emailResult.messageId || null,
            email_message_id: emailResult.messageId || null,
            occurred_at: now,
        })
            .select(`
        id,
        ticket_id,
        customer_id,
        channel,
        direction,
        author_type,
        author_name,
        email_address,
        subject,
        message_body,
        message_type,
        external_id,
        email_message_id,
        occurred_at,
        created_at
      `)
            .single();
        if (communicationError || !communication) {
            return res.status(500).json({
                success: false,
                message: "Email was sent, but failed to save communication",
                error: communicationError?.message,
                email: {
                    messageId: emailResult.messageId,
                    accepted: emailResult.accepted,
                    rejected: emailResult.rejected,
                },
            });
        }
        const savedAttachments = await saveAttachmentRows({
            attachments: preparedAttachments.map((attachment) => ({
                ...attachment,
                fileUrl: null,
                storageBucket: null,
                storagePath: null,
            })),
            communicationId: communication.id,
            ticketId: ticket_id || null,
            customerId: customer_id || null,
            source: "email",
            communicationChannel: "email",
        });
        if (ticket_id) {
            await supabase_1.supabase
                .from("tickets")
                .update({
                last_activity_at: now,
                updated_at: now,
            })
                .eq("id", ticket_id);
        }
        return res.status(201).json({
            success: true,
            message: "Email sent successfully",
            data: {
                communication,
                attachments: savedAttachments,
                email: {
                    messageId: emailResult.messageId,
                    accepted: emailResult.accepted,
                    rejected: emailResult.rejected,
                },
            },
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to send email",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
exports.default = router;
