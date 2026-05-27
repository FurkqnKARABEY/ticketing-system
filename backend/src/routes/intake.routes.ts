import { Router } from "express";
import nodemailer from "nodemailer";

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

router.post("/website-ticket-notify", requireIntakeSecret, async (req, res) => {
  try {
    const { email_address, phone_number, ticket_number } = req.body || {};

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

    const result: any = {
      ticket_number,
      email: null,
      sms: null,
    };

    if (email) {
      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = Number(process.env.SMTP_PORT || 587);
      const smtpSecure = process.env.SMTP_SECURE === "true";
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;
      const smtpFromName = process.env.SMTP_FROM_NAME || "Support Desk";
      const smtpFromEmail = process.env.SMTP_FROM_EMAIL || smtpUser;

      if (!smtpHost || !smtpUser || !smtpPass || !smtpFromEmail) {
        result.email = { ok: false, error: "SMTP configuration is missing" };
      } else {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpSecure,
          auth: { user: smtpUser, pass: smtpPass },
        });

        const message = `Hello,\n\nYour support ticket has been created.\n\nTicket Number: ${ticket_number}\n\nThank you,\nSupport Desk`;

        const sent = await transporter.sendMail({
          from: `"${smtpFromName}" <${smtpFromEmail}>`,
          to: email,
          subject: `Support Desk Ticket Created - ${ticket_number}`,
          text: message,
          html: message.replace(/\n/g, "<br />"),
        });

        result.email = {
          ok: true,
          messageId: sent.messageId,
          accepted: sent.accepted,
          rejected: sent.rejected,
        };
      }
    }

    if (normalizedPhone) {
      const openphoneApiKey = process.env.OPENPHONE_API_KEY;
      const openphonePhoneNumberId = process.env.OPENPHONE_PHONE_NUMBER_ID;

      if (!openphoneApiKey || !openphonePhoneNumberId) {
        result.sms = { ok: false, error: "OpenPhone configuration is missing" };
      } else {
        const message = `Your support ticket has been created. Ticket Number: ${ticket_number}.`;

        const response = await fetch("https://api.openphone.com/v1/messages", {
          method: "POST",
          headers: {
            Authorization: openphoneApiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: message,
            from: openphonePhoneNumberId,
            to: [normalizedPhone],
          }),
        });

        const body = await response.json().catch(() => null);
        if (!response.ok) {
          result.sms = {
            ok: false,
            error: body?.message || `OpenPhone send failed (${response.status})`,
          };
        } else {
          result.sms = { ok: true, data: body };
        }
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

