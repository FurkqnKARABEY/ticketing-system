"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../config/supabase");
const validation_1 = require("../utils/validation");
const pagination_1 = require("../utils/pagination");
const router = (0, express_1.Router)();
const allowedCommunicationChannels = [
    "email",
    "sms",
    "mms",
    "call",
    "voicemail",
    "website_form",
    "internal_note",
    "openphone_sms",
    "openphone_call",
];
router.get("/", async (req, res) => {
    try {
        const { ticket_id, customer_id, channel } = req.query;
        const { page, limit, from, to } = (0, pagination_1.getPaginationParams)(req.query);
        if (ticket_id !== undefined) {
            if (typeof ticket_id !== "string" || !(0, validation_1.isValidUuid)(ticket_id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid ticket ID format",
                });
            }
        }
        if (customer_id !== undefined) {
            if (typeof customer_id !== "string" || !(0, validation_1.isValidUuid)(customer_id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid customer ID format",
                });
            }
        }
        if (channel !== undefined) {
            if (typeof channel !== "string" ||
                !allowedCommunicationChannels.includes(channel)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid communication channel",
                    allowedChannels: allowedCommunicationChannels,
                });
            }
        }
        let query = supabase_1.supabase
            .from("communications")
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
        email_address,
        subject,
        message_body,
        message_type,
        external_id,
        openphone_call_id,
        openphone_message_id,
        email_message_id,
        call_type,
        file_type,
        recording_url,
        transcript_url,
        transcript_text,
        summary,
        occurred_at,
        created_at
      `, { count: "exact" })
            .order("created_at", { ascending: false })
            .range(from, to);
        if (typeof ticket_id === "string") {
            query = query.eq("ticket_id", ticket_id);
        }
        if (typeof customer_id === "string") {
            query = query.eq("customer_id", customer_id);
        }
        if (typeof channel === "string") {
            query = query.eq("channel", channel);
        }
        const { data: communications, error, count } = await query;
        if (error) {
            return res.status(500).json({
                success: false,
                message: "Failed to fetch communications",
                error: error.message,
            });
        }
        const total = count || 0;
        return res.json({
            success: true,
            count: communications?.length || 0,
            pagination: {
                page,
                limit,
                total,
                totalPages: (0, pagination_1.getTotalPages)(total, limit),
            },
            data: communications || [],
        });
    }
    catch {
        return res.status(500).json({
            success: false,
            message: "Unexpected server error",
        });
    }
});
exports.default = router;
