import { Router } from "express";
import { supabase } from "../config/supabase";
import { isValidUuid } from "../utils/validation";
import nodemailer from "nodemailer";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { getPaginationParams, getTotalPages } from "../utils/pagination";

const router = Router();

const openPhoneChannels = [
  "openphone_sms",
  "openphone_call",
  "openphone_mms",
  "sms",
  "mms",
  "call",
  "voicemail",
];

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

const customerSelect = `
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
const generateTicketNumber = () => {
  const now = new Date();

  const datePart = now
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");

  const timePart = now
    .toISOString()
    .slice(11, 19)
    .replace(/:/g, "");

  const randomPart = Math.floor(Math.random() * 900 + 100);

  return `TKT-${datePart}-${timePart}-${randomPart}`;
};

const isOpenPhoneChannel = (channel: string) => {
  return openPhoneChannels.includes(channel);
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

const sendTicketCreatedEmail = async ({
  to,
  ticketNumber,
}: {
  to: string;
  ticketNumber: string;
}) => {
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

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  const message = `Hello,

Your support ticket has been created.

Ticket Number: ${ticketNumber}

Our support team will review your request and follow up with you as soon as possible.

Thank you,
Support Desk`;

  const result = await transporter.sendMail({
    from: `"${smtpFromName}" <${smtpFromEmail}>`,
    to,
    subject: `Your Support Desk Ticket Has Been Created - ${ticketNumber}`,
    text: message,
    html: message.replace(/\n/g, "<br />"),
  });

  return result;
};

const sendTicketCreatedSms = async ({
  to,
  ticketNumber,
}: {
  to: string;
  ticketNumber: string;
}) => {
  const openphoneApiKey = process.env.OPENPHONE_API_KEY;
  const openphonePhoneNumberId = process.env.OPENPHONE_PHONE_NUMBER_ID;

  if (!openphoneApiKey || !openphonePhoneNumberId) {
    throw new Error("OpenPhone configuration is missing");
  }

  const normalizedTo = normalizeUsPhone(to);

  if (!normalizedTo) {
    throw new Error("Invalid customer phone number");
  }

  const message = `Your support ticket has been created. Ticket Number: ${ticketNumber}. Our team will review it and follow up soon.`;

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

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result?.message || "Failed to send OpenPhone SMS");
  }

  return {
    result,
    normalizedTo,
    message,
  };
};

router.get("/email", async (_req, res) => {
  try {
    const { page, limit, from, to } = getPaginationParams(_req.query);
    const view = typeof _req.query.view === "string" ? _req.query.view : "records";
    const search =
      typeof _req.query.search === "string"
        ? _req.query.search.replace(/[,%()]/g, " ").trim()
        : "";

    if (view === "conversations") {
      const targetCount = page * limit;
      const groups: Array<{
        key: string;
        latest: any;
        count: number;
      }> = [];
      const byKey = new Map<string, { index: number; count: number }>();
      let offset = 0;
      const chunkSize = 250;
      let exhausted = false;

      while (groups.length < targetCount && !exhausted) {
        const chunkTo = offset + chunkSize - 1;
        let query = supabase
          .from("communications")
          .select(communicationSelect, { count: "exact" })
          .eq("channel", "email")
          .order("created_at", { ascending: false })
          .range(offset, chunkTo);

        if (search) {
          query = query.or(
            [
              `author_name.ilike.%${search}%`,
              `email_address.ilike.%${search}%`,
              `subject.ilike.%${search}%`,
              `summary.ilike.%${search}%`,
              `message_body.ilike.%${search}%`,
            ].join(",")
          );
        }

        const { data: records, error } = await query;

        if (error) {
          return res.status(500).json({
            success: false,
            message: "Failed to fetch email records",
            error: error.message,
          });
        }

        if (!records || records.length === 0) {
          exhausted = true;
          break;
        }

        for (const record of records) {
          const emailKey = (record.email_address || "").trim().toLowerCase();
          const key = emailKey || record.customer_id || record.id;
          const existing = byKey.get(key);

          if (!existing) {
            byKey.set(key, { index: groups.length, count: 1 });
            groups.push({ key, latest: record, count: 1 });
          } else {
            existing.count += 1;
            groups[existing.index].count = existing.count;
          }
        }

        offset += records.length;

        if (records.length < chunkSize) {
          exhausted = true;
        }
      }

      const start = (page - 1) * limit;
      const slice = groups.slice(start, start + limit);
      const data = slice.map((group) => ({
        ...group.latest,
        thread_key: group.key,
        thread_count: group.count,
      }));

      return res.json({
        success: true,
        count: data.length,
        pagination: {
          page,
          limit,
          total: exhausted ? groups.length : Math.max(groups.length, targetCount + 1),
          totalPages: exhausted ? getTotalPages(groups.length, limit) : page + 1,
        },
        data,
      });
    }

    let query = supabase
      .from("communications")
      .select(communicationSelect, { count: "exact" })
      .eq("channel", "email");

    if (search) {
      query = query.or(
        [
          `author_name.ilike.%${search}%`,
          `email_address.ilike.%${search}%`,
          `subject.ilike.%${search}%`,
          `summary.ilike.%${search}%`,
          `message_body.ilike.%${search}%`,
        ].join(",")
      );
    }

    const { data: records, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch email records",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      count: records?.length || 0,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: getTotalPages(count || 0, limit),
      },
      data: records || [],
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

router.get("/openphone", async (_req, res) => {
  try {
    const { page, limit, from, to } = getPaginationParams(_req.query);
    const view = typeof _req.query.view === "string" ? _req.query.view : "records";
    const search =
      typeof _req.query.search === "string"
        ? _req.query.search.replace(/[,%()]/g, " ").trim()
        : "";

    if (view === "conversations") {
      const targetCount = page * limit;
      const groups: Array<{
        key: string;
        latest: any;
        count: number;
      }> = [];
      const byKey = new Map<string, { index: number; count: number }>();
      let offset = 0;
      const chunkSize = 250;
      let exhausted = false;

      while (groups.length < targetCount && !exhausted) {
        const chunkTo = offset + chunkSize - 1;

        let query = supabase
          .from("communications")
          .select(communicationSelect, { count: "exact" })
          .in("channel", openPhoneChannels)
          .order("created_at", { ascending: false })
          .range(offset, chunkTo);

        if (search) {
          query = query.or(
            [
              `author_name.ilike.%${search}%`,
              `phone_number.ilike.%${search}%`,
              `phone_number_normalized.ilike.%${search}%`,
              `summary.ilike.%${search}%`,
              `message_body.ilike.%${search}%`,
              `call_type.ilike.%${search}%`,
              `transcript_text.ilike.%${search}%`,
              `channel.ilike.%${search}%`,
              `direction.ilike.%${search}%`,
            ].join(",")
          );
        }

        const { data: records, error } = await query;

        if (error) {
          return res.status(500).json({
            success: false,
            message: "Failed to fetch OpenPhone records",
            error: error.message,
          });
        }

        if (!records || records.length === 0) {
          exhausted = true;
          break;
        }

        for (const record of records) {
          const phoneKey =
            record.phone_number_normalized || record.phone_number || "";
          const key = phoneKey || record.customer_id || record.id;
          const existing = byKey.get(key);

          if (!existing) {
            byKey.set(key, { index: groups.length, count: 1 });
            groups.push({ key, latest: record, count: 1 });
          } else {
            existing.count += 1;
            groups[existing.index].count = existing.count;
          }
        }

        offset += records.length;

        if (records.length < chunkSize) {
          exhausted = true;
        }
      }

      const start = (page - 1) * limit;
      const slice = groups.slice(start, start + limit);
      const data = slice.map((group) => ({
        ...group.latest,
        thread_key: group.key,
        thread_count: group.count,
      }));

      return res.json({
        success: true,
        count: data.length,
        pagination: {
          page,
          limit,
          total: exhausted ? groups.length : Math.max(groups.length, targetCount + 1),
          totalPages: exhausted ? getTotalPages(groups.length, limit) : page + 1,
        },
        data,
      });
    }

    let query = supabase
      .from("communications")
      .select(communicationSelect, { count: "exact" })
      .in("channel", openPhoneChannels);

    if (search) {
      query = query.or(
        [
          `author_name.ilike.%${search}%`,
          `phone_number.ilike.%${search}%`,
          `phone_number_normalized.ilike.%${search}%`,
          `summary.ilike.%${search}%`,
          `message_body.ilike.%${search}%`,
          `call_type.ilike.%${search}%`,
          `transcript_text.ilike.%${search}%`,
          `channel.ilike.%${search}%`,
          `direction.ilike.%${search}%`,
        ].join(",")
      );
    }

    const { data: records, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch OpenPhone records",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      count: records?.length || 0,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: getTotalPages(count || 0, limit),
      },
      data: records || [],
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

router.get("/email/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email record ID format",
      });
    }

    const { data: record, error: recordError } = await supabase
      .from("communications")
      .select(communicationSelect)
      .eq("id", id)
      .eq("channel", "email")
      .single();

    if (recordError || !record) {
      return res.status(404).json({
        success: false,
        message: "Email record not found",
      });
    }

    const customerId = record.customer_id;

    const { data: customer } = customerId
      ? await supabase
          .from("customers")
          .select(customerSelect)
          .eq("id", customerId)
          .single()
      : { data: null };

    const { data: relatedCommunications, error: relatedError } = customerId
      ? await supabase
          .from("communications")
          .select(communicationSelect)
          .eq("customer_id", customerId)
          .eq("channel", "email")
          .order("created_at", { ascending: true })
      : { data: [], error: null };

    if (relatedError) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch related email records",
        error: relatedError.message,
      });
    }

    const { data: attachments, error: attachmentsError } = customerId
      ? await supabase
          .from("attachments")
          .select(attachmentSelect)
          .eq("customer_id", customerId)
          .order("created_at", { ascending: true })
      : { data: [], error: null };

    if (attachmentsError) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch email record attachments",
        error: attachmentsError.message,
      });
    }

    return res.json({
      success: true,
      data: {
        record,
        customer,
        communications: relatedCommunications || [],
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

router.get("/openphone/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid OpenPhone record ID format",
      });
    }

    const { data: record, error: recordError } = await supabase
      .from("communications")
      .select(communicationSelect)
      .eq("id", id)
      .in("channel", openPhoneChannels)
      .single();

    if (recordError || !record) {
      return res.status(404).json({
        success: false,
        message: "OpenPhone record not found",
      });
    }

    const customerId = record.customer_id;

    const { data: customer } = customerId
      ? await supabase
          .from("customers")
          .select(customerSelect)
          .eq("id", customerId)
          .single()
      : { data: null };

    const { data: relatedCommunications, error: relatedError } = customerId
      ? await supabase
          .from("communications")
          .select(communicationSelect)
          .eq("customer_id", customerId)
          .in("channel", openPhoneChannels)
          .order("created_at", { ascending: true })
      : { data: [], error: null };

    if (relatedError) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch related OpenPhone records",
        error: relatedError.message,
      });
    }

    const { data: attachments, error: attachmentsError } = customerId
      ? await supabase
          .from("attachments")
          .select(attachmentSelect)
          .eq("customer_id", customerId)
          .order("created_at", { ascending: true })
      : { data: [], error: null };

    if (attachmentsError) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch OpenPhone record attachments",
        error: attachmentsError.message,
      });
    }

    return res.json({
      success: true,
      data: {
        record,
        customer,
        communications: relatedCommunications || [],
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
router.post("/:communicationId/add-to-ticket", async (req: AuthenticatedRequest, res) => {
  try {
    const communicationId = req.params.communicationId;

if (typeof communicationId !== "string" || !isValidUuid(communicationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid communication ID format",
      });
    }

    const { data: communication, error: communicationError } = await supabase
      .from("communications")
      .select(communicationSelect)
      .eq("id", communicationId)
      .single();

    if (communicationError || !communication) {
      return res.status(404).json({
        success: false,
        message: "Communication record not found",
      });
    }

    if (communication.ticket_id) {
      return res.status(400).json({
        success: false,
        message: "This record is already linked to a ticket",
        ticket_id: communication.ticket_id,
      });
    }

    const customerId = communication.customer_id;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "Communication record does not have a customer",
      });
    }

    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select(customerSelect)
      .eq("id", customerId)
      .single();

    if (customerError || !customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const ticketNumber = generateTicketNumber();

    const title =
      communication.subject ||
      communication.summary ||
      communication.message_body?.slice(0, 120) ||
      `${communication.channel} support request`;

    const description =
      communication.message_body ||
      communication.summary ||
      `${communication.channel} communication converted to ticket.`;

    const now = new Date().toISOString();

    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .insert({
        ticket_number: ticketNumber,
        customer_id: customer.id,
        title,
        description,
        category: "general_support",
        status: "new",
        priority: "normal",
        source: communication.channel === "email" ? "email_record" : "openphone_record",
        created_at: now,
        updated_at: now,
        last_activity_at: now,
      })
      .select(`
        id,
        ticket_number,
        customer_id,
        title,
        description,
        category,
        status,
        priority,
        source,
        created_at,
        updated_at,
        last_activity_at
      `)
      .single();

    if (ticketError || !ticket) {
      return res.status(500).json({
        success: false,
        message: "Failed to create ticket",
        error: ticketError?.message,
      });
    }

    const { error: communicationUpdateError } = await supabase
      .from("communications")
      .update({
        ticket_id: ticket.id,
      })
      .eq("id", communication.id);

    if (communicationUpdateError) {
      return res.status(500).json({
        success: false,
        message: "Ticket was created, but failed to link communication",
        error: communicationUpdateError.message,
        ticket,
      });
    }

    await supabase
      .from("attachments")
      .update({
        ticket_id: ticket.id,
      })
      .eq("communication_id", communication.id);

    let notificationResult: unknown = null;
    let notificationChannel: "email" | "sms" | null = null;

    try {
      if (communication.channel === "email") {
        const emailAddress =
          communication.email_address ||
          customer.email_primary ||
          customer.email_secondary;

        if (emailAddress) {
          const emailResult = await sendTicketCreatedEmail({
            to: emailAddress,
            ticketNumber,
          });

          notificationChannel = "email";
          notificationResult = {
            messageId: emailResult.messageId,
            accepted: emailResult.accepted,
            rejected: emailResult.rejected,
          };

          await supabase.from("communications").insert({
            ticket_id: ticket.id,
            customer_id: customer.id,
            channel: "email",
            direction: "outgoing",
            author_type: "agent",
          author_name: req.user?.full_name || "Support Team",
            email_address: emailAddress,
          subject: `Your Support Desk Ticket Has Been Created - ${ticketNumber}`,
            message_body: `Your support ticket has been created. Ticket Number: ${ticketNumber}.`,
            message_type: "email",
            external_id: emailResult.messageId || null,
            email_message_id: emailResult.messageId || null,
            occurred_at: new Date().toISOString(),
          });
        }
      } else if (isOpenPhoneChannel(communication.channel)) {
        const phoneNumber =
          communication.phone_number ||
          communication.phone_number_normalized ||
          customer.phone_primary ||
          customer.phone_primary_normalized ||
          customer.phone_secondary ||
          customer.phone_secondary_normalized;

        if (phoneNumber) {
          const smsResult = await sendTicketCreatedSms({
            to: phoneNumber,
            ticketNumber,
          });

          notificationChannel = "sms";
          notificationResult = smsResult.result;

          await supabase.from("communications").insert({
            ticket_id: ticket.id,
            customer_id: customer.id,
            channel: "sms",
            direction: "outgoing",
            author_type: "agent",
          author_name: req.user?.full_name || "Support Team",
            phone_number: smsResult.normalizedTo,
            phone_number_normalized: smsResult.normalizedTo,
            message_body: smsResult.message,
            message_type: "sms",
            external_id: smsResult.result?.data?.id || null,
            openphone_message_id: smsResult.result?.data?.id || null,
            occurred_at: new Date().toISOString(),
          });
        }
      }
    } catch (notificationError) {
      notificationResult = {
        error:
          notificationError instanceof Error
            ? notificationError.message
            : "Notification failed",
      };
    }

    return res.status(201).json({
      success: true,
      message: "Ticket created successfully from record",
      data: {
        ticket,
        linked_communication_id: communication.id,
        notification: {
          channel: notificationChannel,
          result: notificationResult,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to create ticket from record",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
export default router;
