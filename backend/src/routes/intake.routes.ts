import { Router } from "express";
import nodemailer from "nodemailer";
import { supabase } from "../config/supabase";

const router = Router();

const requireIntakeSecret = (req: any, res: any, next: any) => {
  const expected = process.env.INTAKE_SECRET;
  if (!expected) {
    res.status(500).json({
      success: false,
      message: "INTAKE_SECRET is not configured",
    });
    return;
  }

  const provided = req.header("x-intake-secret");
  if (!provided || provided !== expected) {
    res.status(401).json({
      success: false,
      message: "Unauthorized intake request",
    });
    return;
  }

  next();
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

const logOutgoingNotification = async ({
  ticketId,
  customerId,
  ticketNumber,
  channel,
  to,
  message,
  subject,
  ok,
  externalId,
  error,
}: {
  ticketId: string | null;
  customerId: string | null;
  ticketNumber: string;
  channel: "email" | "sms";
  to: string | null;
  message: string;
  subject?: string;
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
      phone_number_normalized: channel === "sms" && to ? normalizeUsPhone(to) : null,
      subject: subject || null,
      message_body: message,
      message_type: "ticket_created_notification",
      external_id: externalId || null,
      email_message_id: channel === "email" ? externalId || null : null,
      openphone_message_id: channel === "sms" ? externalId || null : null,
      summary: ok
        ? `Website ticket ${ticketNumber} notification sent`
        : `Website ticket ${ticketNumber} notification failed: ${error || "Unknown error"}`,
      occurred_at: now,
      created_at: now,
    });
  } catch {
    // Notification API responses should not fail just because audit logging failed.
  }
};

const sendEmailNotification = async ({
  to,
  ticketNumber,
}: {
  to: string;
  ticketNumber: string;
}) => {
  const config = getSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: { user: config.smtpUser, pass: config.smtpPass },
  });
  const message = `Hello,\n\nYour support ticket has been created.\n\nTicket Number: ${ticketNumber}\n\nThank you,\nSupport Desk`;
  const subject = `Support Desk Ticket Created - ${ticketNumber}`;
  const sent = await transporter.sendMail({
    from: `"${config.smtpFromName}" <${config.smtpFromEmail}>`,
    to,
    subject,
    text: message,
    html: message.replace(/\n/g, "<br />"),
  });

  return { sent, message, subject };
};

const sendSmsNotification = async ({
  to,
  message,
}: {
  to: string;
  message: string;
}) => {
  const openphoneApiKey = process.env.OPENPHONE_API_KEY;
  const openphonePhoneNumberId = process.env.OPENPHONE_PHONE_NUMBER_ID;

  if (!openphoneApiKey || !openphonePhoneNumberId) {
    throw new Error("OpenPhone configuration is missing");
  }

  const normalizedTo = normalizeUsPhone(to);
  if (!normalizedTo) {
    throw new Error("Invalid phone number");
  }

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

  return { body, normalizedTo };
};

router.post("/website-ticket-notify", requireIntakeSecret, async (req, res) => {
  try {
    const { email_address, phone_number, ticket_number, ticket_id, customer_id, source } =
      req.body || {};

    if (!ticket_number || typeof ticket_number !== "string") {
      return res.status(400).json({
        success: false,
        message: "ticket_number is required",
      });
    }

    const email =
      typeof email_address === "string" && email_address.trim().length > 0
        ? email_address.trim().toLowerCase()
        : null;

    const phoneRaw =
      typeof phone_number === "string" && phone_number.trim().length > 0
        ? phone_number.trim()
        : null;

    const normalizedPhone = phoneRaw ? normalizeUsPhone(phoneRaw) : null;
    let ticketId = typeof ticket_id === "string" ? ticket_id : null;
    let customerId = typeof customer_id === "string" ? customer_id : null;
    let ticketSource = typeof source === "string" ? source : null;

    if (!ticketId || !customerId || !ticketSource) {
      const { data: ticket } = await supabase
        .from("tickets")
        .select("id, customer_id, source")
        .eq("ticket_number", ticket_number)
        .maybeSingle();

      ticketId = ticketId || ticket?.id || null;
      customerId = customerId || ticket?.customer_id || null;
      ticketSource = ticketSource || ticket?.source || null;
    }

    const isWebsiteTicket = !ticketSource || ticketSource === "website_form";

    const result: any = {
      ticket_number,
      email: null,
      sms: null,
      company_sms: null,
    };

    if (email) {
      try {
        const { sent, message, subject } = await sendEmailNotification({
          to: email,
          ticketNumber: ticket_number,
        });
        result.email = {
          ok: true,
          messageId: sent.messageId,
          accepted: sent.accepted,
          rejected: sent.rejected,
        };
        await logOutgoingNotification({
          ticketId,
          customerId,
          ticketNumber: ticket_number,
          channel: "email",
          to: email,
          subject,
          message,
          ok: true,
          externalId: sent.messageId || null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Email failed";
        result.email = { ok: false, error: message };
        await logOutgoingNotification({
          ticketId,
          customerId,
          ticketNumber: ticket_number,
          channel: "email",
          to: email,
          subject: `Support Desk Ticket Created - ${ticket_number}`,
          message: `Your support ticket has been created. Ticket Number: ${ticket_number}.`,
          ok: false,
          error: message,
        });
      }
    }

    if (normalizedPhone) {
      const message = `Your support ticket has been created. Ticket Number: ${ticket_number}.`;
      try {
        const smsResult = await sendSmsNotification({
          to: normalizedPhone,
          message,
        });
        result.sms = { ok: true, data: smsResult.body };
        await logOutgoingNotification({
          ticketId,
          customerId,
          ticketNumber: ticket_number,
          channel: "sms",
          to: smsResult.normalizedTo,
          message,
          ok: true,
          externalId: smsResult.body?.data?.id || smsResult.body?.id || null,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "SMS failed";
        result.sms = { ok: false, error: errorMessage };
        await logOutgoingNotification({
          ticketId,
          customerId,
          ticketNumber: ticket_number,
          channel: "sms",
          to: normalizedPhone,
          message,
          ok: false,
          error: errorMessage,
        });
      }
    }

    const companyPhone = process.env.COMPANY_ALERT_PHONE_NUMBER;
    if (isWebsiteTicket && companyPhone) {
      const message = `New website support ticket created: ${ticket_number}.`;
      try {
        const companySms = await sendSmsNotification({ to: companyPhone, message });
        result.company_sms = { ok: true, data: companySms.body };
        await logOutgoingNotification({
          ticketId,
          customerId: null,
          ticketNumber: ticket_number,
          channel: "sms",
          to: companySms.normalizedTo,
          message,
          ok: true,
          externalId: companySms.body?.data?.id || companySms.body?.id || null,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Company SMS failed";
        result.company_sms = { ok: false, error: errorMessage };
        await logOutgoingNotification({
          ticketId,
          customerId: null,
          ticketNumber: ticket_number,
          channel: "sms",
          to: companyPhone,
          message,
          ok: false,
          error: errorMessage,
        });
      }
    }

    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to send ticket created notification",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
