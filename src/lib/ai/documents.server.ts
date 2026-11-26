import { extractText, getDocumentProxy } from 'unpdf';
import { unzipSync, strFromU8 } from 'fflate';

export async function extractDocumentText(bytes: Uint8Array, mime: string): Promise<string> {
  if (mime === 'text/plain' || mime === 'text/markdown' || mime === 'text/csv') return new TextDecoder().decode(bytes);
  if (mime === 'application/pdf') {
    const pdf = await getDocumentProxy(bytes, { maxImageSize: 16_777_216 });
    const result = await extractText(pdf, { mergePages: true });
    return result.text;
  }
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const entries = unzipSync(bytes, { filter: (entry) => {
      if (entry.originalSize > 30 * 1024 * 1024) throw new Error('Word document expands beyond safe processing size.');
      return /^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/.test(entry.name);
    } });
    return Object.values(entries).map((entry) => strFromU8(entry)
      .replace(/<\/w:p>/g, '\n').replace(/<[^>]*>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")).join('\n');
  }
  if (mime === 'image/jpeg' || mime === 'image/png') {
    const { generateWithGemini } = await import('./ai.server');
    return generateWithGemini(
      'You transcribe photos of business and identity documents for a grant application. Start with one line "Document type: <type>" (e.g. EIN letter, tax return, state filing, photo ID, receipt, unrelated photo). Then transcribe all readable text exactly. For photo IDs, transcribe only name, state, and expiration; never ID numbers. If the image is not a document, say "Document type: not a business document" and describe it in one sentence.',
      'Transcribe this image.', { data: bytes, mediaType: mime });
  }
  throw new Error('This Vault file format cannot be read for drafting. Use PDF, DOCX, TXT, JPG, or PNG.');
}