import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { sendEmail, sendSms } from "../api/actions";
import { getTicketById } from "../api/tickets";
import type {
  Attachment,
  Communication,
  Ticket,
  TicketCustomer,
} from "../types/ticket";

const formatDate = (value: string | null) => {
  if (!value) return "—";

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

const getDisplayName = (
  communication: Communication,
  customer: TicketCustomer | null
) => {
  if (communication.author_name) return communication.author_name;

  if (communication.author_type === "agent") {
    return "Perraro Team";
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

  return (
    <a
      href={openUrl}
      target="_blank"
      rel="noreferrer"
      className="chat-attachment file drive-attachment"
    >
      <strong>{attachment.file_name || "Attachment"}</strong>
      <span>{attachment.mime_type || attachment.file_type || "File"}</span>
      <small>Open in Google Drive</small>
    </a>
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
            {communication.direction}
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

type SmsComposerProps = {
  to: string | null | undefined;
  onSend: (message: string) => Promise<void>;
};

const SmsComposer = ({ to, onSend }: SmsComposerProps) => {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  const handleSend = async () => {
    const cleanMessage = message.trim();

    if (!cleanMessage) {
      setError("Message is required.");
      return;
    }

    if (!to) {
      setError("Customer phone number is missing.");
      return;
    }

    setIsSending(true);
    setError("");

    try {
      await onSend(cleanMessage);
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send SMS");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="chat-composer">
      <div className="composer-input-wrap">
        <button className="composer-icon-button" type="button" disabled>
          +
        </button>

        <textarea
          value={message}
          placeholder={to ? "Type SMS message..." : "No phone number available"}
          disabled={isSending || !to}
          onChange={(event) => setMessage(event.target.value)}
          rows={1}
        />

        <button
          className="composer-send-button"
          type="button"
          disabled={isSending || !to}
          onClick={handleSend}
        >
          {isSending ? "..." : "➤"}
        </button>
      </div>

      {error && <p className="composer-error">{error}</p>}
    </div>
  );
};

type EmailComposerProps = {
  to: string | null | undefined;
  defaultSubject: string;
  onSend: (subject: string, message: string) => Promise<void>;
};

const EmailComposer = ({
  to,
  defaultSubject,
  onSend,
}: EmailComposerProps) => {
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  const handleSend = async () => {
    const cleanSubject = subject.trim();
    const cleanMessage = message.trim();

    if (!to) {
      setError("Customer email address is missing.");
      return;
    }

    if (!cleanSubject) {
      setError("Subject is required.");
      return;
    }

    if (!cleanMessage) {
      setError("Email message is required.");
      return;
    }

    setIsSending(true);
    setError("");

    try {
      await onSend(cleanSubject, cleanMessage);
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="chat-composer email-composer">
      <input
        value={subject}
        placeholder="Email subject"
        disabled={isSending || !to}
        onChange={(event) => setSubject(event.target.value)}
      />

      <div className="composer-input-wrap">
        <textarea
          value={message}
          placeholder={to ? "Type email reply..." : "No email address available"}
          disabled={isSending || !to}
          onChange={(event) => setMessage(event.target.value)}
          rows={2}
        />

        <button
          className="composer-send-button"
          type="button"
          disabled={isSending || !to}
          onClick={handleSend}
        >
          {isSending ? "..." : "➤"}
        </button>
      </div>

      {error && <p className="composer-error">{error}</p>}
    </div>
  );
};

export const TicketDetailPage = () => {
  const { id } = useParams();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [customer, setCustomer] = useState<TicketCustomer | null>(null);
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

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
    return communications.filter(isOpenPhoneCommunication);
  }, [communications]);

  const emailHistory = useMemo(() => {
    return communications.filter(isEmailCommunication);
  }, [communications]);

  const customerPhoneNumber =
    customer?.phone_primary_normalized ||
    customer?.phone_primary ||
    customer?.phone_secondary_normalized ||
    customer?.phone_secondary;

  const customerEmailAddress = customer?.email_primary || customer?.email_secondary;

  const handleSendSms = async (message: string) => {
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
    });

    await loadTicket();
  };

  const handleSendEmail = async (subject: string, message: string) => {
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
          ← Back to Tickets
        </Link>

        <h1>{ticket.title}</h1>
        <p>{ticket.ticket_number}</p>
      </div>

      <section className="ticket-info-top-grid">
        <div className="top-info-card">
          <h3>Customer Info</h3>

          <div className="info-list">
            <div>
              <span>Name</span>
              <strong>{customer?.full_name || "Unknown Customer"}</strong>
            </div>

            <div>
              <span>Email</span>
              <strong>{customerEmailAddress || "—"}</strong>
            </div>

            <div>
              <span>Phone</span>
              <strong>{customerPhoneNumber || "—"}</strong>
            </div>

            <div>
              <span>Source</span>
              <strong>{customer?.source || "—"}</strong>
            </div>
          </div>
        </div>

        <div className="top-info-card">
          <h3>Ticket Info</h3>

          <div className="info-list">
            <div>
              <span>Status</span>
              <strong>{ticket.status}</strong>
            </div>

            <div>
              <span>Priority</span>
              <strong>{ticket.priority}</strong>
            </div>

            <div>
              <span>Category</span>
              <strong>{ticket.category || "—"}</strong>
            </div>

            <div>
              <span>Source</span>
              <strong>{ticket.source || "—"}</strong>
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
            <h3>OpenPhone History</h3>
            <span>{openPhoneHistory.length} records</span>
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