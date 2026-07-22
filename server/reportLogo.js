/**
 * Логотип для PDF-отчётов.
 *
 * Исходный logo_reactivo1.png — 6040×6040 px. Если встроить его как есть,
 * pdfkit/pdfmake разворачивает картинку в сырой RGBA (~146 МБ) и при обработке
 * альфа-канала разово потребляет ~570 МБ — это превышает лимит памяти Render
 * (512 МБ) и роняет процесс (OOM). Поэтому логотип один раз уменьшается до
 * небольшого размера и кэшируется как data-URI.
 */

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CANDIDATES = [
  join(__dirname, '..', 'client', 'public', 'logo-reaktivo-mark.svg'),
  join(__dirname, '..', 'client', 'public', 'logo_reactivo1.png'),
  join(__dirname, '..', 'logo_reactivo1.png'),
];

const MAX_PX = 160; // запас под Retina; встраивание такой картинки стоит копейки

let _cache; // string | null после первой попытки

/** Возвращает маленький data:image/png или null. Кэшируется после первого вызова. */
export async function getReportLogoDataUri() {
  if (_cache !== undefined) return _cache;
  _cache = null;
  for (const p of CANDIDATES) {
    try {
      const img = await loadImage(p);
      const scale = Math.min(MAX_PX / img.width, MAX_PX / img.height, 1);
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = createCanvas(w, h);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const buf = await canvas.encode('png');
      if (buf?.length) {
        _cache = `data:image/png;base64,${buf.toString('base64')}`;
        break;
      }
    } catch {
      /* пробуем следующий путь */
    }
  }
  return _cache;
}
