/** Dibuja la matriz del QR que calcula Rust (sin `data:` ni HTML inyectado). */
export function QrCode({ size, modules, label }: { size: number; modules: boolean[]; label: string }) {
  const q = 4; // zona tranquila
  const rects: string[] = [];
  modules.forEach((dark, i) => {
    if (dark) rects.push(`M${(i % size) + q} ${Math.floor(i / size) + q}h1v1h-1z`);
  });
  return (
    <svg className="np-qr" viewBox={`0 0 ${size + q * 2} ${size + q * 2}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width="100%" height="100%" fill="#fff" />
      <path d={rects.join('')} fill="#17171A" />
    </svg>
  );
}
