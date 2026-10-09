import { convertFileSrc } from '@tauri-apps/api/core';

const MAX_WIDTH = 960;

function toBase64(buf: ArrayBuffer): string {
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Descarga la imagen por Rust (`npimg`, respeta Tor) y la recomprime a WebP en la webview UI. */
export async function compressImage(absUrl: string): Promise<{ data: string; bytes: number } | null> {
  try {
    const resp = await fetch(convertFileSrc(absUrl, 'npimg'));
    if (!resp.ok) return null;
    const bitmap = await createImageBitmap(await resp.blob());
    const scale = Math.min(1, MAX_WIDTH / bitmap.width);
    const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.72 });
    const buf = await blob.arrayBuffer();
    return { data: toBase64(buf), bytes: buf.byteLength };
  } catch {
    return null;
  }
}
