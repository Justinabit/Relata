import path from 'node:path';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';
import { cleanText } from '../lib/text.js';
import type { UploadResponse } from '../../shared/types.js';

type Kind = UploadResponse['kind'];

const EXT_KIND: Record<string, Kind> = { '.pdf': 'pdf', '.docx': 'docx', '.txt': 'txt', '.md': 'md', '.markdown': 'md' };
const MIME_OK: Record<Kind, string[]> = {
  pdf: ['application/pdf', 'application/x-pdf', 'application/octet-stream'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/octet-stream', 'application/zip'],
  txt: ['text/plain', 'application/octet-stream'],
  md: ['text/markdown', 'text/x-markdown', 'text/plain', 'application/octet-stream'],
};

export const UNSUPPORTED_MESSAGE = "This file type isn't supported. Please upload a PDF, DOCX, TXT, or Markdown file.";

/** Multer hands multipart filenames over as latin1; browsers send UTF-8. Undo the mis-decoding. */
export function fixFileNameEncoding(name: string): string {
  if (/[^\u0000-\u00ff]/.test(name)) return name; // already real Unicode
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('\ufffd') ? name : decoded;
}

export function sanitizeFileName(name: string): string {
  return path.basename(fixFileNameEncoding(name)).replace(/[^\p{L}\p{N}._ ()-]/gu, '_').slice(0, 120) || 'document';
}

export function detectKind(fileName: string, mime: string): Kind {
  const kind = EXT_KIND[path.extname(fileName).toLowerCase()];
  if (!kind) throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', UNSUPPORTED_MESSAGE);
  const m = (mime || '').toLowerCase().split(';')[0].trim();
  if (m && !MIME_OK[kind].includes(m)) throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', UNSUPPORTED_MESSAGE);
  return kind;
}

function checkMagic(kind: Kind, buf: Buffer): void {
  const bad = () => new AppError(415, 'UNSUPPORTED_FILE_TYPE', UNSUPPORTED_MESSAGE);
  if (kind === 'pdf' && buf.subarray(0, 1024).toString('latin1').indexOf('%PDF-') === -1) throw bad();
  if (kind === 'docx' && !(buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04)) throw bad();
  if ((kind === 'txt' || kind === 'md') && buf.subarray(0, 4096).includes(0)) throw bad(); // NUL bytes => binary
}

function markdownToText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<\/?[a-z][^<>]*>/gi, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/(\*\*|__|\*|_)(\S[^*_]*?)\1/g, '$2');
}

async function extractDocx(buf: Buffer): Promise<string> {
  // Guard against zip bombs before handing the archive to the parser.
  const zip = await JSZip.loadAsync(buf);
  const entries = Object.values(zip.files);
  if (entries.length > 1500 || !zip.file('word/document.xml')) throw new AppError(422, 'EXTRACTION_FAILED', 'This DOCX file could not be read.');
  let total = 0;
  for (const e of entries) total += (e as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
  if (total > 200 * 1024 * 1024) throw new AppError(422, 'EXTRACTION_FAILED', 'This DOCX file is too large to process.');
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return value;
}

async function extractPdf(buf: Buffer): Promise<{ text: string; pages: number }> {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  try {
    if (pdf.numPages > config.limits.maxPdfPages) {
      throw new AppError(413, 'TOO_MANY_PAGES', `This PDF has ${pdf.numPages} pages. The limit is ${config.limits.maxPdfPages}.`);
    }
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    return { text: Array.isArray(text) ? text.join('\n') : text, pages: totalPages };
  } finally {
    await pdf.destroy().catch(() => undefined);
  }
}

/**
 * Parses an uploaded file entirely in memory. Nothing is written to disk and the buffer is
 * discarded when the request ends. Uploaded files are never executed.
 */
export async function extractDocument(file: { originalname: string; mimetype: string; buffer: Buffer }): Promise<UploadResponse> {
  const fileName = sanitizeFileName(file.originalname);
  const kind = detectKind(file.originalname, file.mimetype);
  if (!file.buffer.length) throw new AppError(422, 'EMPTY_FILE', 'The uploaded file is empty.');
  checkMagic(kind, file.buffer);

  let raw: string;
  let pageCount: number | null = null;
  try {
    if (kind === 'pdf') {
      const r = await extractPdf(file.buffer);
      raw = r.text;
      pageCount = r.pages;
    } else if (kind === 'docx') raw = await extractDocx(file.buffer);
    else if (kind === 'md') raw = markdownToText(file.buffer.toString('utf8'));
    else raw = file.buffer.toString('utf8');
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(422, 'EXTRACTION_FAILED', 'The text of this file could not be read. It may be corrupted or password-protected.');
  }

  const cleaned = cleanText(raw);
  if (cleaned.length < 40) {
    throw new AppError(
      422,
      'NO_TEXT_FOUND',
      kind === 'pdf'
        ? 'No readable text was found in this PDF. Scanned documents need OCR, which Relata does not support yet.'
        : 'No readable text was found in this file.',
    );
  }
  const truncated = cleaned.length > config.limits.maxExtractedChars;
  const text = truncated ? cleaned.slice(0, config.limits.maxExtractedChars) : cleaned;
  return { fileName, kind, charCount: cleaned.length, truncated, pageCount, text };
}
