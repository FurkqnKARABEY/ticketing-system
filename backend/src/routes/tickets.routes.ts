import { Router } from "express";
import { supabase } from "../config/supabase";
import { isValidUuid } from "../utils/validation";
import {
  allowedCategories,
  allowedPriorities,
  allowedStatuses,
} from "../constants/ticket.constants";
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

const visibleTicketSources = [
  "website_form",
  "email_record",
  "openphone_record",
  "manual",
];

router.get("/", async (req, res) => {
  try {
    const { page, limit, from, to } = getPaginationParams(req.query);
    const search =
      typeof req.query.search === "string"
        ? req.query.search.replace(/[,%()]/g, " ").trim()
        : "";

    let query = supabase
      .from("tickets")
      .select(
        `
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
        `,
        { count: "exact" }
      )
      .in("source", visibleTicketSources);

    if (search) {
      query = query.or(
        [
          `ticket_number.ilike.%${search}%`,
          `title.ilike.%${search}%`,
          `description.ilike.%${search}%`,
          `status.ilike.%${search}%`,
          `priority.ilike.%${search}%`,
          `source.ilike.%${search}%`,
        ].join(",")
      );
    }

    const {
      data: tickets,
      error: ticketsError,
      count,
    } = await query.order("created_at", { ascending: false }).range(from, to);

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
        totalPages: getTotalPages(total, limit),
      },
      data: tickets || [],
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
        message: "Invalid ticket ID format",
      });
    }

    const { data: ticket, error: ticketError } = await supabase
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
      const { data: intakeCommunication } = await supabase
        .from("communications")
        .select(
          `
          id,
          email_address,
          phone_number,
          phone_number_normalized,
          author_name,
          raw_payload
        `
        )
        .eq("ticket_id", id)
        .eq("channel", "website_form")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      const rawPayload = intakeCommunication?.raw_payload as any;

      const intakeEmail =
        typeof intakeCommunication?.email_address === "string" &&
        intakeCommunication.email_address.trim().length > 0
          ? intakeCommunication.email_address.trim().toLowerCase()
          : null;

      const intakePhoneFromPayload =
        rawPayload && typeof rawPayload === "object"
          ? (typeof rawPayload.phone === "string" && rawPayload.phone.trim().length > 0
              ? rawPayload.phone.trim()
              : typeof rawPayload.phone_number === "string" &&
                  rawPayload.phone_number.trim().length > 0
                ? rawPayload.phone_number.trim()
                : typeof rawPayload.phoneNumber === "string" &&
                    rawPayload.phoneNumber.trim().length > 0
                  ? rawPayload.phoneNumber.trim()
                  : null)
          : null;

      const intakePhoneRaw =
        typeof intakeCommunication?.phone_number_normalized === "string" &&
        intakeCommunication.phone_number_normalized.trim().length > 0
          ? intakeCommunication.phone_number_normalized.trim()
          : typeof intakeCommunication?.phone_number === "string" &&
              intakeCommunication.phone_number.trim().length > 0
            ? intakeCommunication.phone_number.trim()
            : intakePhoneFromPayload;

      const intakePhoneNormalized = intakePhoneRaw
        ? normalizeUsPhone(intakePhoneRaw) || intakePhoneRaw
        : null;

      if (intakeEmail || intakePhoneNormalized) {
        const orParts: string[] = [];
        if (intakeEmail) {
          orParts.push(`email_primary.eq.${intakeEmail}`);
          orParts.push(`email_secondary.eq.${intakeEmail}`);
        }
        if (intakePhoneNormalized) {
          orParts.push(`phone_primary_normalized.eq.${intakePhoneNormalized}`);
          orParts.push(`phone_secondary_normalized.eq.${intakePhoneNormalized}`);
        }

        const { data: existingCustomer } = await supabase
          .from("customers")
          .select(
            `
            id
          `
          )
          .or(orParts.join(","))
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        let resolvedCustomerId = existingCustomer?.id || null;

        if (!resolvedCustomerId) {
          const now = new Date().toISOString();
          const { data: createdCustomer } = await supabase
            .from("customers")
            .insert({
              full_name:
                typeof intakeCommunication?.author_name === "string" &&
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
          // Backfill phone/email fields into the intake communication for easier matching later.
          if (intakeCommunication?.id && (intakePhoneRaw || intakeEmail)) {
            await supabase
              .from("communications")
              .update({
                phone_number: intakePhoneRaw,
                phone_number_normalized: intakePhoneNormalized,
                email_address: intakeEmail,
              })
              .eq("id", intakeCommunication.id);
          }

          await supabase
            .from("tickets")
            .update({ customer_id: resolvedCustomerId })
            .eq("id", id);

          await supabase
            .from("communications")
            .update({ customer_id: resolvedCustomerId })
            .eq("ticket_id", id);

          await supabase
            .from("attachments")
            .update({ customer_id: resolvedCustomerId })
            .eq("ticket_id", id);

          ticket.customer_id = resolvedCustomerId;
        }
      }
    }

    let customer = null;

    if (ticket.customer_id) {
      const { data: customerData, error: customerError } = await supabase
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

    // If the ticket is linked to a customer but the customer is missing a phone number,
    // try to backfill from the website_form payload (common when the form field name changes).
    if (
      ticket.customer_id &&
      customer &&
      !customer.phone_primary &&
      !customer.phone_primary_normalized &&
      !customer.phone_secondary &&
      !customer.phone_secondary_normalized
    ) {
      const { data: intakeCommunication } = await supabase
        .from("communications")
        .select(
          `
          id,
          phone_number,
          phone_number_normalized,
          email_address,
          raw_payload
        `
        )
        .eq("ticket_id", id)
        .eq("channel", "website_form")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      const rawPayload = intakeCommunication?.raw_payload as any;
      const payloadPhone =
        rawPayload && typeof rawPayload === "object"
          ? (typeof rawPayload.phone === "string" && rawPayload.phone.trim().length > 0
              ? rawPayload.phone.trim()
              : typeof rawPayload.phone_number === "string" &&
                  rawPayload.phone_number.trim().length > 0
                ? rawPayload.phone_number.trim()
                : typeof rawPayload.phoneNumber === "string" &&
                    rawPayload.phoneNumber.trim().length > 0
                  ? rawPayload.phoneNumber.trim()
                  : null)
          : null;

      const rawPhone =
        (typeof intakeCommunication?.phone_number_normalized === "string" &&
        intakeCommunication.phone_number_normalized.trim().length > 0
          ? intakeCommunication.phone_number_normalized.trim()
          : typeof intakeCommunication?.phone_number === "string" &&
              intakeCommunication.phone_number.trim().length > 0
            ? intakeCommunication.phone_number.trim()
            : payloadPhone) || null;

      const normalized = rawPhone ? normalizeUsPhone(rawPhone) || rawPhone : null;

      if (rawPhone || normalized) {
        await supabase
          .from("customers")
          .update({
            phone_primary: rawPhone,
            phone_primary_normalized: normalized,
            updated_at: new Date().toISOString(),
          })
          .eq("id", ticket.customer_id);

        customer.phone_primary = rawPhone;
        customer.phone_primary_normalized = normalized;

        if (intakeCommunication?.id) {
          await supabase
            .from("communications")
            .update({
              phone_number: rawPhone,
              phone_number_normalized: normalized,
            })
            .eq("id", intakeCommunication.id);
        }
      }
    }

    // Communications: primarily by customer_id, but also pull any records matching email/phone
    // (helps when web intake created a customer without phone, later fixed).
    const commSelect = `
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
    `;

    let baseCommunications: any[] = [];
    if (ticket.customer_id) {
      const { data } = await supabase
        .from("communications")
        .select(commSelect)
        .eq("customer_id", ticket.customer_id)
        .order("created_at", { ascending: true });
      baseCommunications = data || [];
    } else {
      const { data } = await supabase
        .from("communications")
        .select(commSelect)
        .eq("ticket_id", id)
        .order("created_at", { ascending: true });
      baseCommunications = data || [];
    }

    let extraCommunications: any[] = [];
    if (customer) {
      const email =
        (typeof customer.email_primary === "string" && customer.email_primary.trim().length > 0
          ? customer.email_primary.trim().toLowerCase()
          : typeof customer.email_secondary === "string" &&
              customer.email_secondary.trim().length > 0
            ? customer.email_secondary.trim().toLowerCase()
            : null) || null;
      const phone =
        (typeof customer.phone_primary_normalized === "string" &&
        customer.phone_primary_normalized.trim().length > 0
          ? customer.phone_primary_normalized.trim()
          : typeof customer.phone_secondary_normalized === "string" &&
              customer.phone_secondary_normalized.trim().length > 0
            ? customer.phone_secondary_normalized.trim()
            : null) || null;

      const orParts: string[] = [];
      if (email) {
        orParts.push(`email_address.eq.${email}`);
      }
      if (phone) {
        orParts.push(`phone_number_normalized.eq.${phone}`);
      }

      if (orParts.length > 0) {
        const { data } = await supabase
          .from("communications")
          .select(commSelect)
          .or(orParts.join(","))
          .order("created_at", { ascending: true });
        extraCommunications = data || [];
      }
    }

    const communicationsMap = new Map<string, any>();
    for (const comm of [...baseCommunications, ...extraCommunications]) {
      if (comm?.id) communicationsMap.set(comm.id, comm);
    }

    const communications = Array.from(communicationsMap.values()).sort((a, b) => {
      const aDate = new Date(a.created_at || a.occurred_at || 0).getTime();
      const bDate = new Date(b.created_at || b.occurred_at || 0).getTime();
      return aDate - bDate;
    });

    // Attachment query: pull by ticket/customer but also include any attachments tied to extra communications.

    let attachmentsQuery = supabase
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
    } else {
      attachmentsQuery = attachmentsQuery.eq("ticket_id", id);
    }

    const { data: attachments, error: attachmentsError } =
      await attachmentsQuery;

    if (attachmentsError) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch attachments",
        error: attachmentsError.message,
      });
    }

    let extraAttachments: any[] = [];
    const communicationIds = communications
      .map((comm) => comm?.id)
      .filter((value): value is string => typeof value === "string" && value.length > 0);

    if (communicationIds.length > 0) {
      const { data: byComm } = await supabase
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
        .in("communication_id", communicationIds)
        .order("created_at", { ascending: true });

      extraAttachments = byComm || [];
    }

    const attachmentsMap = new Map<string, any>();
    for (const att of [...(attachments || []), ...extraAttachments]) {
      if (att?.id) attachmentsMap.set(att.id, att);
    }

    return res.json({
      success: true,
      data: {
        ticket,
        customer,
        communications: communications || [],
        attachments: Array.from(attachmentsMap.values()) || [],
      },
    });
  } catch {
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

    if (!isValidUuid(id)) {
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

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value",
        allowedStatuses,
      });
    }

    const updatePayload: {
      status: string;
      updated_at: string;
      closed_at?: string | null;
    } = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === "closed") {
      updatePayload.closed_at = new Date().toISOString();
    }

    if (status !== "closed") {
      updatePayload.closed_at = null;
    }

    const { data: updatedTicket, error } = await supabase
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

    // Notify customer on status change (email + sms when available) and log outbound communications.
    const notification: any = {
      email: null,
      sms: null,
    };

    try {
      let customer: any = null;
      if (updatedTicket.customer_id) {
        const { data: customerData } = await supabase
          .from("customers")
          .select(
            `
            id,
            full_name,
            email_primary,
            email_secondary,
            phone_primary,
            phone_secondary,
            phone_primary_normalized,
            phone_secondary_normalized
          `
          )
          .eq("id", updatedTicket.customer_id)
          .maybeSingle();
        customer = customerData || null;
      }

      const emailAddress =
        customer?.email_primary ||
        customer?.email_secondary ||
        null;

      const phoneNumber =
        customer?.phone_primary_normalized ||
        customer?.phone_primary ||
        customer?.phone_secondary_normalized ||
        customer?.phone_secondary ||
        null;

      const statusMessage = `Your support ticket ${updatedTicket.ticket_number} status has been updated to: ${updatedTicket.status}.`;

      if (emailAddress && typeof emailAddress === "string") {
        const smtpHost = process.env.SMTP_HOST;
        const smtpPort = Number(process.env.SMTP_PORT || 587);
        const smtpSecure = process.env.SMTP_SECURE === "true";
        const smtpUser = process.env.SMTP_USER;
        const smtpPass = process.env.SMTP_PASS;
        const smtpFromName = process.env.SMTP_FROM_NAME || "Support Desk";
        const smtpFromEmail = process.env.SMTP_FROM_EMAIL || smtpUser;

        if (smtpHost && smtpUser && smtpPass && smtpFromEmail) {
          const nodemailer = await import("nodemailer");
          const transporter = nodemailer.default.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure,
            auth: { user: smtpUser, pass: smtpPass },
          });

          const sent = await transporter.sendMail({
            from: `"${smtpFromName}" <${smtpFromEmail}>`,
            to: emailAddress,
            subject: `Support Desk Ticket Update - ${updatedTicket.ticket_number}`,
            text: statusMessage,
            html: statusMessage,
          });

          notification.email = { ok: true, messageId: sent.messageId };

          await supabase.from("communications").insert({
            ticket_id: updatedTicket.id,
            customer_id: updatedTicket.customer_id,
            channel: "email",
            direction: "outgoing",
            author_type: "agent",
            author_name: "Support Team",
            email_address: emailAddress,
            subject: `Support Desk Ticket Update - ${updatedTicket.ticket_number}`,
            message_body: statusMessage,
            message_type: "status_update",
            external_id: sent.messageId || null,
            email_message_id: sent.messageId || null,
            occurred_at: new Date().toISOString(),
          });
        }
      }

      if (phoneNumber && typeof phoneNumber === "string") {
        const openphoneApiKey = process.env.OPENPHONE_API_KEY;
        const openphonePhoneNumberId = process.env.OPENPHONE_PHONE_NUMBER_ID;
        const normalizedTo = normalizeUsPhone(phoneNumber);

        if (openphoneApiKey && openphonePhoneNumberId && normalizedTo) {
          const response = await fetch("https://api.openphone.com/v1/messages", {
            method: "POST",
            headers: {
              Authorization: openphoneApiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              content: statusMessage,
              from: openphonePhoneNumberId,
              to: [normalizedTo],
            }),
          });

          const body = await response.json().catch(() => null);
          if (response.ok) {
            notification.sms = { ok: true, data: body };

            await supabase.from("communications").insert({
              ticket_id: updatedTicket.id,
              customer_id: updatedTicket.customer_id,
              channel: "sms",
              direction: "outgoing",
              author_type: "agent",
              author_name: "Support Team",
              phone_number: normalizedTo,
              phone_number_normalized: normalizedTo,
              message_body: statusMessage,
              message_type: "status_update",
              external_id: body?.data?.id || null,
              openphone_message_id: body?.data?.id || null,
              occurred_at: new Date().toISOString(),
              raw_payload: body,
            });
          } else {
            notification.sms = {
              ok: false,
              error: body?.message || `OpenPhone send failed (${response.status})`,
            };
          }
        }
      }
    } catch (notifyErr) {
      notification.error =
        notifyErr instanceof Error ? notifyErr.message : "Failed to notify customer";
    }

    return res.json({
      success: true,
      message: "Ticket status updated successfully",
      data: updatedTicket,
      notification,
    });
  } catch {
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

    if (!isValidUuid(id)) {
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

    if (!allowedPriorities.includes(priority)) {
      return res.status(400).json({
        success: false,
        message: "Invalid priority value",
        allowedPriorities,
      });
    }

    const { data: updatedTicket, error } = await supabase
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
    const { title, description, category } = req.body;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ticket ID format",
      });
    }

    const updatePayload: {
      title?: string;
      description?: string;
      category?: string;
      updated_at: string;
    } = {
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

      if (!allowedCategories.includes(category)) {
        return res.status(400).json({
          success: false,
          message: "Invalid category value",
          allowedCategories,
        });
      }

      updatePayload.category = category;
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

    const { data: updatedTicket, error } = await supabase
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
  } catch {
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

    if (!isValidUuid(id)) {
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

    const { data: ticket, error: ticketError } = await supabase
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

    const { data: internalNote, error: noteError } = await supabase
      .from("communications")
      .insert({
        ticket_id: ticket.id,
        customer_id: ticket.customer_id,
        channel: "internal_note",
        direction: "internal",
        author_type: "agent",
        author_name:
          typeof author_name === "string" && author_name.trim().length > 0
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
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});
export default router;
