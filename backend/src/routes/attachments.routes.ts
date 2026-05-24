import { Router } from "express";
import { supabase } from "../config/supabase";
import { isValidUuid } from "../utils/validation";
import { getPaginationParams, getTotalPages } from "../utils/pagination";

const router = Router();

const allowedAttachmentSources = [
  "email",
  "website_form",
  "openphone_sms",
  "openphone_mms",
  "openphone_call",
  "voicemail",
  "call_recording",
  "manual_upload",
];

router.get("/", async (req, res) => {
  try {
    const { ticket_id, customer_id, communication_id, source } = req.query;
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

    if (communication_id !== undefined) {
      if (
        typeof communication_id !== "string" ||
        !isValidUuid(communication_id)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid communication ID format",
        });
      }
    }

    if (source !== undefined) {
      if (
        typeof source !== "string" ||
        !allowedAttachmentSources.includes(source)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid attachment source",
          allowedSources: allowedAttachmentSources,
        });
      }
    }

    let query = supabase
      .from("attachments")
      .select(
        `
        id,
        communication_id,
        ticket_id,
        customer_id,
        file_type,
        file_name,
        file_url,
        source,
        storage_bucket,
        storage_path,
        mime_type,
        size_bytes,
        external_id,
        communication_channel,
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

    if (typeof communication_id === "string") {
      query = query.eq("communication_id", communication_id);
    }

    if (typeof source === "string") {
      query = query.eq("source", source);
    }

    const { data: attachments, error, count } = await query;

    if (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch attachments",
        error: error.message,
      });
    }

    const total = count || 0;

    return res.json({
      success: true,
      count: attachments?.length || 0,
      pagination: {
        page,
        limit,
        total,
        totalPages: getTotalPages(total, limit),
      },
      data: attachments || [],
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

export default router;