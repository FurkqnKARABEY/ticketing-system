"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../config/supabase");
const validation_1 = require("../utils/validation");
const ticket_constants_1 = require("../constants/ticket.constants");
const pagination_1 = require("../utils/pagination");
const router = (0, express_1.Router)();
router.get("/", async (req, res) => {
    try {
        const { page, limit, from, to } = (0, pagination_1.getPaginationParams)(req.query);
        const { data: tickets, error: ticketsError, count, } = await supabase_1.supabase
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
            .order("created_at", { ascending: false })
            .range(from, to);
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
        const { data: communications, error: communicationsError } = await supabase_1.supabase
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
            .eq("ticket_id", id)
            .order("created_at", { ascending: true });
        if (communicationsError) {
            return res.status(500).json({
                success: false,
                message: "Failed to fetch communications",
                error: communicationsError.message,
            });
        }
        const { data: attachments, error: attachmentsError } = await supabase_1.supabase
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
            .eq("ticket_id", id)
            .order("created_at", { ascending: true });
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
                : "Perraro Team",
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
