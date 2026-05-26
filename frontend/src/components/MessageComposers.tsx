import { useRef, useState } from "react";
import type { OutboundAttachment } from "../api/actions";

const maxAttachmentBytes = 10 * 1024 * 1024;

const readFileAsBase64 = (file: File) => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };

    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
};

const fileToAttachment = async (file: File): Promise<OutboundAttachment> => {
  if (file.size > maxAttachmentBytes) {
    throw new Error(`${file.name} is larger than 10MB.`);
  }

  return {
    file_name: file.name,
    mime_type: file.type || "application/octet-stream",
    size_bytes: file.size,
    data_base64: await readFileAsBase64(file),
  };
};

type AttachmentPickerProps = {
  attachments: OutboundAttachment[];
  isDisabled: boolean;
  onAddAttachments: (attachments: OutboundAttachment[]) => void;
  onRemoveAttachment: (index: number) => void;
  onError: (message: string) => void;
};

const AttachmentPicker = ({
  attachments,
  isDisabled,
  onAddAttachments,
  onRemoveAttachment,
  onError,
}: AttachmentPickerProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;

    try {
      const nextAttachments = await Promise.all(
        Array.from(files).map(fileToAttachment)
      );

      onAddAttachments(nextAttachments);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to attach file");
    } finally {
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  return (
    <>
      <button
        className="composer-icon-button"
        type="button"
        disabled={isDisabled}
        onClick={() => inputRef.current?.click()}
      >
        +
      </button>

      <input
        ref={inputRef}
        className="hidden-file-input"
        type="file"
        multiple
        onChange={(event) => handleFiles(event.target.files)}
      />

      {attachments.length > 0 && (
        <div className="composer-attachments">
          {attachments.map((attachment, index) => (
            <button
              key={`${attachment.file_name}-${index}`}
              className="composer-attachment-chip"
              type="button"
              onClick={() => onRemoveAttachment(index)}
            >
              <span>{attachment.file_name}</span>
              <small>{Math.ceil((attachment.size_bytes || 0) / 1024)} KB</small>
            </button>
          ))}
        </div>
      )}
    </>
  );
};

type SmsComposerProps = {
  to: string | null | undefined;
  onSend: (message: string, attachments: OutboundAttachment[]) => Promise<void>;
};

export const SmsComposer = ({ to, onSend }: SmsComposerProps) => {
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<OutboundAttachment[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  const removeAttachment = (index: number) => {
    setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleSend = async () => {
    const cleanMessage = message.trim();

    if (!cleanMessage && attachments.length === 0) {
      setError("Message or attachment is required.");
      return;
    }

    if (!to) {
      setError("Customer phone number is missing.");
      return;
    }

    setIsSending(true);
    setError("");

    try {
      await onSend(cleanMessage, attachments);
      setMessage("");
      setAttachments([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send SMS");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="chat-composer record-composer">
      <div className="composer-input-wrap">
        <AttachmentPicker
          attachments={attachments}
          isDisabled={isSending || !to}
          onAddAttachments={(nextAttachments) =>
            setAttachments((current) => [...current, ...nextAttachments])
          }
          onRemoveAttachment={removeAttachment}
          onError={setError}
        />

        <button className="composer-icon-button" type="button" disabled>
          :)
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
          {isSending ? "..." : ">"}
        </button>
      </div>

      {error && <p className="composer-error">{error}</p>}
    </div>
  );
};

type EmailComposerProps = {
  to: string | null | undefined;
  defaultSubject: string;
  onSend: (
    subject: string,
    message: string,
    attachments: OutboundAttachment[]
  ) => Promise<void>;
};

export const EmailComposer = ({
  to,
  defaultSubject,
  onSend,
}: EmailComposerProps) => {
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<OutboundAttachment[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  const removeAttachment = (index: number) => {
    setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

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

    if (!cleanMessage && attachments.length === 0) {
      setError("Email message or attachment is required.");
      return;
    }

    setIsSending(true);
    setError("");

    try {
      await onSend(cleanSubject, cleanMessage, attachments);
      setMessage("");
      setAttachments([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="chat-composer email-composer record-composer">
      <input
        value={subject}
        placeholder="Email subject"
        disabled={isSending || !to}
        onChange={(event) => setSubject(event.target.value)}
      />

      <div className="composer-input-wrap">
        <AttachmentPicker
          attachments={attachments}
          isDisabled={isSending || !to}
          onAddAttachments={(nextAttachments) =>
            setAttachments((current) => [...current, ...nextAttachments])
          }
          onRemoveAttachment={removeAttachment}
          onError={setError}
        />

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
          {isSending ? "..." : ">"}
        </button>
      </div>

      {error && <p className="composer-error">{error}</p>}
    </div>
  );
};
