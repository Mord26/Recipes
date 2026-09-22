export interface ShareCardData {
  title: string;
  credit: string | null;
  servings: number | null;
  /** Pre-rendered lines, already in the reader's measuring system. */
  ingredientLines: string[];
  /** Full preparation steps - the whole recipe must fit in the image. */
  steps: string[];
  /** Public URL of the dish photo. Drawn in the main column when it loads; ignored otherwise. */
  photoUrl?: string;
  /** Short intro, printed as an italic note under the ingredients like a magazine page. */
  note?: string | null;
  url: string;
  /** Writing direction of the shared language: the whole card mirrors for Hebrew. */
  dir?: 'rtl' | 'ltr';
  prepText?: string | null;
  cookText?: string | null;
  labels: {
    ingredients: string;
    steps: string;
    servings: string;
    appName: string;
    prep?: string;
    cook?: string;
  };
}

// 3:4 page format - the proportions of a printed recipe page, which is what the design is modelled on.
const W = 1080;
const H = 1440;
const MARGIN = 74;
const CONTENT_W = W - MARGIN * 2;
const GUTTER = 44;
// Ingredients sit in a narrow side column; the photo and method take the wide main column.
const SIDE_W = Math.round((CONTENT_W - GUTTER) * 0.36);
const MAIN_W = CONTENT_W - GUTTER - SIDE_W;
const FOOTER_H = 74;
const PHOTO_H = 430;
const PHOTO_H_MIN = 210;

const BG = '#fbf8f2';
const INK = '#241a10';
const BODY = '#4a3a2c';
const MUTED = '#8d7860';
const ACCENT = '#c7602f';
const RULE = 'rgba(36,26,16,0.18)';

/** Loads a cross-origin image for canvas use, resolving null instead of throwing so the card still renders. */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

type IconKind = 'bowl' | 'clock' | 'cutlery';

/**
 * Line icons for the meta row, drawn as paths rather than emoji so they look identical on every
 * device (emoji glyphs differ wildly between platforms).
 */
function drawIcon(ctx: CanvasRenderingContext2D, kind: IconKind, cx: number, cy: number, size: number) {
  const r = size / 2;
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1.4, size * 0.062);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (kind === 'bowl') {
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.15, r * 0.85, 0, Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - r, cy - r * 0.15);
    ctx.lineTo(cx + r, cy - r * 0.15);
    ctx.stroke();
  } else if (kind === 'clock') {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - r * 0.45);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + r * 0.38, cy + r * 0.1);
    ctx.stroke();
  } else {
    const k = r * 0.9;
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.5, cy + k);
    ctx.lineTo(cx + r * 0.5, cy - k);
    ctx.quadraticCurveTo(cx + r, cy - k * 0.3, cx + r * 0.5, cy + k * 0.15);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.5, cy + k);
    ctx.lineTo(cx - r * 0.5, cy - k * 0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.85, cy - k * 0.2);
    ctx.lineTo(cx - r * 0.15, cy - k * 0.2);
    ctx.stroke();
    for (const dx of [-0.85, -0.5, -0.15]) {
      ctx.beginPath();
      ctx.moveTo(cx + r * dx, cy - k);
      ctx.lineTo(cx + r * dx, cy - k * 0.2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** A drawing op queued at a column-relative offset, painted once the column origin is known. */
interface Item {
  height: number;
  render: (y: number) => void;
}

export async function renderShareCard(data: ShareCardData): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');

  const rootStyles = getComputedStyle(document.documentElement);
  const serifFamily = rootStyles.getPropertyValue('--font-serif').trim() || 'serif';
  const bodyFamily = rootStyles.getPropertyValue('--font-assistant').trim() || 'sans-serif';

  // Canvas never triggers a webfont download on its own - ask for the faces we draw with, or the
  // card silently falls back to a default serif.
  await Promise.all([
    document.fonts.load(`700 64px ${serifFamily}`),
    document.fonts.load(`500 34px ${serifFamily}`),
    document.fonts.load(`400 28px ${bodyFamily}`),
    document.fonts.load(`600 28px ${bodyFamily}`),
  ]).catch(() => undefined);
  await document.fonts.ready;

  const photo = data.photoUrl ? await loadImage(data.photoUrl) : null;

  // Everything mirrors on direction: Hebrew reads from the right edge inward, English from the left.
  const rtl = (data.dir ?? 'rtl') === 'rtl';
  ctx.direction = rtl ? 'rtl' : 'ltr';
  const startAlign: CanvasTextAlign = rtl ? 'right' : 'left';
  /** x of the reading-start edge of a column that begins at `left` and is `width` wide. */
  const colStart = (left: number, width: number) => (rtl ? left + width : left);
  const colInward = (left: number, width: number, px: number) => (rtl ? left + width - px : left + px);

  // Side column holds the ingredients; the main column holds the photo and the method.
  const sideLeft = rtl ? MARGIN + MAIN_W + GUTTER : MARGIN;
  const mainLeft = rtl ? MARGIN : MARGIN + SIDE_W + GUTTER;

  const metaCells = [
    data.prepText ? { icon: 'bowl' as IconKind, label: data.labels.prep ?? '', value: data.prepText } : null,
    data.cookText ? { icon: 'clock' as IconKind, label: data.labels.cook ?? '', value: data.cookText } : null,
    data.servings ? { icon: 'cutlery' as IconKind, label: data.labels.servings, value: String(data.servings) } : null,
  ].filter(Boolean) as { icon: IconKind; label: string; value: string }[];

  /** Section heading in serif with a hairline rule under it, aligned to the column's reading edge. */
  const headingItem = (label: string, left: number, width: number, scale: number): Item => {
    const size = 34 * scale;
    const height = size * 2.05;
    return {
      height,
      render: (y) => {
        ctx.textAlign = startAlign;
        ctx.fillStyle = INK;
        ctx.font = `500 ${size}px ${serifFamily}`;
        ctx.fillText(label, colStart(left, width), y + size);
        ctx.strokeStyle = RULE;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(left, y + size * 1.55);
        ctx.lineTo(left + width, y + size * 1.55);
        ctx.stroke();
      },
    };
  };

  // Builds both columns at a given scale/photo height and reports the tallest.
  const build = (scale: number, photoH: number) => {
    const side: Item[] = [];
    const main: Item[] = [];
    const itemSize = 25 * scale;
    const itemLH = itemSize * 1.42;

    // --- Side column: ingredients ---------------------------------------
    side.push(headingItem(data.labels.ingredients, sideLeft, SIDE_W, scale));
    const bulletInset = 8 * scale;
    const textInset = 26 * scale;
    ctx.font = `400 ${itemSize}px ${bodyFamily}`;
    for (const ingredient of data.ingredientLines) {
      const lines = wrapLines(ctx, ingredient, SIDE_W - textInset);
      side.push({
        height: lines.length * itemLH + 9 * scale,
        render: (y) => {
          ctx.fillStyle = ACCENT;
          ctx.beginPath();
          ctx.arc(colInward(sideLeft, SIDE_W, bulletInset), y + itemSize * 0.6, 4.5 * scale, 0, Math.PI * 2);
          ctx.fill();
          ctx.textAlign = startAlign;
          ctx.font = `400 ${itemSize}px ${bodyFamily}`;
          ctx.fillStyle = BODY;
          lines.forEach((line, i) =>
            ctx.fillText(line, colInward(sideLeft, SIDE_W, textInset), y + itemSize + i * itemLH)
          );
        },
      });
    }

    // Notes fill the space under a short ingredient list, exactly like a printed recipe page.
    const note = data.note?.trim();
    if (note) {
      const noteSize = 23 * scale;
      const noteLH = noteSize * 1.45;
      ctx.font = `italic 400 ${noteSize}px ${bodyFamily}`;
      const lines = wrapLines(ctx, note, SIDE_W);
      side.push({
        height: 30 * scale + lines.length * noteLH,
        render: (y) => {
          ctx.strokeStyle = RULE;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 5]);
          ctx.beginPath();
          ctx.moveTo(sideLeft, y + 14 * scale);
          ctx.lineTo(sideLeft + SIDE_W, y + 14 * scale);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.textAlign = startAlign;
          ctx.font = `italic 400 ${noteSize}px ${bodyFamily}`;
          ctx.fillStyle = MUTED;
          lines.forEach((line, i) =>
            ctx.fillText(line, colStart(sideLeft, SIDE_W), y + 30 * scale + noteSize + i * noteLH)
          );
        },
      });
    }

    // --- Main column: photo, then the method -----------------------------
    if (photo) {
      main.push({
        height: photoH + 30 * scale,
        render: (y) => {
          ctx.save();
          roundedRect(ctx, mainLeft, y, MAIN_W, photoH, 18 * scale);
          ctx.clip();
          const s = Math.max(MAIN_W / photo.width, photoH / photo.height);
          const dw = photo.width * s;
          const dh = photo.height * s;
          ctx.drawImage(photo, mainLeft + (MAIN_W - dw) / 2, y + (photoH - dh) / 2, dw, dh);
          ctx.restore();
        },
      });
    }

    if (data.steps.length > 0) {
      main.push(headingItem(data.labels.steps, mainLeft, MAIN_W, scale));
      const numInset = 15 * scale;
      const stepInset = 44 * scale;
      ctx.font = `400 ${itemSize}px ${bodyFamily}`;
      data.steps.forEach((step, index) => {
        const lines = wrapLines(ctx, step, MAIN_W - stepInset);
        main.push({
          height: lines.length * itemLH + 15 * scale,
          render: (y) => {
            ctx.textAlign = 'center';
            ctx.fillStyle = ACCENT;
            ctx.font = `500 ${itemSize * 0.95}px ${serifFamily}`;
            ctx.fillText(String(index + 1), colInward(mainLeft, MAIN_W, numInset), y + itemSize);
            ctx.textAlign = startAlign;
            ctx.font = `400 ${itemSize}px ${bodyFamily}`;
            ctx.fillStyle = BODY;
            lines.forEach((line, i) =>
              ctx.fillText(line, colInward(mainLeft, MAIN_W, stepInset), y + itemSize + i * itemLH)
            );
          },
        });
      });
    }

    const sum = (items: Item[]) => items.reduce((total, item) => total + item.height, 0);
    return { side, main, total: Math.max(sum(side), sum(main)) };
  };

  // --- Header block (title + meta) measured once per scale -----------------
  const headerHeight = (scale: number) => {
    const titleSize = 60 * scale;
    ctx.font = `700 ${titleSize}px ${serifFamily}`;
    const lines = wrapLines(ctx, data.title, CONTENT_W - 60 * scale);
    const creditH = data.credit ? 30 * scale * 1.7 : 0;
    const metaH = metaCells.length > 0 ? 92 * scale : 0;
    return { titleSize, lines, creditH, metaH, height: 26 * scale + lines.length * titleSize * 1.16 + creditH + 30 * scale + metaH };
  };

  const MIN_SCALE = 0.5;
  // Vertical room for the header plus the two columns.
  const ROOM = H - FOOTER_H - MARGIN - 24;

  /** Largest text scale that fits for a given photo height. */
  const fitFor = (photoH: number) => {
    let scale = 1;
    let head = headerHeight(scale);
    let cols = build(scale, photoH);
    while (head.height + cols.total > ROOM && scale > MIN_SCALE) {
      scale = Math.max(MIN_SCALE, scale - 0.03);
      head = headerHeight(scale);
      cols = build(scale, photoH);
    }
    return { scale, head, cols, photoH };
  };

  // A long recipe should shrink the PHOTO before it shrinks the text into something unreadable,
  // so try progressively smaller photos and stop as soon as the text can stay comfortably large.
  const COMFORTABLE = 0.8;
  let fit = fitFor(PHOTO_H);
  if (photo && fit.scale < COMFORTABLE) {
    for (const candidate of [360, 290, PHOTO_H_MIN]) {
      fit = fitFor(candidate);
      if (fit.scale >= COMFORTABLE) break;
    }
  }
  const { scale, head, cols } = fit;

  // --- Paint ---------------------------------------------------------------
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  let y = MARGIN;

  // Title block: rule, name, credit, rule.
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(MARGIN, y);
  ctx.lineTo(W - MARGIN, y);
  ctx.stroke();
  y += 26 * scale;

  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.font = `700 ${head.titleSize}px ${serifFamily}`;
  // Letter-spacing gives the title the magazine feel; ignored by engines that lack it.
  const spacedTitle = 'letterSpacing' in ctx;
  if (spacedTitle) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${2.5 * scale}px`;
  head.lines.forEach((line, i) => ctx.fillText(line, W / 2, y + head.titleSize * 0.86 + i * head.titleSize * 1.16));
  if (spacedTitle) (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
  y += head.lines.length * head.titleSize * 1.16;

  if (data.credit) {
    ctx.fillStyle = ACCENT;
    ctx.font = `400 ${30 * scale}px ${bodyFamily}`;
    ctx.fillText(data.credit, W / 2, y + 30 * scale);
    y += head.creditH;
  }

  y += 14 * scale;
  ctx.strokeStyle = RULE;
  ctx.beginPath();
  ctx.moveTo(MARGIN, y);
  ctx.lineTo(W - MARGIN, y);
  ctx.stroke();
  y += 16 * scale;

  // Meta row: evenly spaced cells laid out along the reading direction.
  if (metaCells.length > 0) {
    const cellW = CONTENT_W / metaCells.length;
    metaCells.forEach((cell, i) => {
      const order = rtl ? metaCells.length - 1 - i : i;
      const cx = MARGIN + order * cellW + cellW / 2;
      ctx.textAlign = 'center';
      drawIcon(ctx, cell.icon, cx, y + 22 * scale, 30 * scale);
      ctx.font = `400 ${20 * scale}px ${bodyFamily}`;
      ctx.fillStyle = MUTED;
      ctx.fillText(cell.label, cx, y + 58 * scale);
      ctx.font = `600 ${26 * scale}px ${bodyFamily}`;
      ctx.fillStyle = INK;
      ctx.fillText(cell.value, cx, y + 86 * scale);
      if (i < metaCells.length - 1) {
        ctx.strokeStyle = RULE;
        ctx.beginPath();
        const dx = MARGIN + (order + (rtl ? 0 : 1)) * cellW;
        ctx.moveTo(dx, y + 8 * scale);
        ctx.lineTo(dx, y + 84 * scale);
        ctx.stroke();
      }
    });
    y += head.metaH;
  }

  // Both columns start at the same baseline, like a printed page.
  const columnTop = y + 18 * scale;
  let sy = columnTop;
  for (const item of cols.side) {
    item.render(sy);
    sy += item.height;
  }
  let my = columnTop;
  for (const item of cols.main) {
    item.render(my);
    my += item.height;
  }

  // Footer: hairline + app name and address.
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(MARGIN, H - FOOTER_H);
  ctx.lineTo(W - MARGIN, H - FOOTER_H);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = MUTED;
  ctx.font = `400 ${24}px ${bodyFamily}`;
  ctx.fillText(`${data.labels.appName}  ·  ${data.url.replace('https://', '')}`, W / 2, H - FOOTER_H / 2 + 18);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('render failed');
  return blob;
}
