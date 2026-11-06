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
    'text/plain'
  ];
  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: 'Invalid file format. Please upload PDF, DOCX, or TXT.' };
  }
  return { valid: true };
}

export async function processDocumentUpload(file: File): Promise<VaultDocument> {
  const check = validateVaultFile(file);
  if (!check.valid) {
    throw new Error(check.error);
  }

  const fileExt = file.name.split('.').pop();
  const filePath = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;

  // 1. Upload file binary directly to Supabase Storage Bucket ('vault')
  const { data: storageData, error: storageError } = await supabase.storage
    .from('vault')
    .upload(filePath, file);

  if (storageError) {
    throw new Error(`Storage upload failed: ${storageError.message}`);
  }

  // 2. Fetch public URL for download reference
  const { data: urlData } = supabase.storage.from('vault').getPublicUrl(filePath);

  // 3. Persist metadata record in the database
  const { data: dbData, error: dbError } = await supabase
    .from('vault_documents')
    .insert([
      {
        name: file.name,
        size: file.size,
        type: file.type,
        storage_path: filePath,
        public_url: urlData.publicUrl,
        uploaded_at: new Date().toISOString()
      }
    ])
    .select()
    .single();

  if (dbError) {
    console.warn('Metadata insertion failed, returning storage payload:', dbError.message);
  }

  return {
    id: dbData?.id || filePath,
    name: file.name,
    size: file.size,
    type: file.type,
    uploadedAt: new Date().toISOString(),
    storagePath: filePath,
    publicUrl: urlData.publicUrl
  };
}

