import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { sendEmail, sendSms } from "../api/actions";
import type { OutboundAttachment } from "../api/actions";
import { getCustomerById } from "../api/customers";
import { updateCustomer } from "../api/customers";
import { EmailComposer, SmsComposer } from "../components/MessageComposers";
import type {
  CustomerAttachment,
  CustomerCommunication,
  CustomerDetail,
  CustomerTicket,
} from "../types/customer";

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

const displayText = (value: string | null | undefined) => {
  return value && value.trim().length > 0 ? value : "-";
};

const getAttachmentOpenUrl = (attachment: CustomerAttachment) => {
  return attachment.file_url || "#";
};

const isOpenPhoneCommunication = (communication: CustomerCommunication) => {
  return (
    communication.channel.includes("openphone") ||
    communication.channel === "sms" ||
    communication.channel === "mms" ||
    communication.channel === "call" ||
    communication.channel === "voicemail"
  );
};

const isEmailCommunication = (communication: CustomerCommunication) => {
  return communication.channel === "email";
};

type ChatAttachmentProps = {
  attachment: CustomerAttachment;
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
      <small>{attachment.file_url ? "Open file" : "Stored with message"}</small>
    </a>
  );
};

type MessageBubbleProps = {
  communication: CustomerCommunication;
  customer: CustomerDetail["customer"];
  attachments: CustomerAttachment[];
};

const MessageBubble = ({ communication, customer, attachments }: MessageBubbleProps) => {
  const isOutgoing = communication.direction === "outgoing";

  const displayName = (() => {
    if (communication.author_name) return communication.author_name;
    if (communication.author_type === "agent") return "Support Team";
    return customer.full_name || "Unknown Customer";
  })();

  return (
    <div className={`message-row ${isOutgoing ? "outgoing" : "incoming"}`}>
      <article className="message-bubble">
        <div className="message-meta">
          <strong>{displayName}</strong>
          <span>{formatDate(communication.occurred_at || communication.created_at)}</span>
        </div>

        <div className="message-tags">
          <span className={`message-tag ${isOutgoing ? "outgoing" : "incoming"}`}>
            {communication.direction || "unknown"}
          </span>
          <span className="message-tag neutral">{communication.channel}</span>
        </div>

        {communication.subject && <h4 className="message-subject">{communication.subject}</h4>}
        {communication.summary && <p className="message-summary">{communication.summary}</p>}
        {communication.message_body && <p className="message-body">{communication.message_body}</p>}

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

const TicketRow = ({ ticket, onOpen }: { ticket: CustomerTicket; onOpen: () => void }) => {
  return (
    <tr className="clickable-row" onClick={onOpen}>
      <td>
        <strong>{ticket.ticket_number}</strong>
      </td>
      <td>
        <div className="ticket-title-cell">
          <strong>{ticket.title}</strong>
          <span>{ticket.description || "No description"}</span>
        </div>
      </td>
      <td>{ticket.status}</td>
      <td>{ticket.priority}</td>
      <td>{ticket.source || "-"}</td>
      <td>{formatDate(ticket.created_at)}</td>
    </tr>
  );
};

export const CustomerDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [draftFullName, setDraftFullName] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [draftPhone, setDraftPhone] = useState("");
  const [draftNotes, setDraftNotes] = useState("");

  const loadCustomer = async () => {
    if (!id) return;

    setIsLoading(true);
    setError("");

    try {
      const response = await getCustomerById(id);
      setDetail(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load customer");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCustomer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const customer = detail?.customer || null;
  const tickets = detail?.tickets || [];
  const communications = detail?.communications || [];
  const attachments = detail?.attachments || [];

  const customerEmailAddress =
    customer?.email_primary || customer?.email_secondary || "";
  const customerPhoneNumber =
    customer?.phone_primary_normalized ||
    customer?.phone_primary ||
    customer?.phone_secondary_normalized ||
    customer?.phone_secondary ||
    "";

  useEffect(() => {
    if (!customer) return;
    setDraftFullName(customer.full_name || "");
    setDraftEmail(customer.email_primary || customer.email_secondary || "");
    setDraftPhone(
      customer.phone_primary_normalized ||
        customer.phone_primary ||
        customer.phone_secondary_normalized ||
        customer.phone_secondary ||
        ""
    );
    setDraftNotes(customer.customer_notes || "");
  }, [customer]);

  const attachmentsByCommunication = useMemo(() => {
    const map: Record<string, CustomerAttachment[]> = {};
    for (const attachment of attachments) {
      if (!attachment.communication_id) continue;
      if (!map[attachment.communication_id]) map[attachment.communication_id] = [];
      map[attachment.communication_id].push(attachment);
    }
    return map;
  }, [attachments]);

  const openPhoneHistory = useMemo(
    () => communications.filter(isOpenPhoneCommunication),
    [communications]
  );
  const emailHistory = useMemo(
    () => communications.filter(isEmailCommunication),
    [communications]
  );

  const handleSendSms = async (
    message: string,
    composerAttachments: OutboundAttachment[]
  ) => {
    if (!customer) throw new Error("Customer is missing.");
    if (!customerPhoneNumber) throw new Error("Customer phone number is missing.");

    await sendSms({
      customer_id: customer.id,
      to: customerPhoneNumber,
      message,
      attachments: composerAttachments,
    });

    await loadCustomer();
  };

  const handleSendEmail = async (
    subject: string,
    message: string,
    composerAttachments: OutboundAttachment[]
  ) => {
    if (!customer) throw new Error("Customer is missing.");
    if (!customerEmailAddress) throw new Error("Customer email address is missing.");

    await sendEmail({
      customer_id: customer.id,
      to: customerEmailAddress,
      subject,
      message,
      attachments: composerAttachments,
    });

    await loadCustomer();
  };

  const handleSaveCustomer = async () => {
    if (!customer) return;

    setIsSaving(true);
    setEditError("");

    try {
      await updateCustomer(customer.id, {
        full_name: draftFullName,
        email_primary: draftEmail,
        phone_primary: draftPhone,
        customer_notes: draftNotes,
      });
      setIsEditing(false);
      await loadCustomer();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update customer");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="page-card">Loading customer...</div>;
  }

  if (error || !detail || !customer) {
    return (
      <div className="page-card">
        <h2>Customer not found</h2>
        <p>{error || "This customer could not be loaded."}</p>
        <Link className="text-link" to="/customers">
          Back to customers
        </Link>
      </div>
    );
  }

  return (
    <section className="ticket-detail-page">
      <div className="page-header">
        <Link to="/customers" className="text-link">
          Back to Customers
        </Link>

        <h1>{customer.full_name || "Customer"}</h1>
        <p>{displayText(customer.source)}</p>
      </div>

      <section className="ticket-info-top-grid">
        <div className="top-info-card">
          <div className="card-header-row">
            <h3>Customer Info</h3>
            <button
              type="button"
              className="secondary-button compact"
              onClick={() => {
                setEditError("");
                setIsEditing((prev) => !prev);
              }}
            >
              {isEditing ? "Cancel" : "Edit"}
            </button>
          </div>

          {editError && <p className="error-inline">{editError}</p>}

          <div className="info-list">
            <div>
              <span>Name</span>
              {isEditing ? (
                <input
                  className="text-input"
                  value={draftFullName}
                  onChange={(event) => setDraftFullName(event.target.value)}
                  placeholder="Full name"
                />
              ) : (
                <strong>{displayText(customer.full_name)}</strong>
              )}
            </div>

            <div>
              <span>Email</span>
              {isEditing ? (
                <input
                  className="text-input"
                  value={draftEmail}
                  onChange={(event) => setDraftEmail(event.target.value)}
                  placeholder="Email address"
                />
              ) : (
                <strong>{displayText(customerEmailAddress)}</strong>
              )}
            </div>

            <div>
              <span>Phone</span>
              {isEditing ? (
                <input
                  className="text-input"
                  value={draftPhone}
                  onChange={(event) => setDraftPhone(event.target.value)}
                  placeholder="Phone number"
                />
              ) : (
                <strong>{displayText(customerPhoneNumber)}</strong>
              )}
            </div>

            <div>
              <span>Created</span>
              <strong>{formatDate(customer.created_at)}</strong>
            </div>
          </div>

          {isEditing && (
            <div className="customer-notes-editor">
              <label>Notes</label>
              <textarea
                className="text-area"
                value={draftNotes}
                onChange={(event) => setDraftNotes(event.target.value)}
                placeholder="Customer notes..."
                rows={4}
              />

              <div className="editor-actions">
                <button
                  type="button"
                  className="primary-action-button"
                  onClick={handleSaveCustomer}
                  disabled={isSaving}
                >
                  {isSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="top-info-card">
          <h3>Tickets</h3>
          <div className="info-list">
            <div>
              <span>Total</span>
              <strong>{tickets.length}</strong>
            </div>
            <div>
              <span>Last Updated</span>
              <strong>{formatDate(customer.updated_at)}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="table-card">
        <div className="table-toolbar">
          <div>
            <strong>Customer Tickets</strong>
            <span>{tickets.length} tickets</span>
          </div>
        </div>

        {tickets.length === 0 ? (
          <div className="empty-state">No tickets for this customer yet.</div>
        ) : (
          <div className="ticket-table-wrap">
            <table className="ticket-table">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Source</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <TicketRow
                    key={ticket.id}
                    ticket={ticket}
                    onOpen={() => navigate(`/tickets/${ticket.id}`)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
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
            defaultSubject={`Support Desk`}
            onSend={handleSendEmail}
          />
        </div>
      </section>
    </section>
  );
};
