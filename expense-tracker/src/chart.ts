// A tiny dependency-free donut chart drawn on <canvas>.

export interface Slice {
  label: string;
  value: number;
  color: string;
}

export function drawDonut(canvas: HTMLCanvasElement, slices: readonly Slice[], centerText: string): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Render sharply on high-DPI screens.
  const size = canvas.clientWidth;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const outer = size / 2 - 4;
  const thickness = outer * 0.32;
  const radius = outer - thickness / 2;
  const styles = getComputedStyle(canvas);

  const total = slices.reduce((sum, s) => sum + s.value, 0);
  ctx.lineWidth = thickness;
  ctx.lineCap = "butt";

  if (total === 0) {
    ctx.strokeStyle = styles.getPropertyValue("--line").trim() || "#ddd";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    const gap = slices.length > 1 ? 0.02 : 0; // small gap between slices
    let start = -Math.PI / 2;
    for (const slice of slices) {
      const sweep = (slice.value / total) * Math.PI * 2;
      ctx.strokeStyle = slice.color;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, start + gap / 2, start + sweep - gap / 2);
      ctx.stroke();
      start += sweep;
    }
  }

  ctx.fillStyle = styles.getPropertyValue("--ink").trim() || "#111";
  ctx.font = `600 ${Math.round(size / 11)}px "DM Sans", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(centerText, cx, cy - size / 30);

  ctx.fillStyle = styles.getPropertyValue("--muted").trim() || "#666";
  ctx.font = `500 ${Math.round(size / 22)}px "DM Sans", system-ui, sans-serif`;
  ctx.fillText("spent", cx, cy + size / 14);
}
