import { z } from "zod";
import { FREE_LIMITS, formatBytes } from "./free-limits.js";

const dataUrlPattern = /^data:([^;,]+)(?:;[^,]+)*;base64,([A-Za-z0-9+/=]+)$/;

const attachmentSchema = z.object({
  fileName: z.string().trim().min(1).max(FREE_LIMITS.fileName.maxChars),
  mimeType: z.string().trim().min(1),
  dataUrl: z.string().trim().min(1)
});

const customLogoSchema = attachmentSchema.extend({
  tone: z.enum(["dark", "light"]).default("dark")
});

const documentSchema = z.object({
  markdown: z.string().trim().min(1).max(FREE_LIMITS.markdown.maxChars),
  fileName: z.string().trim().min(1).max(FREE_LIMITS.fileName.maxChars),
  attachments: z
    .array(attachmentSchema)
    .max(FREE_LIMITS.attachments.maxFilesPerDocument)
    .default([])
});

export const freeConvertRequestSchema = z.object({
  documents: z.array(documentSchema).min(1).max(FREE_LIMITS.documents.maxFiles),
  customLogo: customLogoSchema.optional()
});

function canonicalizeMimeType(mimeType: string) {
  const normalized = mimeType.trim().toLowerCase().split(";")[0].trim();
  if (normalized === "image/jpg") {
    return "image/jpeg";
  }
  if (normalized === "image/svg") {
    return "image/svg+xml";
  }
  return normalized;
}

export type FreeConvertAttachmentInput = z.infer<typeof attachmentSchema>;
export type FreeConvertCustomLogoInput = z.infer<typeof customLogoSchema>;

export type PreparedFreeConvertRequest = {
  sourceName: string;
  fileName: string;
  markdownChars: number;
  attachmentsCount: number;
  attachmentsTotalBytes: number;
  documents: Array<{
    markdown: string;
    sourceName: string;
    attachments: FreeConvertAttachmentInput[];
  }>;
  customLogo: FreeConvertCustomLogoInput | null;
};

export function extractDataUrlInfo(dataUrl: string) {
  const match = dataUrlPattern.exec(dataUrl);
  if (!match) {
    return null;
  }

  const mimeType = canonicalizeMimeType(match[1]);
  const base64 = match[2];
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const bytes = Math.floor((base64.length * 3) / 4) - padding;

  return { mimeType, bytes };
}

export function normalizeMimeType(fileName: string, mimeType: string) {
  const normalized = canonicalizeMimeType(mimeType);
  if (normalized) {
    return normalized;
  }

  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".svg")) return "image/svg+xml";
  if (lowerName.endsWith(".png")) return "image/png";
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return "image/jpeg";
  if (lowerName.endsWith(".webp")) return "image/webp";
  return normalized;
}

export function sanitizeSourceName(fileName?: string) {
  const base = (fileName ?? "documento")
    .replace(/\.md$/i, "")
    .replace(/[^\w.\- ]+/g, " ")
    .trim()
    .slice(0, FREE_LIMITS.fileName.maxChars);

  return base.length > 0 ? base : "documento";
}

export function validateFreeConvertRequest(body: unknown, requestBytes = 0): PreparedFreeConvertRequest {
  if (requestBytes > FREE_LIMITS.request.maxBodyBytes) {
    throw new Error(`payload_too_large: Payload acima do limite (${formatBytes(FREE_LIMITS.request.maxBodyBytes)}).`);
  }

  const parsed = freeConvertRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error("invalid_payload: Revise os limites de documentos, markdown, nome de arquivo e anexos.");
  }

  const sourceName = sanitizeSourceName(parsed.data.documents[0]?.fileName);
  const markdownChars = parsed.data.documents.reduce((sum, item) => sum + item.markdown.length, 0);
  const attachmentsCount = parsed.data.documents.reduce((sum, item) => sum + item.attachments.length, 0);

  if (markdownChars > FREE_LIMITS.documents.maxTotalChars) {
    throw new Error(
      `markdown_too_large: Total de markdown excede ${FREE_LIMITS.documents.maxTotalChars.toLocaleString("pt-BR")} caracteres.`
    );
  }

  if (attachmentsCount > FREE_LIMITS.attachments.maxFiles) {
    throw new Error(`too_many_attachments: Total de anexos excede ${FREE_LIMITS.attachments.maxFiles}.`);
  }

  let attachmentsTotalBytes = 0;
  for (const document of parsed.data.documents) {
    for (const attachment of document.attachments) {
      const dataUrl = extractDataUrlInfo(attachment.dataUrl);
      const normalizedMimeType = normalizeMimeType(attachment.fileName, attachment.mimeType);

      if (!dataUrl) {
        throw new Error(`invalid_attachment_data: Anexo "${attachment.fileName}" com data URL inválida.`);
      }

      if (
        !FREE_LIMITS.attachments.allowedMimeTypes.includes(
          dataUrl.mimeType as (typeof FREE_LIMITS.attachments.allowedMimeTypes)[number]
        )
      ) {
        throw new Error(
          `unsupported_attachment_type: Formato não permitido em "${attachment.fileName}". Tipos aceitos: ${FREE_LIMITS.attachments.allowedMimeTypes.join(", ")}.`
        );
      }

      if (normalizedMimeType !== dataUrl.mimeType) {
        throw new Error(`mime_mismatch: Tipo MIME inconsistente no anexo "${attachment.fileName}".`);
      }

      if (dataUrl.bytes > FREE_LIMITS.attachments.maxFileBytes) {
        throw new Error(
          `attachment_too_large: Anexo "${attachment.fileName}" excede ${formatBytes(FREE_LIMITS.attachments.maxFileBytes)}.`
        );
      }

      attachmentsTotalBytes += dataUrl.bytes;
    }
  }

  if (attachmentsTotalBytes > FREE_LIMITS.attachments.maxTotalBytes) {
    throw new Error(
      `attachments_too_large: Total de anexos excede ${formatBytes(FREE_LIMITS.attachments.maxTotalBytes)}.`
    );
  }

  const customLogo = parsed.data.customLogo;
  if (customLogo) {
    const logoDataUrl = extractDataUrlInfo(customLogo.dataUrl);
    const normalizedLogoMimeType = normalizeMimeType(customLogo.fileName, customLogo.mimeType);

    if (!logoDataUrl) {
      throw new Error(`invalid_logo_data: Logo "${customLogo.fileName}" com data URL inválida.`);
    }

    if (
      !FREE_LIMITS.branding.allowedMimeTypes.includes(
        logoDataUrl.mimeType as (typeof FREE_LIMITS.branding.allowedMimeTypes)[number]
      )
    ) {
      throw new Error(
        `unsupported_logo_type: Formato não permitido em "${customLogo.fileName}". Tipos aceitos: ${FREE_LIMITS.branding.allowedMimeTypes.join(", ")}.`
      );
    }

    if (normalizedLogoMimeType !== logoDataUrl.mimeType) {
      throw new Error(`logo_mime_mismatch: Tipo MIME inconsistente na logo "${customLogo.fileName}".`);
    }

    if (logoDataUrl.bytes > FREE_LIMITS.branding.maxLogoBytes) {
      throw new Error(
        `logo_too_large: Logo "${customLogo.fileName}" excede ${formatBytes(FREE_LIMITS.branding.maxLogoBytes)}.`
      );
    }
  }

  return {
    sourceName,
    fileName: `${sourceName}.pdf`,
    markdownChars,
    attachmentsCount,
    attachmentsTotalBytes,
    documents: parsed.data.documents.map((document) => ({
      markdown: document.markdown,
      sourceName: sanitizeSourceName(document.fileName),
      attachments: document.attachments
    })),
    customLogo: customLogo ?? null
  };
}
