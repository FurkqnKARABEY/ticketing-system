import { Router } from "express";
import { supabase } from "../config/supabase";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { ticket_id, customer_id, communication_id, source } = req.query;

    let query = supabase
      .from("attachments")
      .select(`
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
      `)
      .order("created_at", { ascending: false });

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

    const { data: attachments, error } = await query;

    if (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch attachments",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      count: attachments?.length || 0,
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