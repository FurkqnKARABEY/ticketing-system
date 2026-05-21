import { Router } from "express";
import { supabase } from "../config/supabase";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { ticket_id, customer_id, channel } = req.query;

    let query = supabase
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
      `)
      .order("created_at", { ascending: false });

    if (typeof ticket_id === "string") {
      query = query.eq("ticket_id", ticket_id);
    }

    if (typeof customer_id === "string") {
      query = query.eq("customer_id", customer_id);
    }

    if (typeof channel === "string") {
      query = query.eq("channel", channel);
    }

    const { data: communications, error } = await query;

    if (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch communications",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      count: communications?.length || 0,
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