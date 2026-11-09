// src/lib/vault.ts
import { supabase } from '../integrations/supabase/client';

export interface VaultDocument {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
  storagePath?: string;
  publicUrl?: string;
}

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB Limit

export function validateVaultFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: 'File size exceeds the 15MB limit.' };
  }
  const allowedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'image/jpeg',
    'image/png'
  ];
  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: 'Invalid file format. Please upload PDF, DOCX, TXT, JPG, or PNG.' };
  }
  return { valid: true };
}

export async function processDocumentUpload(file: File): Promise<VaultDocument> {
  const check = validateVaultFile(file);
  if (!check.valid) {
    throw new Error(check.error);
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Please sign in before uploading documents.');

  const fileExt = file.name.split('.').pop();
  const filePath = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;

  const { error: storageError } = await supabase.storage.from('vault').upload(filePath, file);
  if (storageError) throw new Error(`Storage upload failed: ${storageError.message}`);

  const { data: dbData, error: dbError } = await supabase
    .from('vault_documents')
    .insert({
      user_id: user.id,
      file_name: file.name,
      size_bytes: file.size,
      mime_type: file.type,
      storage_path: filePath,
      slot_key: `custom-${crypto.randomUUID()}`,
    })
    .select()
    .single();
  if (dbError || !dbData) {
    await supabase.storage.from('vault').remove([filePath]);
    throw new Error('Document metadata could not be saved. Upload was rolled back.');
  }

  return {
    id: dbData.id,
    name: file.name,
    size: file.size,
    type: file.type,
    uploadedAt: new Date().toISOString(),
    storagePath: filePath
  };
}

