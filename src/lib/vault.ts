import { supabase } from '../integrations/supabase/client';

export interface VaultDocument {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
  storagePath?: string;
  publicUrl?: string;
  categoryTag?: "legal_tax" | "license_permit" | "vendor_quote" | "financial";
  grantId?: string;
  metadataWarning?: string;
  slotKey?: string;
}

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB Limit

const ALLOWED_MIME_BY_EXT: Record<string, readonly string[]> = {
  ".pdf": ["application/pdf"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".txt": ["text/plain"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".png": ["image/png"],
};

function resolveMimeType(file: File, ext: string): string {
  if (file.type && file.type.trim() !== "") return file.type;
  return ALLOWED_MIME_BY_EXT[ext]?.[0] ?? "application/octet-stream";
}

export function validateVaultFile(file: File): { valid: boolean; error?: string } {
  if (!file || file.size <= 0) {
    return { valid: false, error: 'Selected file is empty.' };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: 'File size exceeds the 15MB limit.' };
  }
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
  const allowedMimes = ALLOWED_MIME_BY_EXT[ext];
  const mimeMatchesExt = !file.type || (allowedMimes?.includes(file.type) ?? false);
  if (!allowedMimes || !mimeMatchesExt) {
    return { valid: false, error: 'Invalid file format. Please upload PDF, DOCX, TXT, JPG, or PNG.' };
  }
  return { valid: true };
}

export async function processDocumentUpload(
  file: File,
  options: {
    slotKey?: string;
    categoryTag?: VaultDocument["categoryTag"];
    grantId?: string;
  } = {},
): Promise<VaultDocument> {
  const check = validateVaultFile(file);
  if (!check.valid) {
    throw new Error(check.error);
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Could not verify your account: ${authError.message}`);
  if (!user) throw new Error('Please sign in before uploading documents.');

  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
  const safeExt = ext.replace(/[^a-z0-9.]/g, "") || ".bin";
  const resolvedMimeType = resolveMimeType(file, ext);
  const filePath = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(2, 7)}${safeExt}`;
  const slotKey = options.slotKey ?? `custom-${crypto.randomUUID()}`;

  const { error: storageError } = await supabase.storage
    .from('vault')
    .upload(filePath, file, { contentType: resolvedMimeType });
  if (storageError) throw new Error(`Storage upload failed: ${storageError.message}`);

  const metadata = {
    user_id: user.id,
    file_name: file.name,
    size_bytes: file.size,
    mime_type: resolvedMimeType,
    storage_path: filePath,
    slot_key: slotKey,
    ...(options.categoryTag ? { category_tag: options.categoryTag } : {}),
    ...(options.grantId ? { grant_id: options.grantId } : {}),
  };

  let { data: dbData, error: dbError } = await supabase
    .from('vault_documents')
    .insert(metadata)
    .select()
    .single();
  let metadataWarning: string | undefined;

  if (dbError) {
    const optionalMetadataUnavailable =
      dbError.code === "PGRST204" ||
      dbError.code === "42703" ||
      /category_tag|grant_id/i.test(dbError.message);
    if (!optionalMetadataUnavailable) {
      await supabase.storage.from("vault").remove([filePath]);
      throw new Error(`Document metadata could not be saved: ${dbError.message}`);
    }
    const fallback = await supabase
      .from('vault_documents')
      .insert({
        user_id: user.id,
        file_name: file.name,
        size_bytes: file.size,
        mime_type: resolvedMimeType,
        storage_path: filePath,
        slot_key: slotKey,
      })
      .select()
      .single();
    dbData = fallback.data;
    dbError = fallback.error;
    metadataWarning =
      "This Vault database does not support grant/category tags yet. File saved without those links; ask Lovable to update the schema.";
  }

  if (dbError || !dbData) {
    await supabase.storage.from('vault').remove([filePath]);
    throw new Error('Document metadata could not be saved. Upload was rolled back.');
  }

  return {
    id: dbData.id,
    name: file.name,
    size: file.size,
    type: resolvedMimeType,
    uploadedAt: dbData.created_at ?? new Date().toISOString(),
    storagePath: filePath,
    ...(options.categoryTag ? { categoryTag: options.categoryTag } : {}),
    ...(options.grantId ? { grantId: options.grantId } : {}),
    ...(metadataWarning ? { metadataWarning } : {}),
    slotKey,
  };
}

export async function deleteVaultDocument(doc: VaultDocument): Promise<void> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Could not verify the current user: ${authError.message}`);
  if (!user) throw new Error("Please sign in before deleting Vault documents.");
  if (doc.storagePath && !doc.storagePath.startsWith(`${user.id}/`)) {
    throw new Error("This document is outside your private Vault and cannot be deleted from this account.");
  }

  const owned = await supabase
    .from("vault_documents")
    .select("id")
    .eq("id", doc.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (owned.error) throw new Error(`Could not verify the Vault record: ${owned.error.message}`);
  if (!owned.data) throw new Error("Vault record not found or not owned by this account.");

  const deletion = await supabase
    .from("vault_documents")
    .delete()
    .eq("id", doc.id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (deletion.error) throw new Error(`Could not delete the Vault record: ${deletion.error.message}`);
  if (!deletion.data) throw new Error("Vault record could not be deleted.");

  if (doc.storagePath) {
    const removal = await supabase.storage.from("vault").remove([doc.storagePath]);
    if (removal.error) throw new Error(`Vault record deleted, but file cleanup failed: ${removal.error.message}`);
  }
}

export async function updateVaultTextDocument(doc: VaultDocument, content: string): Promise<number> {
  if (!doc.type.startsWith("text/") || !doc.storagePath) {
    throw new Error("Only stored text documents can be edited in the Vault.");
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Could not verify the current user: ${authError.message}`);
  if (!user) throw new Error("Please sign in before editing Vault documents.");
  if (!doc.storagePath.startsWith(`${user.id}/`)) {
    throw new Error("This document is outside your private Vault and cannot be edited from this account.");
  }
  const current = await supabase.storage.from("vault").download(doc.storagePath);
  if (current.error || !current.data) {
    throw new Error(`Could not verify the current document before editing: ${current.error?.message ?? "file not found"}`);
  }

  const blob = new Blob([content], { type: doc.type });
  const upload = await supabase.storage.from("vault").upload(doc.storagePath, blob, {
    contentType: doc.type,
    upsert: true,
  });
  if (upload.error) throw new Error(`Could not save edited document: ${upload.error.message}`);

  const update = await supabase.from("vault_documents")
    .update({ size_bytes: blob.size })
    .eq("id", doc.id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (!update.error && update.data) return blob.size;

  const rollback = await supabase.storage.from("vault").upload(doc.storagePath, current.data, {
    contentType: doc.type,
    upsert: true,
  });
  if (rollback.error) {
    throw new Error(`Document metadata update failed (${update.error?.message ?? "record not found"}) and the original file could not be restored (${rollback.error.message}). Contact support to repair this document.`);
  }
  throw new Error(`Document metadata update failed: ${update.error?.message ?? "record not found or not owned by this user"}`);
}
