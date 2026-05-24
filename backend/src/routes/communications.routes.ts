import { Router } from "express";
import { supabase } from "../config/supabase";
import { isValidUuid } from "../utils/validation";
import { getPaginationParams, getTotalPages } from "../utils/pagination";

const router = Router();

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
    const { page, limit, from, to } = getPaginationParams(req.query);

    if (ticket_id !== undefined) {
      if (typeof ticket_id !== "string" || !isValidUuid(ticket_id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid ticket ID format",
        });
      }
    }

    if (customer_id !== undefined) {
      if (typeof customer_id !== "string" || !isValidUuid(customer_id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid customer ID format",
        });
      }
    }

    if (channel !== undefined) {
      if (
        typeof channel !== "string" ||
        !allowedCommunicationChannels.includes(channel)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid communication channel",
          allowedChannels: allowedCommunicationChannels,
        });
      }
    }

    let query = supabase
      .from("communications")
      .select(
        `
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
      `,
        { count: "exact" }
      )
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
        totalPages: getTotalPages(total, limit),
      },
      data: communications || [],
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

export default router;