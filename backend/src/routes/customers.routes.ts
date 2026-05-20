import { Router } from "express";
import { supabase } from "../config/supabase";

const router = Router();

const isValidUuid = (value: string) => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return uuidRegex.test(value);
};

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID format",
      });
    }

    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select(`
        id,
        first_name,
        last_name,
        full_name,
        email_primary,
        email_secondary,
        phone_primary,
        phone_secondary,
        phone_primary_normalized,
        phone_secondary_normalized,
        shipping_address,
        billing_address,
        customer_notes,
        source,
        created_at,
        updated_at
      `)
      .eq("id", id)
      .single();

    if (customerError || !customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const { data: tickets, error: ticketsError } = await supabase
      .from("tickets")
      .select(`
        id,
        ticket_number,
        title,
        description,
        category,
        status,
        priority,
        source,
        created_at,
        updated_at,
        closed_at
      `)
      .eq("customer_id", id)
      .order("created_at", { ascending: false });

    if (ticketsError) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch customer tickets",
        error: ticketsError.message,
      });
    }

    const { data: communications, error: communicationsError } = await supabase
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
      .eq("customer_id", id)
      .order("created_at", { ascending: false });

    if (communicationsError) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch customer communications",
        error: communicationsError.message,
      });
    }

    const { data: attachments, error: attachmentsError } = await supabase
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
      .eq("customer_id", id)
      .order("created_at", { ascending: false });

    if (attachmentsError) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch customer attachments",
        error: attachmentsError.message,
      });
    }

    return res.json({
      success: true,
      data: {
        customer,
        tickets: tickets || [],
        communications: communications || [],
        attachments: attachments || [],
      },
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

export default router;