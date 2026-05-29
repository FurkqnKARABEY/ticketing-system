import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { sendEmail, sendSms } from "../api/actions";
import type { OutboundAttachment } from "../api/actions";
import { EmailComposer, SmsComposer } from "../components/MessageComposers";
import { getTicketById, updateTicket, updateTicketStatus } from "../api/tickets";
import { resyncOpenPhoneCommunication } from "../api/records";
import type {
  Attachment,
  Communication,
  Ticket,
  TicketCustomer,
} from "../types/ticket";

const categoryOptions = [
  "general",
  "general_support",
  "shipping_delivery",
  "damaged_item",
  "parts_request",
  "warranty",
  "return_refund",
  "complaint",
];

const priorityOptions = ["low", "normal", "high", "urgent"];
const statusOptions = ["new", "open", "pending", "closed"];

type TicketEditForm = {
  customer_full_name: string;
  email: string;
  phone: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  product_model: string;
  order_number: string;
};

const buildTicketForm = (
  ticket: Ticket | null,
  customer: TicketCustomer | null
): TicketEditForm => ({
  customer_full_name: customer?.full_name || "",
  email: customer?.email_primary || customer?.email_secondary || "",
  phone:
    customer?.phone_primary_normalized ||
    customer?.phone_primary ||
    customer?.phone_secondary_normalized ||
    customer?.phone_secondary ||
    "",
  title: ticket?.title || "",
  description: ticket?.description || "",
  category: ticket?.category || "general_support",
  priority: ticket?.priority || "normal",
  product_model: ticket?.product_model || "",
  order_number: ticket?.order_number || "",
});

const formatDate = (value: string | null) => {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
};

const getAttachmentOpenUrl = (attachment: Attachment) => {
  return attachment.file_url || "#";
};

const isDriveLink = (url: string | null) => {
  if (!url) return false;
  return url.includes("drive.google.com");
};

const getDisplayName = (
  communication: Communication,
  customer: TicketCustomer | null
) => {
  if (communication.author_name) return communication.author_name;

  if (communication.author_type === "agent") {
    return "Support Team";
  }

  if (customer?.full_name) {
    return customer.full_name;
  }

  return "Unknown Customer";
};

const isOpenPhoneCommunication = (communication: Communication) => {
  return (
    communication.channel.includes("openphone") ||
    communication.channel === "sms" ||
    communication.channel === "mms" ||
    communication.channel === "call" ||
    communication.channel === "voicemail"
  );
};

const isEmailCommunication = (communication: Communication) => {
  return communication.channel === "email";
};

type ChatAttachmentProps = {
  attachment: Attachment;
};

const ChatAttachment = ({ attachment }: ChatAttachmentProps) => {
  const openUrl = getAttachmentOpenUrl(attachment);
  const mime = attachment.mime_type || attachment.file_type || "";
  const isImage = mime.startsWith("image/");
  const isVideo = mime.startsWith("video/");
  const isAudio = mime.startsWith("audio/");
  const driveLink = isDriveLink(openUrl);

  return (
    <div className="chat-attachment">
      <div className="chat-attachment-meta">
        <strong>{attachment.file_name || "Attachment"}</strong>
        <span>{mime || "File"}</span>
      </div>

      {driveLink ? (
        <div className="attachment-warning">
          This attachment is stored in Google Drive and may require sign-in.
          <a href={openUrl} target="_blank" rel="noreferrer" className="text-link">
            Open in Drive
          </a>
        </div>
      ) : isImage ? (
        <a href={openUrl} target="_blank" rel="noreferrer" className="attachment-preview">
          <img src={openUrl} alt={attachment.file_name || "Attachment"} />
        </a>
      ) : isVideo ? (
        <video className="attachment-video" controls src={openUrl} />
      ) : isAudio ? (
        <audio className="attachment-audio" controls src={openUrl} />
      ) : (
        <a
          href={openUrl}
          target="_blank"
          rel="noreferrer"
          className="text-link"
        >
          Open file
        </a>
      )}
    </div>
  );
};

type MessageBubbleProps = {
  communication: Communication;
  customer: TicketCustomer | null;
  attachments: Attachment[];
};

const MessageBubble = ({
  communication,
  customer,
  attachments,
}: MessageBubbleProps) => {
  const isOutgoing = communication.direction === "outgoing";
  const isOpenPhoneCall =
    isOpenPhoneCommunication(communication) &&
    (communication.channel.includes("call") ||
      communication.message_type === "call" ||
      Boolean(communication.call_type));
  const hasOpenPhoneContent = Boolean(
    communication.summary ||
      communication.message_body ||
      communication.transcript_text ||
      communication.recording_url ||
      attachments.length
  );

  return (
    <div className={`message-row ${isOutgoing ? "outgoing" : "incoming"}`}>
      <article className="message-bubble">
        <div className="message-meta">
          <strong>{getDisplayName(communication, customer)}</strong>
          <span>
            {formatDate(communication.occurred_at || communication.created_at)}
          </span>
        </div>

        <div className="message-tags">
          <span className={`message-tag ${isOutgoing ? "outgoing" : "incoming"}`}>
            {communication.direction || "unknown"}
          </span>
          <span className="message-tag neutral">{communication.channel}</span>
        </div>

        {communication.subject && (
          <h4 className="message-subject">{communication.subject}</h4>
        )}

        {communication.summary && (
          <p className="message-summary">{communication.summary}</p>
        )}

        {communication.message_body && (
          <p className="message-body">{communication.message_body}</p>
        )}

        {communication.recording_url && (
          <audio className="message-audio" controls src={communication.recording_url}>
            Your browser does not support audio playback.
          </audio>
        )}

        {communication.transcript_text && (
          <details className="message-details">
            <summary>View transcript</summary>
            <p className="message-body">{communication.transcript_text}</p>
          </details>
        )}

        {communication.transcript_url && !communication.transcript_text && (
          <a
            className="text-link transcript-link"
            href={communication.transcript_url}
            target="_blank"
            rel="noreferrer"
          >
            Open transcript
          </a>
        )}

        {isOpenPhoneCall && !hasOpenPhoneContent && (
          <p className="message-empty-note">
            Call details have not synced yet.
          </p>
        )}

        {attachments.length > 0 && (
          <div className="message-attachments">
            {attachments.map((attachment) => (
              <ChatAttachment key={attachment.id} attachment={attachment} />
            ))}
          </div>
        )}
      </article>
    </div>
  );
};

export const TicketDetailPage = () => {
  const { id } = useParams();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [customer, setCustomer] = useState<TicketCustomer | null>(null);
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [editForm, setEditForm] = useState<TicketEditForm>(() =>
    buildTicketForm(null, null)
  );
  const [statusDraft, setStatusDraft] = useState("new");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isSyncingOpenPhone, setIsSyncingOpenPhone] = useState(false);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");

  const loadTicket = async () => {
    if (!id) return;

    setIsLoading(true);
    setError("");

    try {
      const response = await getTicketById(id);

      setTicket(response.data.ticket);
      setCustomer(response.data.customer);
      setCommunications(response.data.communications || []);
      setAttachments(response.data.attachments || []);
      setEditForm(buildTicketForm(response.data.ticket, response.data.customer));
      setStatusDraft(response.data.ticket.status || "new");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ticket");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTicket();
  }, [id]);

  const attachmentsByCommunication = useMemo(() => {
    return attachments.reduce<Record<string, Attachment[]>>((acc, attachment) => {
      if (!attachment.communication_id) return acc;

      if (!acc[attachment.communication_id]) {
        acc[attachment.communication_id] = [];
      }

      acc[attachment.communication_id].push(attachment);
      return acc;
    }, {});
  }, [attachments]);

  const openPhoneHistory = useMemo(() => {
    return Array.from(
      new Map(
        communications
          .filter(isOpenPhoneCommunication)
          .map((communication) => [communication.id, communication])
      ).values()
    );
  }, [communications]);

  const emailHistory = useMemo(() => {
    return Array.from(
      new Map(
        communications
          .filter(isEmailCommunication)
          .map((communication) => [communication.id, communication])
      ).values()
    );
  }, [communications]);

  const customerPhoneNumber =
    customer?.phone_primary_normalized ||
    customer?.phone_primary ||
    customer?.phone_secondary_normalized ||
    customer?.phone_secondary;

  const customerEmailAddress = customer?.email_primary || customer?.email_secondary;

  const updateFormField = (field: keyof TicketEditForm, value: string) => {
    setEditForm((current) => ({ ...current, [field]: value }));
  };

  const handleSaveTicket = async () => {
    if (!ticket) return;

    setIsSaving(true);
    setActionError("");
    setActionMessage("");

    try {
      const response = await updateTicket(ticket.id, {
        customer_full_name: editForm.customer_full_name,
        email: editForm.email,
        phone: editForm.phone,
        title: editForm.title,
        description: editForm.description,
        category: editForm.category,
        priority: editForm.priority,
        product_model: editForm.product_model,
        order_number: editForm.order_number,
      });

      setTicket(response.data.ticket);
      if (response.data.customer) setCustomer(response.data.customer);
      setActionMessage("Ticket and customer information saved.");
      await loadTicket();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to save ticket");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusUpdate = async () => {
    if (!ticket) return;

    setIsUpdatingStatus(true);
    setActionError("");
    setActionMessage("");

    try {
      const response = await updateTicketStatus(ticket.id, statusDraft);
      setTicket(response.data.ticket);
      const results = response.data.notifications;
      const emailText = results.email?.ok ? "email sent" : `email failed`;
      const smsText = results.sms?.ok ? "SMS sent" : `SMS failed`;
      setActionMessage(`Status updated. Notification result: ${emailText}, ${smsText}.`);
      await loadTicket();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleSyncOpenPhoneHistory = async () => {
    const syncTargets = openPhoneHistory.filter(
      (communication) =>
        communication.openphone_call_id ||
        communication.openphone_message_id ||
        communication.external_id ||
        communication.recording_url ||
        communication.transcript_text
    );

    if (syncTargets.length === 0) return;

    setIsSyncingOpenPhone(true);
    setActionError("");
    setActionMessage("");

    try {
      await Promise.all(
        syncTargets.map((communication) =>
          resyncOpenPhoneCommunication(communication.id)
        )
      );
      setActionMessage("OpenPhone history synced.");
      await loadTicket();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to sync OpenPhone history");
    } finally {
      setIsSyncingOpenPhone(false);
    }
  };

  const handleSendSms = async (
    message: string,
    composerAttachments: OutboundAttachment[]
  ) => {
    if (!ticket || !customer) {
      throw new Error("Ticket or customer is missing.");
    }

    if (!customerPhoneNumber) {
      throw new Error("Customer phone number is missing.");
    }

    await sendSms({
      ticket_id: ticket.id,
      customer_id: customer.id,
      to: customerPhoneNumber,
      message,
      attachments: composerAttachments,
    });

    await loadTicket();
  };

  const handleSendEmail = async (
    subject: string,
    message: string,
    composerAttachments: OutboundAttachment[]
  ) => {
    if (!ticket || !customer) {
      throw new Error("Ticket or customer is missing.");
    }

    if (!customerEmailAddress) {
      throw new Error("Customer email address is missing.");
    }

    await sendEmail({
      ticket_id: ticket.id,
      customer_id: customer.id,
      to: customerEmailAddress,
      subject,
      message,
      attachments: composerAttachments,
    });

    await loadTicket();
  };

  if (isLoading) {
    return <div className="page-card">Loading ticket detail...</div>;
  }

  if (error || !ticket) {
    return (
      <div className="page-card">
        <h2>Ticket not found</h2>
        <p>{error || "This ticket could not be loaded."}</p>
        <Link className="text-link" to="/tickets">
          Back to tickets
        </Link>
      </div>
    );
  }

  return (
    <section className="ticket-detail-page">
      <div className="page-header">
        <Link to="/tickets" className="text-link">
          Back to Tickets
        </Link>

        <h1>{ticket.title}</h1>
        <p>{ticket.ticket_number}</p>
      </div>

      {actionError && <div className="error-box dashboard-error">{actionError}</div>}
      {actionMessage && <div className="success-box">{actionMessage}</div>}

      <section className="ticket-info-top-grid">
        <form
          className="top-info-card edit-info-card"
          onSubmit={(event) => {
            event.preventDefault();
            handleSaveTicket();
          }}
        >
          <div className="card-header-row">
            <h3>Customer & Ticket</h3>
            <button className="secondary-button compact" type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>

          <div className="edit-form-grid">
            <label>
              <span>Customer name</span>
              <input
                className="text-input"
                value={editForm.customer_full_name}
                onChange={(event) => updateFormField("customer_full_name", event.target.value)}
              />
            </label>

            <label>
              <span>Email</span>
              <input
                className="text-input"
                type="email"
                value={editForm.email}
                onChange={(event) => updateFormField("email", event.target.value)}
              />
            </label>

            <label>
              <span>Phone</span>
              <input
                className="text-input"
                value={editForm.phone}
                onChange={(event) => updateFormField("phone", event.target.value)}
                placeholder="+1XXXXXXXXXX"
              />
            </label>

            <label>
              <span>Title</span>
              <input
                className="text-input"
                value={editForm.title}
                onChange={(event) => updateFormField("title", event.target.value)}
              />
            </label>

            <label className="full-span-field">
              <span>Description</span>
              <textarea
                className="text-area"
                rows={4}
                value={editForm.description}
                onChange={(event) => updateFormField("description", event.target.value)}
              />
            </label>

            <label>
              <span>Category</span>
              <select
                className="text-input"
                value={editForm.category}
                onChange={(event) => updateFormField("category", event.target.value)}
              >
                {categoryOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Priority</span>
              <select
                className="text-input"
                value={editForm.priority}
                onChange={(event) => updateFormField("priority", event.target.value)}
              >
                {priorityOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Product model</span>
              <input
                className="text-input"
                value={editForm.product_model}
                onChange={(event) => updateFormField("product_model", event.target.value)}
              />
            </label>

            <label>
              <span>Order number</span>
              <input
                className="text-input"
                value={editForm.order_number}
                onChange={(event) => updateFormField("order_number", event.target.value)}
              />
            </label>
          </div>
        </form>

        <div className="top-info-card">
          <h3>Status & Metadata</h3>

          <div className="status-update-row">
            <label>
              <span>Status</span>
              <select
                className="text-input"
                value={statusDraft}
                onChange={(event) => setStatusDraft(event.target.value)}
              >
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <button
              className="secondary-button"
              type="button"
              disabled={isUpdatingStatus || statusDraft === ticket.status}
              onClick={handleStatusUpdate}
            >
              {isUpdatingStatus ? "Updating..." : "Update Status"}
            </button>
          </div>

          <div className="info-list compact-info-list">
            <div>
              <span>Current status</span>
              <strong>{ticket.status}</strong>
            </div>

            <div>
              <span>Source</span>
              <strong>{ticket.source || "-"}</strong>
            </div>

            <div>
              <span>Created</span>
              <strong>{formatDate(ticket.created_at)}</strong>
            </div>

            <div>
              <span>Last Activity</span>
              <strong>{formatDate(ticket.last_activity_at)}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="conversation-main-grid">
        <div className="conversation-panel">
          <div className="conversation-panel-header">
            <div>
              <h3>OpenPhone History</h3>
              <span>{openPhoneHistory.length} records</span>
            </div>
            <button
              className="secondary-button compact"
              type="button"
              disabled={isSyncingOpenPhone || openPhoneHistory.length === 0}
              onClick={handleSyncOpenPhoneHistory}
            >
              {isSyncingOpenPhone ? "Syncing..." : "Sync"}
            </button>
          </div>

          <div className="conversation-panel-body">
            {openPhoneHistory.length > 0 ? (
              openPhoneHistory.map((communication) => (
                <MessageBubble
                  key={communication.id}
                  communication={communication}
                  customer={customer}
                  attachments={attachmentsByCommunication[communication.id] || []}
                />
              ))
            ) : (
              <p className="empty-state">No OpenPhone messages or calls yet.</p>
            )}
          </div>

          <SmsComposer to={customerPhoneNumber} onSend={handleSendSms} />
        </div>

        <div className="conversation-panel">
          <div className="conversation-panel-header">
            <h3>Email History</h3>
            <span>{emailHistory.length} records</span>
          </div>

          <div className="conversation-panel-body">
            {emailHistory.length > 0 ? (
              emailHistory.map((communication) => (
                <MessageBubble
                  key={communication.id}
                  communication={communication}
                  customer={customer}
                  attachments={attachmentsByCommunication[communication.id] || []}
                />
              ))
            ) : (
              <p className="empty-state">No email history yet.</p>
            )}
          </div>

          <EmailComposer
            to={customerEmailAddress}
            defaultSubject={`Re: ${ticket.title}`}
            onSend={handleSendEmail}
          />
        </div>
      </section>
    </section>
  );
};
