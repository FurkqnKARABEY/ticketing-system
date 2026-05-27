import { Router } from "express";
import { randomUUID } from "crypto";
import { supabase } from "../config/supabase";
import { isValidUuid } from "../utils/validation";

const router = Router();

const maxInboundAttachmentBytes = 25 * 1024 * 1024;

const sanitizeFileName = (value: string) => {
  const cleanName = value.replace(/[^\w.\- ]/g, "_").trim();
  return cleanName || "attachment";
};

const guessExtension = (mimeType: string) => {
  const map: Record<string, string> = {
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "video/mp4": "mp4",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "application/pdf": "pdf",
  };

  return map[mimeType] || "bin";
};

const fetchBinary = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Failed to download attachment (${response.status}): ${text.slice(0, 140)}`
    );
  }

  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) {
    throw new Error("Attachment download returned empty file");
  }
  if (bytes.length > maxInboundAttachmentBytes) {
    throw new Error("Attachment is too large. Maximum size is 25MB.");
  }

  return { bytes, contentType };
};

const uploadToSupabase = async ({
  bytes,
  contentType,
  fileName,
  prefix,
}: {
  bytes: Buffer;
  contentType: string;
  fileName: string;
  prefix: string;
}) => {
  const bucket = process.env.SUPABASE_ATTACHMENTS_BUCKET || "attachments";
  const storagePath = `${prefix}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${sanitizeFileName(
    fileName
  )}`;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, bytes, {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Failed to upload attachment: ${uploadError.message}`);
  }

  const { data: signedUrlData, error: signedError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, 60 * 60 * 24 * 30);

  if (signedError) {
    throw new Error(`Failed to sign attachment URL: ${signedError.message}`);
  }

  return {
    fileUrl: signedUrlData?.signedUrl || null,
    storageBucket: bucket,
    storagePath,
  };
};

const openPhoneRequest = async <T>(path: string) => {
  const apiKey = process.env.OPENPHONE_API_KEY;
  if (!apiKey) {
    throw new Error("OpenPhone API key is missing");
  }

  const url = `https://api.openphone.com/v1${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetch(url, {
    headers: {
      Authorization: apiKey,
    },
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message || `OpenPhone request failed (${response.status})`);
  }

  return body as T;
};

const extractMessageAttachments = (payload: any) => {
  const object = payload?.data?.object || payload?.data || payload || {};
  const possible =
    object.attachments ||
    object.media ||
    object.files ||
    object.images ||
    object.data?.attachments ||
    [];

  if (Array.isArray(possible)) return possible;
  if (possible && typeof possible === "object") return [possible];
  return [];
};

router.post("/communications/:id/resync", async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidUuid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid communication ID format",
      });
    }

    const { data: communication, error } = await supabase
      .from("communications")
      .select(
        `
        id,
        ticket_id,
        customer_id,
        channel,
        direction,
        phone_number,
        phone_number_normalized,
        openphone_call_id,
        openphone_message_id,
        external_id,
        raw_payload,
        transcript_text,
        recording_url,
        summary
      `
      )
      .eq("id", id)
      .single();

    if (error || !communication) {
      return res.status(404).json({
        success: false,
        message: "Communication not found",
      });
    }

    const updates: Record<string, unknown> = {};
    const createdAttachments: any[] = [];

    // Calls: recordings + transcript + summary + voicemail
    if (
      communication.channel === "openphone_call" ||
      communication.channel === "call" ||
      communication.openphone_call_id
    ) {
      const callId = communication.openphone_call_id || communication.external_id;
      if (typeof callId === "string" && callId.trim().length > 0) {
        // recordings
        type RecordingsResponse = {
          data: Array<{
            id: string;
            url: string;
            type: string;
            duration: number;
            status: string;
          }>;
        };
        const recordings = await openPhoneRequest<RecordingsResponse>(
          `/call-recordings/${callId}`
        );

        const firstRecording = recordings?.data?.find((r) => r?.url) || null;
        if (firstRecording?.url) {
          const { bytes, contentType } = await fetchBinary(firstRecording.url);
          const fileName = `call-recording-${callId}.${guessExtension(contentType)}`;
          const stored = await uploadToSupabase({
            bytes,
            contentType,
            fileName,
            prefix: `inbound/openphone/calls/${callId}`,
          });

          updates.recording_url = stored.fileUrl;

          const attachmentRow = {
            communication_id: communication.id,
            ticket_id: communication.ticket_id,
            customer_id: communication.customer_id,
            file_type: contentType,
            file_name: fileName,
            file_url: stored.fileUrl,
            source: "openphone",
            storage_bucket: stored.storageBucket,
            storage_path: stored.storagePath,
            mime_type: contentType,
            size_bytes: bytes.length,
            external_id: firstRecording.id || callId,
            communication_channel: communication.channel,
          };

          const { data } = await supabase
            .from("attachments")
            .insert(attachmentRow)
            .select()
            .single();
          if (data) createdAttachments.push(data);
        }

        // transcript
        type TranscriptResponse = {
          data: {
            callId: string;
            dialogue: Array<{
              content: string;
              start: number;
              end: number;
              identifier: string;
              userId?: string;
            }>;
          };
        };
        try {
          const transcript = await openPhoneRequest<TranscriptResponse>(
            `/call-transcripts/${callId}`
          );
          const dialogue = transcript?.data?.dialogue || [];
          if (dialogue.length > 0) {
            updates.transcript_text = dialogue
              .map((turn) => `${turn.identifier}: ${turn.content}`)
              .join("\n");
          }
        } catch {
          // Transcript may not be ready yet; ignore.
        }

        // summary
        type SummaryResponse = {
          data?: {
            status?: string;
            summary?: string[] | string;
          };
          summary?: string[] | string;
        };
        try {
          const summary = await openPhoneRequest<SummaryResponse>(
            `/call-summaries/${callId}`
          );
          const summaryText =
            (Array.isArray(summary?.data?.summary)
              ? summary.data.summary.join("\n")
              : summary?.data?.summary) ||
            (Array.isArray(summary?.summary) ? summary.summary.join("\n") : summary?.summary) ||
            null;
          if (summaryText && typeof summaryText === "string") {
            updates.summary = summaryText;
          }
        } catch {
          // ignore
        }

        // voicemail (optional)
        type VoicemailResponse = {
          data?: {
            id?: string;
            status?: string;
            transcript?: string;
            recordingUrl?: string;
            duration?: number;
          };
        };
        try {
          const voicemail = await openPhoneRequest<VoicemailResponse>(
            `/call-voicemails/${callId}`
          );
          const url = voicemail?.data?.recordingUrl || null;
          if (url) {
            const { bytes, contentType } = await fetchBinary(url);
            const fileName = `voicemail-${callId}.${guessExtension(contentType)}`;
            const stored = await uploadToSupabase({
              bytes,
              contentType,
              fileName,
              prefix: `inbound/openphone/voicemails/${callId}`,
            });

            const attachmentRow = {
              communication_id: communication.id,
              ticket_id: communication.ticket_id,
              customer_id: communication.customer_id,
              file_type: contentType,
              file_name: fileName,
              file_url: stored.fileUrl,
              source: "openphone",
              storage_bucket: stored.storageBucket,
              storage_path: stored.storagePath,
              mime_type: contentType,
              size_bytes: bytes.length,
              external_id: voicemail?.data?.id || callId,
              communication_channel: communication.channel,
            };

            const { data } = await supabase
              .from("attachments")
              .insert(attachmentRow)
              .select()
              .single();
            if (data) createdAttachments.push(data);
          }
        } catch {
          // ignore
        }
      }
    }

    // Messages: download media from webhook payload when available
    if (
      communication.channel === "openphone_sms" ||
      communication.channel === "openphone_mms" ||
      communication.channel === "sms" ||
      communication.channel === "mms"
    ) {
      const attachments = extractMessageAttachments(communication.raw_payload || {});
      for (const att of attachments) {
        const fileUrl =
          att?.url ||
          att?.fileUrl ||
          att?.downloadUrl ||
          att?.mediaUrl ||
          att?.contentUrl ||
          att?.src ||
          null;

        if (!fileUrl || typeof fileUrl !== "string") continue;

        const fileNameRaw =
          att?.name || att?.fileName || att?.filename || att?.title || null;
        const mimeTypeRaw =
          att?.mimeType || att?.contentType || att?.type || null;

        const { bytes, contentType } = await fetchBinary(fileUrl);
        const mimeType =
          (typeof mimeTypeRaw === "string" && mimeTypeRaw.trim().length > 0
            ? mimeTypeRaw
            : contentType) || "application/octet-stream";

        const fileName =
          (typeof fileNameRaw === "string" && fileNameRaw.trim().length > 0
            ? fileNameRaw
            : `openphone-media-${communication.openphone_message_id || communication.id}.${guessExtension(
                mimeType
              )}`);

        const stored = await uploadToSupabase({
          bytes,
          contentType: mimeType,
          fileName,
          prefix: `inbound/openphone/messages/${communication.openphone_message_id || communication.id}`,
        });

        const externalId =
          att?.id ||
          att?.mediaId ||
          att?.fileId ||
          communication.openphone_message_id ||
          communication.external_id ||
          null;

        const attachmentRow = {
          communication_id: communication.id,
          ticket_id: communication.ticket_id,
          customer_id: communication.customer_id,
          file_type: mimeType,
          file_name: fileName,
          file_url: stored.fileUrl,
          source: "openphone",
          storage_bucket: stored.storageBucket,
          storage_path: stored.storagePath,
          mime_type: mimeType,
          size_bytes: bytes.length,
          external_id: externalId,
          communication_channel: communication.channel,
        };

        const { data } = await supabase
          .from("attachments")
          .insert(attachmentRow)
          .select()
          .single();
        if (data) createdAttachments.push(data);
      }
    }

    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();
      await supabase.from("communications").update(updates).eq("id", communication.id);
    }

    return res.json({
      success: true,
      message: "OpenPhone data resynced",
      data: {
        updates,
        attachments: createdAttachments,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to resync OpenPhone data",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;

