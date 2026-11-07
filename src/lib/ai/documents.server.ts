import { extractText, getDocumentProxy } from 'unpdf';
import { unzipSync, strFromU8 } from 'fflate';

export async function extractDocumentText(bytes: Uint8Array, mime: string): Promise<string> {
  if (mime === 'text/plain' || mime === 'text/markdown') return new TextDecoder().decode(bytes);
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
  throw new Error('This Vault file format cannot be read for drafting. Use PDF, DOCX, or TXT.');
}