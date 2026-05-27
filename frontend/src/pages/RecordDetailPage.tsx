import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { sendEmail, sendSms } from "../api/actions";
import type { OutboundAttachment } from "../api/actions";
import { EmailComposer, SmsComposer } from "../components/MessageComposers";
import {
  addRecordToTicket,
  getEmailRecordById,
  getOpenPhoneRecordById,
  resyncOpenPhoneCommunication,
} from "../api/records";
import type {
  CommunicationRecord,
  RecordAttachment,
  RecordCustomer,
} from "../types/record";

type RecordMode = "email" | "openphone";

type RecordDetailPageProps = {
  mode: RecordMode;
};

const openPhoneChannels = [
  "openphone_sms",
  "openphone_call",
  "openphone_mms",
  "sms",
  "mms",
  "call",
  "voicemail",
];

const technicianPhoneSuffix = "8003";

const modeConfig = {
  email: {
    backPath: "/email-records",
    backLabel: "Back to Email Records",
    heading: "Email Record",
    historyTitle: "Email History",
    emptyHistory: "No email history found for this customer.",
    ticketSourceLabel: "Email record",
  },
  openphone: {
    backPath: "/openphone-records",
    backLabel: "Back to OpenPhone Records",
    heading: "OpenPhone Record",
    historyTitle: "OpenPhone History",
    emptyHistory: "No OpenPhone messages or calls found for this customer.",
    ticketSourceLabel: "OpenPhone record",
  },
};

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

const getDisplayName = (
  communication: CommunicationRecord,
  customer: RecordCustomer | null
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

const getAttachmentOpenUrl = (attachment: RecordAttachment) => {
  return attachment.file_url || "#";
};

const isDriveLink = (url: string | null) => {
  if (!url) return false;
  return url.includes("drive.google.com");
};

const isModeCommunication = (
  communication: CommunicationRecord,
  mode: RecordMode
) => {
  if (mode === "email") {
    return communication.channel === "email";
  }

  return openPhoneChannels.includes(communication.channel);
};

const getRecordTitle = (record: CommunicationRecord | null, mode: RecordMode) => {
  if (!record) return modeConfig[mode].heading;

  return (
    record.subject ||
    record.summary ||
    record.message_body?.slice(0, 80) ||
    record.call_type ||
    modeConfig[mode].heading
  );
};

const communicationMatchesSearch = (
  communication: CommunicationRecord,
  query: string
) => {
  if (!query) return true;

  const text = [
    communication.author_name,
    communication.email_address,
    communication.phone_number,
    communication.phone_number_normalized,
    communication.subject,
    communication.summary,
    communication.message_body,
    communication.transcript_text,
    communication.channel,
    communication.direction,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return text.includes(query.toLowerCase());
};

type TranscriptTurn = {
  id: string;
  speaker: string;
  label: string;
  text: string;
  isTechnician: boolean;
};

const isTechnicianSpeaker = (speaker: string) => {
  const digits = speaker.replace(/\D/g, "");

  return digits.endsWith(technicianPhoneSuffix);
};

const getTranscriptTurns = (
  transcriptText: string,
  customer: RecordCustomer | null
) => {
  const turns: TranscriptTurn[] = [];

  transcriptText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const match = line.match(/^([^:]{1,90}):\s*(.*)$/);
      const speaker = match?.[1]?.trim() || "";
      const text = match?.[2]?.trim() || line;
      const isTechnician = isTechnicianSpeaker(speaker);
      const label = isTechnician
        ? "Technician"
        : customer?.full_name || "Customer";
      const previous = turns[turns.length - 1];

      if (previous && previous.speaker === speaker) {
        previous.text = `${previous.text}\n${text}`;
        return;
      }

      turns.push({
        id: `${turns.length}-${speaker || "unknown"}`,
        speaker,
        label,
        text,
        isTechnician,
      });
    });

  return turns;
};

type TranscriptChatProps = {
  transcriptText: string;
  customer: RecordCustomer | null;
};

const TranscriptChat = ({ transcriptText, customer }: TranscriptChatProps) => {
  const turns = getTranscriptTurns(transcriptText, customer);

  return (
    <section className="transcript-chat">
      {turns.map((turn) => (
        <div
          key={turn.id}
          className={`transcript-turn-row ${
            turn.isTechnician ? "technician" : "customer"
          }`}
        >
          <article className="transcript-turn">
            <div className="transcript-turn-meta">
              <strong>{turn.label}</strong>
              {turn.speaker && <span>{turn.speaker}</span>}
            </div>

            <p>{turn.text}</p>
          </article>
        </div>
      ))}
    </section>
  );
};

const TranscriptTextBlock = ({
  transcriptText,
}: {
  transcriptText: string;
}) => {
  const lines = transcriptText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className="transcript-text-block">
      {lines.map((line, index) => (
        <p key={`${index}-${line.slice(0, 16)}`} className="transcript-line">
          {line}
        </p>
      ))}
    </div>
  );
};

type ChatAttachmentProps = {
  attachment: RecordAttachment;
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
        <a href={openUrl} target="_blank" rel="noreferrer" className="text-link">
          Open file
        </a>
      )}
    </div>
  );
};

type MessageBubbleProps = {
  communication: CommunicationRecord;
  customer: RecordCustomer | null;
  attachments: RecordAttachment[];
  mode: RecordMode;
};

const MessageBubble = ({
  communication,
  customer,
  attachments,
  mode,
}: MessageBubbleProps) => {
  const isOutgoing = communication.direction === "outgoing";
  const summary = communication.summary?.trim();
  const messageBody = communication.message_body?.trim();
  const transcriptText = communication.transcript_text?.trim();
  const hasTextContent = Boolean(summary || messageBody || transcriptText);
  const isOpenPhoneCall =
    mode === "openphone" &&
    (communication.channel.includes("call") ||
      communication.message_type === "call" ||
      communication.call_type);

  return (
    <div className={`message-row ${isOutgoing ? "outgoing" : "incoming"}`}>
      <article
        className={`message-bubble ${
          mode === "openphone" && transcriptText ? "transcript-message-bubble" : ""
        }`}
      >
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

        {summary && (
          <p className="message-summary">{summary}</p>
        )}

        {messageBody && (
          <p className="message-body">{messageBody}</p>
        )}

        {mode === "openphone" && transcriptText && (
          <details className="message-details">
            <summary>View transcript</summary>
            {isOpenPhoneCall ? (
              <TranscriptTextBlock transcriptText={transcriptText} />
            ) : (
              <TranscriptChat transcriptText={transcriptText} customer={customer} />
            )}
          </details>
        )}

        {mode !== "openphone" && transcriptText && (
          <details className="message-details">
            <summary>View transcript</summary>
            <p className="message-body">{transcriptText}</p>
          </details>
        )}

        {!hasTextContent && isOpenPhoneCall && (
          <p className="message-empty-note">
            Transcript has not synced for this call yet.
          </p>
        )}

        {communication.recording_url && (
          <audio className="message-audio" controls src={communication.recording_url}>
            Your browser does not support audio playback.
          </audio>
        )}

        {communication.transcript_url && !transcriptText && (
          <a
            className="text-link transcript-link"
            href={communication.transcript_url}
            target="_blank"
            rel="noreferrer"
          >
            Open transcript
          </a>
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

export const RecordDetailPage = ({ mode }: RecordDetailPageProps) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const config = modeConfig[mode];

  const [record, setRecord] = useState<CommunicationRecord | null>(null);
  const [customer, setCustomer] = useState<RecordCustomer | null>(null);
  const [communications, setCommunications] = useState<CommunicationRecord[]>([]);
  const [attachments, setAttachments] = useState<RecordAttachment[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingToTicket, setIsAddingToTicket] = useState(false);
  const [isResyncing, setIsResyncing] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");

  const loadRecord = async () => {
    if (!id) return;

    setIsLoading(true);
    setError("");
    setActionError("");

    try {
      const response =
        mode === "email"
          ? await getEmailRecordById(id)
          : await getOpenPhoneRecordById(id);

      setRecord(response.data.record);
      setCustomer(response.data.customer);
      setCommunications(response.data.communications || []);
      setAttachments(response.data.attachments || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load record");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRecord();
  }, [id, mode]);

  const attachmentsByCommunication = useMemo(() => {
    return attachments.reduce<Record<string, RecordAttachment[]>>(
      (acc, attachment) => {
        if (!attachment.communication_id) return acc;

        if (!acc[attachment.communication_id]) {
          acc[attachment.communication_id] = [];
        }

        acc[attachment.communication_id].push(attachment);
        return acc;
      },
      {}
    );
  }, [attachments]);

  const channelHistory = useMemo(() => {
    return communications
      .filter((communication) => isModeCommunication(communication, mode))
      .filter((communication) =>
        communicationMatchesSearch(communication, searchQuery.trim())
      );
  }, [communications, mode, searchQuery]);

  const customerPhoneNumber =
    customer?.phone_primary_normalized ||
    customer?.phone_primary ||
    customer?.phone_secondary_normalized ||
    customer?.phone_secondary ||
    record?.phone_number_normalized ||
    record?.phone_number;

  const customerEmailAddress =
    customer?.email_primary ||
    customer?.email_secondary ||
    record?.email_address;

  const handleAddToTicket = async () => {
    if (!record) return;

    setIsAddingToTicket(true);
    setActionError("");

    try {
      const response = await addRecordToTicket(record.id);
      navigate(`/tickets/${response.data.ticket.id}`);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to create ticket"
      );
    } finally {
      setIsAddingToTicket(false);
    }
  };

  const handleResyncOpenPhone = async () => {
    if (!record) return;
    setIsResyncing(true);
    setActionError("");
    try {
      await resyncOpenPhoneCommunication(record.id);
      await loadRecord();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to resync OpenPhone data");
    } finally {
      setIsResyncing(false);
    }
  };

  const handleSendSms = async (
    message: string,
    attachments: OutboundAttachment[]
  ) => {
    if (!record) {
      throw new Error("Record is missing.");
    }

    if (!customerPhoneNumber) {
      throw new Error("Customer phone number is missing.");
    }

    await sendSms({
      ticket_id: record.ticket_id || undefined,
      customer_id: record.customer_id || undefined,
      to: customerPhoneNumber,
      message,
      attachments,
    });

    await loadRecord();
  };

  const handleSendEmail = async (
    subject: string,
    message: string,
    attachments: OutboundAttachment[]
  ) => {
    if (!record) {
      throw new Error("Record is missing.");
    }

    if (!customerEmailAddress) {
      throw new Error("Customer email address is missing.");
    }

    await sendEmail({
      ticket_id: record.ticket_id || undefined,
      customer_id: record.customer_id || undefined,
      to: customerEmailAddress,
      subject,
      message,
      attachments,
    });

    await loadRecord();
  };

  if (isLoading) {
    return <div className="page-card">Loading {config.heading.toLowerCase()}...</div>;
  }

  if (error || !record) {
    return (
      <div className="page-card">
        <h2>{config.heading} not found</h2>
        <p>{error || "This record could not be loaded."}</p>
        <Link className="text-link" to={config.backPath}>
          {config.backLabel}
        </Link>
      </div>
    );
  }

  return (
    <section className="ticket-detail-page">
      <div className="ticket-detail-header">
        <div>
          <Link to={config.backPath} className="text-link">
            {config.backLabel}
          </Link>

          <h2>{getRecordTitle(record, mode)}</h2>
          <p>
            {config.ticketSourceLabel} / {formatDate(record.created_at)}
          </p>
        </div>

        <div className="ticket-header-actions">
          {record.ticket_id ? (
            <Link className="primary-link-button" to={`/tickets/${record.ticket_id}`}>
              View Ticket
            </Link>
          ) : (
            <button
              className="primary-action-button"
              type="button"
              disabled={isAddingToTicket}
              onClick={handleAddToTicket}
            >
              {isAddingToTicket ? "Creating..." : "Add to Tickets"}
            </button>
          )}

          {mode === "openphone" && (
            <button
              className="secondary-button"
              type="button"
              disabled={isResyncing}
              onClick={handleResyncOpenPhone}
            >
              {isResyncing ? "Syncing..." : "Sync OpenPhone"}
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="error-box dashboard-error">
          {actionError}
          <button onClick={handleAddToTicket} disabled={isAddingToTicket}>
            Retry
          </button>
        </div>
      )}

      <section className="ticket-info-top-grid">
        <div className="top-info-card">
          <h3>Customer Info</h3>

          <div className="info-list">
            <div>
              <span>Name</span>
              <strong>{customer?.full_name || record.author_name || "Unknown"}</strong>
            </div>

            <div>
              <span>Email</span>
              <strong>{customerEmailAddress || "-"}</strong>
            </div>

            <div>
              <span>Phone</span>
              <strong>{customerPhoneNumber || "-"}</strong>
            </div>

            <div>
              <span>Source</span>
              <strong>{customer?.source || "-"}</strong>
            </div>
          </div>
        </div>

        <div className="top-info-card">
          <h3>Record Info</h3>

          <div className="info-list">
            <div>
              <span>Status</span>
              <strong>{record.ticket_id ? "Ticket Created" : "Record Only"}</strong>
            </div>

            <div>
              <span>Channel</span>
              <strong>{record.channel}</strong>
            </div>

            <div>
              <span>Direction</span>
              <strong>{record.direction || "-"}</strong>
            </div>

            <div>
              <span>External ID</span>
              <strong>{record.external_id || "-"}</strong>
            </div>

            <div>
              <span>Occurred</span>
              <strong>{formatDate(record.occurred_at)}</strong>
            </div>

            <div>
              <span>Created</span>
              <strong>{formatDate(record.created_at)}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="conversation-main-grid record-conversation-grid">
        <div className="conversation-panel">
          <div className="conversation-panel-header record-panel-header">
            <div>
              <h3>{config.historyTitle}</h3>
              <span>{channelHistory.length} records</span>
            </div>

            <input
              className="search-input compact-search"
              value={searchQuery}
              placeholder="Search conversation..."
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>

          <div className="conversation-panel-body">
            {channelHistory.length > 0 ? (
              channelHistory.map((communication) => (
                <MessageBubble
                  key={communication.id}
                  communication={communication}
                  customer={customer}
                  attachments={attachmentsByCommunication[communication.id] || []}
                  mode={mode}
                />
              ))
            ) : (
              <p className="empty-state">{config.emptyHistory}</p>
            )}
          </div>

          {mode === "openphone" ? (
            <SmsComposer to={customerPhoneNumber} onSend={handleSendSms} />
          ) : (
            <EmailComposer
              to={customerEmailAddress}
              defaultSubject={`Re: ${getRecordTitle(record, mode)}`}
              onSend={handleSendEmail}
            />
          )}
        </div>
      </section>
    </section>
  );
};
