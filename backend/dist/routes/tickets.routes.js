"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../config/supabase");
const validation_1 = require("../utils/validation");
const ticket_constants_1 = require("../constants/ticket.constants");
const pagination_1 = require("../utils/pagination");
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
const visibleTicketSources = [
    "website_form",
    "email_record",
    "openphone_record",
    "manual",
];
router.get("/", async (req, res) => {
    try {
        const { page, limit, from, to } = (0, pagination_1.getPaginationParams)(req.query);
        const search = typeof req.query.search === "string"
            ? req.query.search.replace(/[,%()]/g, " ").trim()
            : "";
        let query = supabase_1.supabase
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
        order_id,
        assigned_agent_id,
        last_activity_at,
        created_at,
        updated_at,
        closed_at
        `, { count: "exact" })
            .in("source", visibleTicketSources);
        if (search) {
            query = query.or([
                `ticket_number.ilike.%${search}%`,
                `title.ilike.%${search}%`,
                `description.ilike.%${search}%`,
                `status.ilike.%${search}%`,
                `priority.ilike.%${search}%`,
                `source.ilike.%${search}%`,
            ].join(","));
        }
        const { data: tickets, error: ticketsError, count, } = await query.order("created_at", { ascending: false }).range(from, to);
        if (ticketsError) {
            return res.status(500).json({
                success: false,
                message: "Failed to fetch tickets",
                error: ticketsError.message,
            });
        }
        const total = count || 0;
        return res.json({
            success: true,
            count: tickets?.length || 0,
            pagination: {
                page,
                limit,
                total,
                totalPages: (0, pagination_1.getTotalPages)(total, limit),
            },
            data: tickets || [],
        });
    }
    catch {
        return res.status(500).json({
            success: false,
            message: "Unexpected server error",
        });
    }
});
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        if (!(0, validation_1.isValidUuid)(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid ticket ID format",
            });
        }
        const { data: ticket, error: ticketError } = await supabase_1.supabase
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
        order_id,
        assigned_agent_id,
        last_activity_at,
        created_at,
        updated_at,
        closed_at
      `)
            .eq("id", id)
            .single();
        if (ticketError || !ticket) {
            return res.status(404).json({
                success: false,
                message: "Ticket not found",
            });
        }
        // If the ticket isn't linked to a customer yet (common for website-form intake),
        // try to resolve the customer using the website_form communication payload.
        if (!ticket.customer_id) {
            const { data: intakeCommunication } = await supabase_1.supabase
                .from("communications")
                .select(`
          id,
          email_address,
          phone_number,
          phone_number_normalized,
          author_name
        `)
                .eq("ticket_id", id)
                .eq("channel", "website_form")
                .order("created_at", { ascending: true })
                .limit(1)
                .maybeSingle();
            const intakeEmail = typeof intakeCommunication?.email_address === "string" &&
                intakeCommunication.email_address.trim().length > 0
                ? intakeCommunication.email_address.trim().toLowerCase()
                : null;
            const intakePhoneRaw = typeof intakeCommunication?.phone_number_normalized === "string" &&
                intakeCommunication.phone_number_normalized.trim().length > 0
                ? intakeCommunication.phone_number_normalized.trim()
                : typeof intakeCommunication?.phone_number === "string" &&
                    intakeCommunication.phone_number.trim().length > 0
                    ? intakeCommunication.phone_number.trim()
                    : null;
            const intakePhoneNormalized = intakePhoneRaw
                ? normalizeUsPhone(intakePhoneRaw) || intakePhoneRaw
                : null;
            if (intakeEmail || intakePhoneNormalized) {
                const orParts = [];
                if (intakeEmail) {
                    orParts.push(`email_primary.eq.${intakeEmail}`);
                    orParts.push(`email_secondary.eq.${intakeEmail}`);
                }
                if (intakePhoneNormalized) {
                    orParts.push(`phone_primary_normalized.eq.${intakePhoneNormalized}`);
                    orParts.push(`phone_secondary_normalized.eq.${intakePhoneNormalized}`);
                }
                const { data: existingCustomer } = await supabase_1.supabase
                    .from("customers")
                    .select(`
            id
          `)
                    .or(orParts.join(","))
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();
                let resolvedCustomerId = existingCustomer?.id || null;
                if (!resolvedCustomerId) {
                    const now = new Date().toISOString();
                    const { data: createdCustomer } = await supabase_1.supabase
                        .from("customers")
                        .insert({
                        full_name: typeof intakeCommunication?.author_name === "string" &&
                            intakeCommunication.author_name.trim().length > 0
                            ? intakeCommunication.author_name.trim().slice(0, 240)
                            : "Unknown Customer",
                        email_primary: intakeEmail,
                        phone_primary: intakePhoneRaw,
                        phone_primary_normalized: intakePhoneNormalized,
                        source: "website_form",
                        created_at: now,
                        updated_at: now,
                    })
                        .select("id")
                        .single();
                    resolvedCustomerId = createdCustomer?.id || null;
                }
                if (resolvedCustomerId) {
                    await supabase_1.supabase
                        .from("tickets")
                        .update({ customer_id: resolvedCustomerId })
                        .eq("id", id);
                    await supabase_1.supabase
                        .from("communications")
                        .update({ customer_id: resolvedCustomerId })
                        .eq("ticket_id", id);
                    await supabase_1.supabase
                        .from("attachments")
                        .update({ customer_id: resolvedCustomerId })
                        .eq("ticket_id", id);
                    ticket.customer_id = resolvedCustomerId;
                }
            }
        }
        let customer = null;
        if (ticket.customer_id) {
            const { data: customerData, error: customerError } = await supabase_1.supabase
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
                .eq("id", ticket.customer_id)
                .single();
            if (!customerError) {
                customer = customerData;
            }
        }
        let communicationsQuery = supabase_1.supabase
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
            .order("created_at", { ascending: true });
        if (ticket.customer_id) {
            communicationsQuery = communicationsQuery.eq("customer_id", ticket.customer_id);
        }
        else {
            communicationsQuery = communicationsQuery.eq("ticket_id", id);
        }
        const { data: communications, error: communicationsError } = await communicationsQuery;
        if (communicationsError) {
            return res.status(500).json({
                success: false,
                message: "Failed to fetch communications",
                error: communicationsError.message,
            });
        }
        let attachmentsQuery = supabase_1.supabase
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
            .order("created_at", { ascending: true });
        if (ticket.customer_id) {
            attachmentsQuery = attachmentsQuery.eq("customer_id", ticket.customer_id);
        }
        else {
            attachmentsQuery = attachmentsQuery.eq("ticket_id", id);
        }
        const { data: attachments, error: attachmentsError } = await attachmentsQuery;
        if (attachmentsError) {
            return res.status(500).json({
                success: false,
                message: "Failed to fetch attachments",
                error: attachmentsError.message,
            });
        }
        return res.json({
            success: true,
            data: {
                ticket,
                customer,
                communications: communications || [],
                attachments: attachments || [],
            },
        });
    }
    catch {
        return res.status(500).json({
            success: false,
            message: "Unexpected server error",
        });
    }
});
router.patch("/:id/status", async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!(0, validation_1.isValidUuid)(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid ticket ID format",
            });
        }
        if (!status || typeof status !== "string") {
            return res.status(400).json({
                success: false,
                message: "Status is required",
            });
        }
        if (!ticket_constants_1.allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid status value",
                allowedStatuses: ticket_constants_1.allowedStatuses,
            });
        }
        const updatePayload = {
            status,
            updated_at: new Date().toISOString(),
        };
        if (status === "closed") {
            updatePayload.closed_at = new Date().toISOString();
        }
        if (status !== "closed") {
            updatePayload.closed_at = null;
        }
        const { data: updatedTicket, error } = await supabase_1.supabase
            .from("tickets")
            .update(updatePayload)
            .eq("id", id)
            .select(`
        id,
        ticket_number,
        title,
        category,
        status,
        priority,
        source,
        customer_id,
        created_at,
        updated_at,
        closed_at
      `)
            .single();
        if (error || !updatedTicket) {
            return res.status(404).json({
                success: false,
                message: "Ticket not found or failed to update",
                error: error?.message,
            });
        }
        return res.json({
            success: true,
            message: "Ticket status updated successfully",
            data: updatedTicket,
        });
    }
    catch {
        return res.status(500).json({
            success: false,
            message: "Unexpected server error",
        });
    }
});
router.patch("/:id/priority", async (req, res) => {
    try {
        const { id } = req.params;
        const { priority } = req.body;
        if (!(0, validation_1.isValidUuid)(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid ticket ID format",
            });
        }
        if (!priority || typeof priority !== "string") {
            return res.status(400).json({
                success: false,
                message: "Priority is required",
            });
        }
        if (!ticket_constants_1.allowedPriorities.includes(priority)) {
            return res.status(400).json({
                success: false,
                message: "Invalid priority value",
                allowedPriorities: ticket_constants_1.allowedPriorities,
            });
        }
        const { data: updatedTicket, error } = await supabase_1.supabase
            .from("tickets")
            .update({
            priority,
            updated_at: new Date().toISOString(),
        })
            .eq("id", id)
            .select(`
        id,
        ticket_number,
        title,
        category,
        status,
        priority,
        source,
        customer_id,
        created_at,
        updated_at,
        closed_at
      `)
            .single();
        if (error || !updatedTicket) {
            return res.status(404).json({
                success: false,
                message: "Ticket not found or failed to update",
                error: error?.message,
            });
        }
        return res.json({
            success: true,
            message: "Ticket priority updated successfully",
            data: updatedTicket,
        });
    }
    catch {
        return res.status(500).json({
            success: false,
            message: "Unexpected server error",
        });
    }
});
router.patch("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, category } = req.body;
        if (!(0, validation_1.isValidUuid)(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid ticket ID format",
            });
        }
        const updatePayload = {
            updated_at: new Date().toISOString(),
        };
        if (title !== undefined) {
            if (typeof title !== "string" || title.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "Title must be a non-empty string",
                });
            }
            if (title.length > 200) {
                return res.status(400).json({
                    success: false,
                    message: "Title is too long. Maximum length is 200 characters.",
                });
            }
            updatePayload.title = title.trim();
        }
        if (description !== undefined) {
            if (typeof description !== "string") {
                return res.status(400).json({
                    success: false,
                    message: "Description must be a string",
                });
            }
            if (description.length > 5000) {
                return res.status(400).json({
                    success: false,
                    message: "Description is too long. Maximum length is 5000 characters.",
                });
            }
            updatePayload.description = description.trim();
        }
        if (category !== undefined) {
            if (typeof category !== "string") {
                return res.status(400).json({
                    success: false,
                    message: "Category must be a string",
                });
            }
            if (!ticket_constants_1.allowedCategories.includes(category)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid category value",
                    allowedCategories: ticket_constants_1.allowedCategories,
                });
            }
            updatePayload.category = category;
        }
        const fieldsToUpdate = Object.keys(updatePayload).filter((key) => key !== "updated_at");
        if (fieldsToUpdate.length === 0) {
            return res.status(400).json({
                success: false,
                message: "At least one field must be provided to update",
            });
        }
        const { data: updatedTicket, error } = await supabase_1.supabase
            .from("tickets")
            .update(updatePayload)
            .eq("id", id)
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
        updated_at,
        closed_at
      `)
            .single();
        if (error || !updatedTicket) {
            return res.status(404).json({
                success: false,
                message: "Ticket not found or failed to update",
                error: error?.message,
            });
        }
        return res.json({
            success: true,
            message: "Ticket updated successfully",
            data: updatedTicket,
        });
    }
    catch {
        return res.status(500).json({
            success: false,
            message: "Unexpected server error",
        });
    }
});
router.post("/:id/internal-notes", async (req, res) => {
    try {
        const { id } = req.params;
        const { note, author_name } = req.body;
        if (!(0, validation_1.isValidUuid)(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid ticket ID format",
            });
        }
        if (!note || typeof note !== "string" || note.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: "Note must be a non-empty string",
            });
        }
        if (note.length > 5000) {
            return res.status(400).json({
                success: false,
                message: "Note is too long. Maximum length is 5000 characters.",
            });
        }
        const { data: ticket, error: ticketError } = await supabase_1.supabase
            .from("tickets")
            .select("id, customer_id")
            .eq("id", id)
            .single();
        if (ticketError || !ticket) {
            return res.status(404).json({
                success: false,
                message: "Ticket not found",
            });
        }
        const { data: internalNote, error: noteError } = await supabase_1.supabase
            .from("communications")
            .insert({
            ticket_id: ticket.id,
            customer_id: ticket.customer_id,
            channel: "internal_note",
            direction: "internal",
            author_type: "agent",
            author_name: typeof author_name === "string" && author_name.trim().length > 0
                ? author_name.trim()
                : "Support Team",
            subject: "Internal Note",
            message_body: note.trim(),
            message_type: "internal_note",
            occurred_at: new Date().toISOString(),
        })
            .select(`
        id,
        ticket_id,
        customer_id,
        channel,
        direction,
        author_type,
        author_name,
        subject,
        message_body,
        message_type,
        occurred_at,
        created_at
      `)
            .single();
        if (noteError || !internalNote) {
            return res.status(500).json({
                success: false,
                message: "Failed to create internal note",
                error: noteError?.message,
            });
        }
        return res.status(201).json({
            success: true,
            message: "Internal note created successfully",
            data: internalNote,
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
