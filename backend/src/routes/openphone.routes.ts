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

let cachedStorageSupport: null | { bucket: string; ok: boolean } = null;

const isSupabaseStorageAvailable = async () => {
  const bucket = process.env.SUPABASE_ATTACHMENTS_BUCKET || "attachments";
  if (cachedStorageSupport && cachedStorageSupport.bucket === bucket) {
    return cachedStorageSupport.ok;
  }

  try {
    const { data, error } = await supabase.storage.getBucket(bucket);
    cachedStorageSupport = { bucket, ok: Boolean(data && !error) };
  } catch {
    cachedStorageSupport = { bucket, ok: false };
  }

  return cachedStorageSupport.ok;
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
  const storagePath = `${prefix}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${sanitizeFileName(fileName)}`;

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
    const steps: Array<{ step: string; ok: boolean; detail?: string }> = [];

    // Calls: recordings + transcript + summary + voicemail
    if (
      communication.channel === "openphone_call" ||
      communication.channel === "call" ||
      communication.openphone_call_id
    ) {
      const callId = communication.openphone_call_id || communication.external_id;
      if (typeof callId === "string" && callId.trim().length > 0) {
        steps.push({ step: "call:identify", ok: true, detail: callId });
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
        let recordings: RecordingsResponse | null = null;
        try {
          recordings = await openPhoneRequest<RecordingsResponse>(
            `/call-recordings/${callId}`
          );
          steps.push({ step: "call:recordings", ok: true });
        } catch (err) {
          steps.push({
            step: "call:recordings",
            ok: false,
            detail: err instanceof Error ? err.message : "Failed",
          });
        }

        const firstRecording = recordings?.data?.find((r) => r?.url) || null;
        if (firstRecording?.url) {
          const storageAvailable = await isSupabaseStorageAvailable();
          let fileUrlToUse = firstRecording.url;
          let storageBucket: string | null = null;
          let storagePath: string | null = null;
          let mimeType = "audio/mpeg";
          let sizeBytes: number | null = null;
          let fileName = `call-recording-${callId}.mp3`;

          if (storageAvailable) {
            try {
              const { bytes, contentType } = await fetchBinary(firstRecording.url);
              mimeType = contentType || mimeType;
              sizeBytes = bytes.length;
              fileName = `call-recording-${callId}.${guessExtension(mimeType)}`;

              const stored = await uploadToSupabase({
                bytes,
                contentType: mimeType,
                fileName,
                prefix: `inbound/openphone/calls/${callId}`,
              });

              fileUrlToUse = stored.fileUrl || firstRecording.url;
              storageBucket = stored.storageBucket;
              storagePath = stored.storagePath;
              steps.push({ step: "call:recording-upload", ok: true });
            } catch (err) {
              // Some OpenPhone recording URLs are short-lived or require extra auth.
              // Fall back to the OpenPhone URL instead of failing the entire resync.
              steps.push({
                step: "call:recording-upload",
                ok: false,
                detail: err instanceof Error ? err.message : "Failed",
              });
            }
          }

          updates.recording_url = fileUrlToUse;

          const existing = await supabase
            .from("attachments")
            .select("id")
            .eq("communication_id", communication.id)
            .eq("external_id", firstRecording.id || callId)
            .maybeSingle();

          if (!existing.data?.id) {
            const attachmentRow = {
            communication_id: communication.id,
            ticket_id: communication.ticket_id,
            customer_id: communication.customer_id,
            file_type: mimeType,
            file_name: fileName,
            file_url: fileUrlToUse,
            source: "openphone",
            storage_bucket: storageBucket,
            storage_path: storagePath,
            mime_type: mimeType,
            size_bytes: sizeBytes,
            external_id: firstRecording.id || callId,
            communication_channel: communication.channel,
            };

            const { data } = await supabase
              .from("attachments")
              .insert(attachmentRow)
              .select()
              .single();
            if (data) createdAttachments.push(data);
          } else {
            steps.push({ step: "call:recording-attachment", ok: true, detail: "already_exists" });
          }
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
            steps.push({ step: "call:transcript", ok: true, detail: `turns=${dialogue.length}` });
          } else {
            steps.push({ step: "call:transcript", ok: false, detail: "empty" });
          }
        } catch (err) {
          steps.push({
            step: "call:transcript",
            ok: false,
            detail: err instanceof Error ? err.message : "Failed",
          });
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
          steps.push({ step: "call:summary", ok: true });
        } catch (err) {
          steps.push({
            step: "call:summary",
            ok: false,
            detail: err instanceof Error ? err.message : "Failed",
          });
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
            const storageAvailable = await isSupabaseStorageAvailable();
            let fileUrlToUse = url;
            let storageBucket: string | null = null;
            let storagePath: string | null = null;
            let mimeType = "audio/mpeg";
            let sizeBytes: number | null = null;
            let fileName = `voicemail-${callId}.mp3`;

            if (storageAvailable) {
              try {
                const { bytes, contentType } = await fetchBinary(url);
                mimeType = contentType || mimeType;
                sizeBytes = bytes.length;
                fileName = `voicemail-${callId}.${guessExtension(mimeType)}`;

                const stored = await uploadToSupabase({
                  bytes,
                  contentType: mimeType,
                  fileName,
                  prefix: `inbound/openphone/voicemails/${callId}`,
                });

                fileUrlToUse = stored.fileUrl || url;
                storageBucket = stored.storageBucket;
                storagePath = stored.storagePath;
                steps.push({ step: "call:voicemail-upload", ok: true });
              } catch (err) {
                steps.push({
                  step: "call:voicemail-upload",
                  ok: false,
                  detail: err instanceof Error ? err.message : "Failed",
                });
              }
            }

            const attachmentRow = {
              communication_id: communication.id,
              ticket_id: communication.ticket_id,
              customer_id: communication.customer_id,
              file_type: mimeType,
              file_name: fileName,
              file_url: fileUrlToUse,
              source: "openphone",
              storage_bucket: storageBucket,
              storage_path: storagePath,
              mime_type: mimeType,
              size_bytes: sizeBytes,
              external_id: voicemail?.data?.id || callId,
              communication_channel: communication.channel,
            };

            const externalKey = voicemail?.data?.id || callId;
            const { data: existingVoicemailAttachment } = await supabase
              .from("attachments")
              .select("id")
              .eq("communication_id", communication.id)
              .eq("external_id", externalKey)
              .maybeSingle();

            if (!existingVoicemailAttachment?.id) {
              const { data } = await supabase
                .from("attachments")
                .insert(attachmentRow)
                .select()
                .single();
              if (data) createdAttachments.push(data);
            }
            steps.push({ step: "call:voicemail", ok: true });
          } else {
            steps.push({ step: "call:voicemail", ok: false, detail: "none" });
          }
        } catch (err) {
          steps.push({
            step: "call:voicemail",
            ok: false,
            detail: err instanceof Error ? err.message : "Failed",
          });
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
      const storageAvailable = await isSupabaseStorageAvailable();
      const attachments = extractMessageAttachments(communication.raw_payload || {});
      steps.push({ step: "message:attachments-found", ok: true, detail: `count=${attachments.length}` });
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

        const mimeType =
          (typeof mimeTypeRaw === "string" && mimeTypeRaw.trim().length > 0
            ? mimeTypeRaw
            : "application/octet-stream") || "application/octet-stream";

        const fileName =
          (typeof fileNameRaw === "string" && fileNameRaw.trim().length > 0
            ? fileNameRaw
            : `openphone-media-${communication.openphone_message_id || communication.id}.${guessExtension(
                mimeType
              )}`);

        let fileUrlToUse = fileUrl;
        let storageBucket: string | null = null;
        let storagePath: string | null = null;
        let sizeBytes: number | null = null;

        if (storageAvailable) {
          try {
            const { bytes, contentType } = await fetchBinary(fileUrl);
            const resolvedMime = contentType || mimeType;
            sizeBytes = bytes.length;

            const stored = await uploadToSupabase({
              bytes,
              contentType: resolvedMime,
              fileName,
              prefix: `inbound/openphone/messages/${communication.openphone_message_id || communication.id}`,
            });

            fileUrlToUse = stored.fileUrl || fileUrl;
            storageBucket = stored.storageBucket;
            storagePath = stored.storagePath;
            steps.push({ step: "message:media-upload", ok: true });
          } catch (err) {
            steps.push({
              step: "message:media-upload",
              ok: false,
              detail: err instanceof Error ? err.message : "Failed",
            });
          }
        }

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
          file_url: fileUrlToUse,
          source: "openphone",
          storage_bucket: storageBucket,
          storage_path: storagePath,
          mime_type: mimeType,
          size_bytes: sizeBytes,
          external_id: externalId,
          communication_channel: communication.channel,
        };

        const externalKey =
          typeof externalId === "string" && externalId.trim().length > 0
            ? externalId
            : `${communication.id}:${fileUrl}`;

        const { data: existingAttachment } = await supabase
          .from("attachments")
          .select("id")
          .eq("communication_id", communication.id)
          .eq("external_id", externalKey)
          .maybeSingle();

        if (!existingAttachment?.id) {
          const { data } = await supabase
            .from("attachments")
            .insert({ ...attachmentRow, external_id: externalKey })
            .select()
            .single();
          if (data) createdAttachments.push(data);
        }
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
        steps,
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

