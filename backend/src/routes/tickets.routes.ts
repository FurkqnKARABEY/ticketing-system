import { Router } from "express";
import nodemailer from "nodemailer";
import { supabase } from "../config/supabase";
import { isValidUuid } from "../utils/validation";
import {
  allowedCategories,
  allowedPriorities,
  allowedStatuses,
} from "../constants/ticket.constants";
import { getPaginationParams, getTotalPages } from "../utils/pagination";

const router = Router();

const ticketSelect = `
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
  product_model,
  order_number,
  created_at,
  updated_at,
  closed_at
`;

const communicationSelect = `
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

const attachmentSelect = `
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
`;

const normalizeEmail = (value: unknown) => {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length > 0 ? email : null;
};

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

const getPhoneVariants = (...values: Array<string | null | undefined>) => {
  const variants = new Set<string>();

  for (const value of values) {
    if (!value) continue;
    const trimmed = value.trim();
    const digits = trimmed.replace(/\D/g, "");
    const normalized = normalizeUsPhone(trimmed);

    if (trimmed) variants.add(trimmed);
    if (normalized) variants.add(normalized);
    if (digits.length >= 10) variants.add(digits.slice(-10));
  }

  return Array.from(variants);
};

const getTextValue = (value: unknown, maxLength: number) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : null;
};

const getSmtpConfig = () => {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpSecure = process.env.SMTP_SECURE === "true";
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFromName = process.env.SMTP_FROM_NAME || "Support Desk";
  const smtpFromEmail = process.env.SMTP_FROM_EMAIL || smtpUser;

  if (!smtpHost || !smtpUser || !smtpPass || !smtpFromEmail) {
    throw new Error("SMTP configuration is missing");
  }

  return {
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPass,
    smtpFromName,
    smtpFromEmail,
  };
};

const sendStatusEmail = async ({
  to,
  ticketNumber,
  status,
  title,
}: {
  to: string;
  ticketNumber: string;
  status: string;
  title: string | null;
}) => {
  const config = getSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: { user: config.smtpUser, pass: config.smtpPass },
  });
  const message = `Hello,\n\nYour support ticket status has been updated.\n\nTicket Number: ${ticketNumber}\nStatus: ${status}\n${title ? `Ticket: ${title}\n` : ""}\nThank you,\nSupport Desk`;

  return {
    message,
    sent: await transporter.sendMail({
      from: `"${config.smtpFromName}" <${config.smtpFromEmail}>`,
      to,
      subject: `Ticket ${ticketNumber} status updated: ${status}`,
      text: message,
      html: message.replace(/\n/g, "<br />"),
    }),
  };
};

const sendStatusSms = async ({
  to,
  ticketNumber,
  status,
}: {
  to: string;
  ticketNumber: string;
  status: string;
}) => {
  const openphoneApiKey = process.env.OPENPHONE_API_KEY;
  const openphonePhoneNumberId = process.env.OPENPHONE_PHONE_NUMBER_ID;
  const normalizedTo = normalizeUsPhone(to);

  if (!openphoneApiKey || !openphonePhoneNumberId) {
    throw new Error("OpenPhone configuration is missing");
  }

  if (!normalizedTo) {
    throw new Error("Invalid customer phone number");
  }

  const message = `Your support ticket ${ticketNumber} status is now: ${status}.`;
  const response = await fetch("https://api.openphone.com/v1/messages", {
    method: "POST",
    headers: {
      Authorization: openphoneApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: message,
      from: openphonePhoneNumberId,
      to: [normalizedTo],
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message || `OpenPhone send failed (${response.status})`);
  }

  return { body, message, normalizedTo };
};

const logNotificationCommunication = async ({
  ticketId,
  customerId,
  channel,
  to,
  subject,
  message,
  ok,
  externalId,
  error,
}: {
  ticketId: string;
  customerId: string | null;
  channel: "email" | "sms";
  to: string;
  subject?: string;
  message: string;
  ok: boolean;
  externalId?: string | null;
  error?: string;
}) => {
  const now = new Date().toISOString();
  try {
    await supabase.from("communications").insert({
      ticket_id: ticketId,
      customer_id: customerId,
      channel,
      direction: "outgoing",
      author_type: "agent",
      author_name: "Support Team",
      email_address: channel === "email" ? to : null,
      phone_number: channel === "sms" ? to : null,
      phone_number_normalized: channel === "sms" ? normalizeUsPhone(to) : null,
      subject: subject || null,
      message_body: message,
      message_type: "status_notification",
      external_id: externalId || null,
      email_message_id: channel === "email" ? externalId || null : null,
      openphone_message_id: channel === "sms" ? externalId || null : null,
      summary: ok ? "Notification sent" : `Notification failed: ${error || "Unknown error"}`,
      occurred_at: now,
      created_at: now,
    });
  } catch {
    // Notification delivery results should still be returned if audit logging fails.
  }
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
      .select(ticketSelect, { count: "exact" })
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
      .select(ticketSelect)
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
          author_name
        `
        )
        .eq("ticket_id", id)
        .eq("channel", "website_form")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      const intakeEmail =
        typeof intakeCommunication?.email_address === "string" &&
        intakeCommunication.email_address.trim().length > 0
          ? intakeCommunication.email_address.trim().toLowerCase()
          : null;

      const intakePhoneRaw =
        typeof intakeCommunication?.phone_number_normalized === "string" &&
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

    const emailAddresses = [
      normalizeEmail(customer?.email_primary),
      normalizeEmail(customer?.email_secondary),
    ].filter(Boolean) as string[];
    const phoneVariants = getPhoneVariants(
      customer?.phone_primary_normalized,
      customer?.phone_primary,
      customer?.phone_secondary_normalized,
      customer?.phone_secondary
    );
    const matchParts = [`ticket_id.eq.${id}`];

    if (ticket.customer_id) {
      matchParts.push(`customer_id.eq.${ticket.customer_id}`);
    }

    for (const email of emailAddresses) {
      matchParts.push(`email_address.eq.${email}`);
    }

    for (const phone of phoneVariants) {
      matchParts.push(`phone_number.eq.${phone}`);
      matchParts.push(`phone_number_normalized.eq.${phone}`);
    }

    const { data: matchedCommunications, error: communicationsError } =
      await supabase
        .from("communications")
        .select(communicationSelect)
        .or(matchParts.join(","))
        .order("created_at", { ascending: true });

    if (communicationsError) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch communications",
        error: communicationsError.message,
      });
    }

    const communications = Array.from(
      new Map((matchedCommunications || []).map((communication) => [communication.id, communication])).values()
    );
    const communicationIds = communications.map((communication) => communication.id);
    const attachmentMatchParts = [`ticket_id.eq.${id}`];

    if (ticket.customer_id) {
      attachmentMatchParts.push(`customer_id.eq.${ticket.customer_id}`);
    }

    for (const communicationId of communicationIds) {
      attachmentMatchParts.push(`communication_id.eq.${communicationId}`);
    }

    const { data: matchedAttachments, error: attachmentsError } =
      await supabase
        .from("attachments")
        .select(attachmentSelect)
        .or(attachmentMatchParts.join(","))
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
        communications,
        attachments: Array.from(
          new Map((matchedAttachments || []).map((attachment) => [attachment.id, attachment])).values()
        ),
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
      .select(ticketSelect)
      .single();

    if (error || !updatedTicket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found or failed to update",
        error: error?.message,
      });
    }

    const notifications: Record<string, { ok: boolean; error?: string; data?: unknown }> = {
      email: { ok: false, error: "Customer email is missing" },
      sms: { ok: false, error: "Customer phone is missing" },
    };

    const { data: customer } = updatedTicket.customer_id
      ? await supabase
          .from("customers")
          .select(
            "id, full_name, email_primary, email_secondary, phone_primary, phone_secondary, phone_primary_normalized, phone_secondary_normalized"
          )
          .eq("id", updatedTicket.customer_id)
          .maybeSingle()
      : { data: null };

    const email = normalizeEmail(customer?.email_primary) || normalizeEmail(customer?.email_secondary);
    const phone =
      customer?.phone_primary_normalized ||
      customer?.phone_primary ||
      customer?.phone_secondary_normalized ||
      customer?.phone_secondary ||
      null;

    if (email) {
      const subject = `Ticket ${updatedTicket.ticket_number} status updated: ${status}`;
      try {
        const emailResult = await sendStatusEmail({
          to: email,
          ticketNumber: updatedTicket.ticket_number,
          status,
          title: updatedTicket.title,
        });
        notifications.email = {
          ok: true,
          data: {
            messageId: emailResult.sent.messageId,
            accepted: emailResult.sent.accepted,
            rejected: emailResult.sent.rejected,
          },
        };
        await logNotificationCommunication({
          ticketId: updatedTicket.id,
          customerId: updatedTicket.customer_id,
          channel: "email",
          to: email,
          subject,
          message: emailResult.message,
          ok: true,
          externalId: emailResult.sent.messageId || null,
        });
      } catch (notificationError) {
        const message =
          notificationError instanceof Error
            ? notificationError.message
            : "Email notification failed";
        notifications.email = { ok: false, error: message };
        await logNotificationCommunication({
          ticketId: updatedTicket.id,
          customerId: updatedTicket.customer_id,
          channel: "email",
          to: email,
          subject,
          message: `Ticket ${updatedTicket.ticket_number} status changed to ${status}.`,
          ok: false,
          error: message,
        });
      }
    }

    if (phone) {
      try {
        const smsResult = await sendStatusSms({
          to: phone,
          ticketNumber: updatedTicket.ticket_number,
          status,
        });
        const messageId = smsResult.body?.data?.id || smsResult.body?.id || null;
        notifications.sms = { ok: true, data: smsResult.body };
        await logNotificationCommunication({
          ticketId: updatedTicket.id,
          customerId: updatedTicket.customer_id,
          channel: "sms",
          to: smsResult.normalizedTo,
          message: smsResult.message,
          ok: true,
          externalId: messageId,
        });
      } catch (notificationError) {
        const message =
          notificationError instanceof Error
            ? notificationError.message
            : "SMS notification failed";
        notifications.sms = { ok: false, error: message };
        await logNotificationCommunication({
          ticketId: updatedTicket.id,
          customerId: updatedTicket.customer_id,
          channel: "sms",
          to: phone,
          message: `Ticket ${updatedTicket.ticket_number} status changed to ${status}.`,
          ok: false,
          error: message,
        });
      }
    }

    return res.json({
      success: true,
      message: "Ticket status updated successfully",
      data: {
        ticket: updatedTicket,
        notifications,
      },
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
      .select(ticketSelect)
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
    const {
      title,
      description,
      category,
      priority,
      status,
      product_model,
      order_number,
      customer_full_name,
      email,
      phone,
    } = req.body;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ticket ID format",
      });
    }

    const updatePayload: {
      title?: string;
      description?: string | null;
      category?: string;
      priority?: string;
      status?: string;
      product_model?: string | null;
      order_number?: string | null;
      customer_id?: string;
      closed_at?: string | null;
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

    if (priority !== undefined) {
      if (typeof priority !== "string" || !allowedPriorities.includes(priority)) {
        return res.status(400).json({
          success: false,
          message: "Invalid priority value",
          allowedPriorities,
        });
      }

      updatePayload.priority = priority;
    }

    if (status !== undefined) {
      if (typeof status !== "string" || !allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status value",
          allowedStatuses,
        });
      }

      updatePayload.status = status;
      updatePayload.closed_at = status === "closed" ? new Date().toISOString() : null;
    }

    const productModelValue = getTextValue(product_model, 240);
    if (productModelValue !== undefined) {
      updatePayload.product_model = productModelValue;
    }

    const orderNumberValue = getTextValue(order_number, 120);
    if (orderNumberValue !== undefined) {
      updatePayload.order_number = orderNumberValue;
    }

    const normalizedCustomerEmail = normalizeEmail(email);
    const normalizedCustomerPhone =
      typeof phone === "string" && phone.trim().length > 0
        ? normalizeUsPhone(phone) || null
        : null;
    const customerNameValue = getTextValue(customer_full_name, 240);
    const customerFieldsProvided =
      customerNameValue !== undefined ||
      email !== undefined ||
      phone !== undefined;

    if (email !== undefined && typeof email === "string" && email.trim() && !normalizedCustomerEmail) {
      return res.status(400).json({
        success: false,
        message: "Invalid email value",
      });
    }

    if (phone !== undefined && typeof phone === "string" && phone.trim() && !normalizedCustomerPhone) {
      return res.status(400).json({
        success: false,
        message: "Phone must be a US number that can be normalized to +1XXXXXXXXXX",
      });
    }

    const fieldsToUpdate = Object.keys(updatePayload).filter(
      (key) => key !== "updated_at"
    );

    if (fieldsToUpdate.length === 0 && !customerFieldsProvided) {
      return res.status(400).json({
        success: false,
        message: "At least one field must be provided to update",
      });
    }

    const { data: existingTicket, error: existingTicketError } = await supabase
      .from("tickets")
      .select(ticketSelect)
      .eq("id", id)
      .single();

    if (existingTicketError || !existingTicket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    let customerId = existingTicket.customer_id;
    let updatedCustomer = null;

    if (customerFieldsProvided) {
      const now = new Date().toISOString();
      const customerPayload: Record<string, unknown> = {
        updated_at: now,
      };

      if (customerNameValue !== undefined) customerPayload.full_name = customerNameValue;
      if (email !== undefined) customerPayload.email_primary = normalizedCustomerEmail;
      if (phone !== undefined) {
        customerPayload.phone_primary = typeof phone === "string" ? phone.trim() || null : null;
        customerPayload.phone_primary_normalized = normalizedCustomerPhone;
      }

      if (!customerId) {
        const { data: createdCustomer, error: createCustomerError } = await supabase
          .from("customers")
          .insert({
            ...customerPayload,
            full_name: customerPayload.full_name || "Unknown Customer",
            source: existingTicket.source || "manual",
            created_at: now,
          })
          .select(
            "id, first_name, last_name, full_name, email_primary, email_secondary, phone_primary, phone_secondary, phone_primary_normalized, phone_secondary_normalized, shipping_address, billing_address, customer_notes, source, created_at, updated_at"
          )
          .single();

        if (createCustomerError || !createdCustomer) {
          return res.status(500).json({
            success: false,
            message: "Failed to create customer",
            error: createCustomerError?.message,
          });
        }

        customerId = createdCustomer.id;
        updatePayload.customer_id = customerId;
        updatedCustomer = createdCustomer;
      } else {
        const { data: customerData, error: customerError } = await supabase
          .from("customers")
          .update(customerPayload)
          .eq("id", customerId)
          .select(
            "id, first_name, last_name, full_name, email_primary, email_secondary, phone_primary, phone_secondary, phone_primary_normalized, phone_secondary_normalized, shipping_address, billing_address, customer_notes, source, created_at, updated_at"
          )
          .single();

        if (customerError || !customerData) {
          return res.status(500).json({
            success: false,
            message: "Failed to update customer",
            error: customerError?.message,
          });
        }

        updatedCustomer = customerData;
      }
    }

    const { data: updatedTicket, error } = await supabase
      .from("tickets")
      .update(updatePayload)
      .eq("id", id)
      .select(ticketSelect)
      .single();

    if (error || !updatedTicket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found or failed to update",
        error: error?.message,
      });
    }

    if (customerId) {
      await supabase
        .from("communications")
        .update({ customer_id: customerId })
        .eq("ticket_id", id);

      await supabase
        .from("attachments")
        .update({ customer_id: customerId })
        .eq("ticket_id", id);
    }

    return res.json({
      success: true,
      message: "Ticket updated successfully",
      data: {
        ticket: updatedTicket,
        customer: updatedCustomer,
      },
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
