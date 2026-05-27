import { Router } from "express";
import { supabase } from "../config/supabase";
import { isValidUuid } from "../utils/validation";
import { getPaginationParams, getTotalPages } from "../utils/pagination";

const router = Router();

const normalizeUsPhone = (value: string) => {
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

router.get("/", async (req, res) => {
  try {
    const { page, limit, from, to } = getPaginationParams(req.query);
    const search =
      typeof req.query.search === "string"
        ? req.query.search.replace(/[,%()]/g, " ").trim()
        : "";

    let query = supabase
      .from("customers")
      .select(
        `
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
        source,
        created_at,
        updated_at
      `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (search) {
      query = query.or(
        [
          `full_name.ilike.%${search}%`,
          `email_primary.ilike.%${search}%`,
          `email_secondary.ilike.%${search}%`,
          `phone_primary.ilike.%${search}%`,
          `phone_secondary.ilike.%${search}%`,
          `phone_primary_normalized.ilike.%${search}%`,
          `phone_secondary_normalized.ilike.%${search}%`,
          `source.ilike.%${search}%`,
        ].join(",")
      );
    }

    const { data: customers, error, count } = await query;

    if (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch customers",
        error: error.message,
      });
    }

    const total = count || 0;

    return res.json({
      success: true,
      count: customers?.length || 0,
      pagination: {
        page,
        limit,
        total,
        totalPages: getTotalPages(total, limit),
      },
      data: customers || [],
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

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

router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID format",
      });
    }

    const {
      first_name,
      last_name,
      full_name,
      email_primary,
      email_secondary,
      phone_primary,
      phone_secondary,
      shipping_address,
      billing_address,
      customer_notes,
    } = req.body || {};

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    const setString = (key: string, value: unknown, maxLen: number) => {
      if (value === undefined) return;
      if (value === null) {
        updatePayload[key] = null;
        return;
      }
      if (typeof value !== "string") {
        throw new Error(`${key} must be a string`);
      }
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        updatePayload[key] = null;
        return;
      }
      if (trimmed.length > maxLen) {
        throw new Error(`${key} is too long`);
      }
      updatePayload[key] = trimmed;
    };

    setString("first_name", first_name, 120);
    setString("last_name", last_name, 120);
    setString("full_name", full_name, 240);
    setString("email_primary", email_primary, 320);
    setString("email_secondary", email_secondary, 320);

    if (phone_primary !== undefined) {
      if (phone_primary === null) {
        updatePayload.phone_primary = null;
        updatePayload.phone_primary_normalized = null;
      } else if (typeof phone_primary !== "string") {
        return res.status(400).json({
          success: false,
          message: "phone_primary must be a string",
        });
      } else {
        const trimmed = phone_primary.trim();
        updatePayload.phone_primary = trimmed || null;
        updatePayload.phone_primary_normalized = trimmed
          ? normalizeUsPhone(trimmed)
          : null;
      }
    }

    if (phone_secondary !== undefined) {
      if (phone_secondary === null) {
        updatePayload.phone_secondary = null;
        updatePayload.phone_secondary_normalized = null;
      } else if (typeof phone_secondary !== "string") {
        return res.status(400).json({
          success: false,
          message: "phone_secondary must be a string",
        });
      } else {
        const trimmed = phone_secondary.trim();
        updatePayload.phone_secondary = trimmed || null;
        updatePayload.phone_secondary_normalized = trimmed
          ? normalizeUsPhone(trimmed)
          : null;
      }
    }

    if (shipping_address !== undefined) {
      updatePayload.shipping_address = shipping_address;
    }

    if (billing_address !== undefined) {
      updatePayload.billing_address = billing_address;
    }

    if (customer_notes !== undefined) {
      if (customer_notes === null) {
        updatePayload.customer_notes = null;
      } else if (typeof customer_notes !== "string") {
        return res.status(400).json({
          success: false,
          message: "customer_notes must be a string",
        });
      } else {
        updatePayload.customer_notes = customer_notes.trim().slice(0, 5000) || null;
      }
    }

    const fieldsToUpdate = Object.keys(updatePayload).filter(
      (key) => key !== "updated_at"
    );

    if (fieldsToUpdate.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one field must be provided to update",
      });
    }

    const { data: updatedCustomer, error } = await supabase
      .from("customers")
      .update(updatePayload)
      .eq("id", id)
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
      .single();

    if (error || !updatedCustomer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found or failed to update",
        error: error?.message,
      });
    }

    return res.json({
      success: true,
      message: "Customer updated successfully",
      data: updatedCustomer,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : "Invalid payload",
    });
  }
});

export default router;
