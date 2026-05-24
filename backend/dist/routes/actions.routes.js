"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../config/supabase");
const validation_1 = require("../utils/validation");
const nodemailer_1 = __importDefault(require("nodemailer"));
const router = (0, express_1.Router)();
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
        const { ticket_id, customer_id, to, message } = req.body;
        if (!to || typeof to !== "string") {
            return res.status(400).json({
                success: false,
                message: "Recipient phone number is required",
            });
        }
        if (!message || typeof message !== "string" || message.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: "Message is required",
            });
        }
        if (message.length > 1600) {
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
        const openphoneResponse = await fetch("https://api.openphone.com/v1/messages", {
            method: "POST",
            headers: {
                Authorization: openphoneApiKey,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                content: message.trim(),
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
            author_name: req.user?.full_name || "Perraro Team",
            phone_number: normalizedTo,
            phone_number_normalized: normalizedTo,
            message_body: message.trim(),
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
        const { ticket_id, customer_id, to, subject, message } = req.body;
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
        if (!message || typeof message !== "string" || message.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: "Email message is required",
            });
        }
        if (subject.length > 300) {
            return res.status(400).json({
                success: false,
                message: "Subject is too long. Maximum length is 300 characters.",
            });
        }
        if (message.length > 10000) {
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
        const smtpFromName = process.env.SMTP_FROM_NAME || "Perraro Electric Bike";
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
            text: message.trim(),
            html: message.trim().replace(/\n/g, "<br />"),
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
            author_name: req.user?.full_name || "Perraro Team",
            email_address: to.trim(),
            subject: subject.trim(),
            message_body: message.trim(),
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
