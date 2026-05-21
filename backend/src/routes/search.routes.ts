import { Router } from "express";
import { supabase } from "../config/supabase";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== "string" || q.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Search query is required",
      });
    }

    const searchTerm = q.trim();

    if (searchTerm.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Search query must be at least 2 characters",
      });
    }

    if (searchTerm.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Search query is too long. Maximum length is 100 characters.",
      });
    }

    const ticketSearch = supabase
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
        customer_id,
        created_at,
        updated_at
      `)
      .or(
        `ticket_number.ilike.%${searchTerm}%,title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,category.ilike.%${searchTerm}%`
      )
      .order("created_at", { ascending: false })
      .limit(10);

    const customerSearch = supabase
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
        source,
        created_at
      `)
      .or(
        `first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,full_name.ilike.%${searchTerm}%,email_primary.ilike.%${searchTerm}%,email_secondary.ilike.%${searchTerm}%,phone_primary.ilike.%${searchTerm}%,phone_primary_normalized.ilike.%${searchTerm}%`
      )
      .order("created_at", { ascending: false })
      .limit(10);

    const communicationSearch = supabase
      .from("communications")
      .select(`
        id,
        ticket_id,
        customer_id,
        channel,
        direction,
        author_type,
        author_name,
        email_address,
        phone_number,
        subject,
        message_body,
        summary,
        created_at
      `)
      .or(
        `author_name.ilike.%${searchTerm}%,email_address.ilike.%${searchTerm}%,phone_number.ilike.%${searchTerm}%,subject.ilike.%${searchTerm}%,message_body.ilike.%${searchTerm}%,summary.ilike.%${searchTerm}%`
      )
      .order("created_at", { ascending: false })
      .limit(10);

    const [
      { data: tickets, error: ticketsError },
      { data: customers, error: customersError },
      { data: communications, error: communicationsError },
    ] = await Promise.all([ticketSearch, customerSearch, communicationSearch]);

    if (ticketsError || customersError || communicationsError) {
      return res.status(500).json({
        success: false,
        message: "Search failed",
        errors: {
          tickets: ticketsError?.message,
          customers: customersError?.message,
          communications: communicationsError?.message,
        },
      });
    }

    return res.json({
      success: true,
      query: searchTerm,
      results: {
        tickets: tickets || [],
        customers: customers || [],
        communications: communications || [],
      },
      counts: {
        tickets: tickets?.length || 0,
        customers: customers?.length || 0,
        communications: communications?.length || 0,
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