import { convertFileSrc } from '@tauri-apps/api/core';

const MAX_WIDTH = 960;

function toBase64(buf: ArrayBuffer): string {
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * Descarga la imagen por Rust (`npimg`, respeta Tor) y la recomprime a WebP en la webview UI.
 * Se carga con un `<img>` (la CSP permite `npimg:` en `img-src`, no en `connect-src`); `npimg` responde con CORS para que el canvas no se manche.
 */
export async function compressImage(absUrl: string): Promise<{ data: string; bytes: number } | null> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = convertFileSrc(absUrl, 'npimg');
    await img.decode();
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return null;
    const scale = Math.min(1, MAX_WIDTH / w);
    const canvas = new OffscreenCanvas(Math.round(w * scale), Math.round(h * scale));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.72 });
    const buf = await blob.arrayBuffer();
    return { data: toBase64(buf), bytes: buf.byteLength };
  } catch {
    return null;
  }
}
