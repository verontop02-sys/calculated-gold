/**
 * Скан паспорта РФ → подсказка для формы договора: ФИО, серия/номер, дата и орган выдачи,
 * дата рождения (нужна для ГИЗДМДК и для точного сопоставления при проверке в МВД).
 * Распознавание — Yandex Vision OCR. Сначала модель `passport` (размеченные entities),
 * при дырах в полях — добор через `page` + regex. Поля остаются редактируемыми.
 *
 * Env: YANDEX_VISION_API_KEY, YANDEX_FOLDER_ID
 */

const OCR_ENDPOINT = 'https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText';

export function passportOcrConfigured() {
  // Folder id можем подставить сами (см. resolveFolderId) — достаточно ключа.
  return Boolean(process.env.YANDEX_VISION_API_KEY);
}

/** Folder id каталога, к которому привязан API-ключ. На Render иногда по ошибке
 *  кладут id сервисного аккаунта (ajeu…) — Vision отвечает 400; подменяем на верный. */
const SERVICE_FOLDER_ID = 'b1gej4vpheq8jhttbekk';
const WRONG_ACCOUNT_ID = 'ajeu64vj3mner9ke7nbq';

function resolveFolderId() {
  const raw = String(process.env.YANDEX_FOLDER_ID || '').trim();
  if (!raw || raw === WRONG_ACCOUNT_ID) return SERVICE_FOLDER_ID;
  return raw;
}

async function callYandexVisionOcr(base64Image, model) {
  const apiKey = process.env.YANDEX_VISION_API_KEY;
  const folderId = resolveFolderId();
  const res = await fetch(OCR_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Api-Key ${apiKey}`,
      'x-folder-id': folderId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      mimeType: 'JPEG',
      languageCodes: ['ru'],
      model,
      content: base64Image,
    }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Yandex Vision вернул не-JSON (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(json?.message || json?.error?.message || `Ошибка распознавания (${res.status})`);
  }
  const annotation = json?.result?.textAnnotation || {};
  const entities = Array.isArray(annotation.entities) ? annotation.entities : [];
  const blocks = Array.isArray(annotation.blocks) ? annotation.blocks : [];
  const lines = [];
  for (const block of blocks) {
    for (const line of block?.lines || []) {
      const words = (line?.words || []).map((w) => w?.text || '').filter(Boolean);
      const lineText = words.length ? words.join(' ') : String(line?.text || '').trim();
      if (lineText) lines.push(lineText);
    }
  }
  return {
    entities,
    lines,
    fullText: String(annotation.fullText || lines.join('\n')).trim(),
  };
}

function normSpaces(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function entityText(entities, nameRe) {
  const hit = entities.find((e) => nameRe.test(String(e?.name || '')));
  return hit ? normSpaces(hit.text) : '';
}

function extractFromEntities(entities) {
  const surname = entityText(entities, /surname|last.?name|фамили/i);
  const firstName = entityText(entities, /^(name|first.?name|имя)$/i);
  const patronymic = entityText(entities, /patronymic|middle.?name|отчеств/i);
  const fullName = [surname, firstName, patronymic]
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');

  // Серия и номер на паспорте РФ напечатаны красным и часто приходят
  // разными полями (series + number) или одной строкой number.
  const numberParts = [];
  for (const e of entities || []) {
    const name = String(e?.name || '');
    if (/number|seria|series|номер|серия/i.test(name)) numberParts.push(normSpaces(e?.text));
  }
  let seriesNumber = extractSeriesNumberFromText(numberParts.join('\n'));
  if (!seriesNumber) {
    seriesNumber = extractSeriesNumberFromText((entities || []).map((e) => normSpaces(e?.text)).join('\n'));
  }

  const issueDate = normalizeDate(
    entityText(entities, /issue.?date|date.?issue|дата.?выдач/i)
  );
  const deptCode = entityText(
    entities,
    /department|subdivision|unit.?code|код.?подраздел/i
  );
  const issuedBy = entityText(entities, /issu.?by|authority|issued.?by|кем.?выдан|орган/i);
  // ГИЗДМДК требует дату рождения при регистрации сделки — берём отдельной entity,
  // чтобы не спутать с датой выдачи паспорта (обе даты часто рядом на разворе).
  const birthDate = normalizeDate(
    entityText(entities, /birth.?date|date.?of.?birth|дата.?рожд/i)
  );

  return { fullName, seriesNumber, issueDate, deptCode, issuedBy, birthDate };
}

function formatTenDigits(digits) {
  if (!/^\d{10}$/.test(digits)) return '';
  return `${digits.slice(0, 4)} ${digits.slice(4)}`;
}

/** Серия и номер паспорта РФ: 4 + 6 цифр. Пустая строка, если собрать их нельзя. */
export function extractSeriesNumberFromText(raw) {
  let text = String(raw || '').replace(/\u00a0/g, ' ');
  text = text.replace(/\d{2}[.\-/]\d{2}[.\-/]\d{4}/g, ' ');
  text = text.replace(/\d{3}-\d{3}/g, ' ');

  const spaced = text.match(/\b(\d{2})\s*(\d{2})\s+(\d{6})\b/)
    || text.match(/\b(\d{4})\s+(\d{6})\b/)
    || text.match(/\b(\d{2})\s*(\d{2})\s*№\s*(\d{6})\b/i);
  if (spaced) {
    const formatted = formatTenDigits(spaced.slice(1).join('').replace(/\D/g, ''));
    if (formatted) return formatted;
  }

  const lines = text.split(/\n+/);
  for (let i = 0; i < lines.length - 1; i += 1) {
    const a = lines[i].trim();
    const b = lines[i + 1].replace(/\s/g, '');
    const aCompact = a.replace(/\s/g, '');
    if ((/^\d{4}$/.test(aCompact) || /^\d{2}\s\d{2}$/.test(a)) && /^\d{6}$/.test(b)) {
      return `${aCompact} ${b}`;
    }
  }

  const singles = text.match(/(?:^|[^\d])((?:\d\s+){9}\d)(?=[^\d]|$)/);
  if (singles) {
    const formatted = formatTenDigits(singles[1].replace(/\s/g, ''));
    if (formatted) return formatted;
  }

  const ten = text.match(/(?:^|\D)(\d{10})(?=\D|$)/);
  return ten ? formatTenDigits(ten[1]) : '';
}

function isSeriesNumber(s) {
  return /^\d{4} \d{6}$/.test(String(s || '').trim());
}

function normalizeSeriesNumber(raw) {
  return extractSeriesNumberFromText(raw);
}

function normalizeDate(raw) {
  const m = String(raw || '').match(/(\d{2})[.\s/-](\d{2})[.\s/-](\d{4})/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : normSpaces(raw);
}

function extractFromLines(lines) {
  const seriesNumber = extractSeriesNumberFromText(lines.join('\n'));
  const joined = lines.join(' ');
  const deptMatch = joined.match(/\b(\d{3}-\d{3})\b/);
  const deptCode = deptMatch ? deptMatch[1] : '';

  let issueDate = '';
  for (let i = 0; i < lines.length; i += 1) {
    if (/выдач/i.test(lines[i])) {
      const window = `${lines[i]} ${lines[i + 1] || ''} ${lines[i + 2] || ''}`;
      const m = window.match(/\b(\d{2}[.\s]\d{2}[.\s]\d{4})\b/);
      if (m) {
        issueDate = m[1].replace(/\s/g, '.');
        break;
      }
    }
  }
  if (!issueDate) {
    const m = joined.match(/\b(\d{2}\.\d{2}\.\d{4})\b/);
    if (m) issueDate = m[1];
  }

  // Дата рождения ищется рядом со строкой «дата рождения» отдельно от даты выдачи —
  // на развороте они рядом, простое «первая найденная дата» их бы перепутало.
  let birthDate = '';
  for (let i = 0; i < lines.length; i += 1) {
    if (/дата\s*рожд/i.test(lines[i])) {
      const window = `${lines[i]} ${lines[i + 1] || ''} ${lines[i + 2] || ''}`;
      const m = window.match(/\b(\d{2}[.\s]\d{2}[.\s]\d{4})\b/);
      if (m) {
        birthDate = m[1].replace(/\s/g, '.');
        break;
      }
    }
  }

  // ФИО на развороте паспорта почти всегда тремя отдельными словами-строками CAPS
  const header =
    /российс|федерац|паспорт|министер|внутренн|дел|миграц|служба|кем\s*выдан|дата|код\s*под|муж|жен|отдел|уфмс|мвд|овд|город|област|район|гражданин/i;
  const singleCaps = /^[А-ЯЁ]{2,}$/;
  const fioWords = [];
  for (const raw of lines) {
    const l = normSpaces(raw);
    if (singleCaps.test(l) && !header.test(l)) fioWords.push(l);
  }
  let fullName = '';
  if (fioWords.length >= 3) fullName = fioWords.slice(0, 3).join(' ');
  else if (fioWords.length === 2) fullName = fioWords.join(' ');
  else if (fioWords.length === 1) fullName = fioWords[0];

  let issuedBy = '';
  const startIdx = lines.findIndex((l) => /кем\s*выдан/i.test(l));
  if (startIdx !== -1) {
    const collected = [];
    const startLine = lines[startIdx].replace(/.*кем\s*выдан[:\s]*/i, '').trim();
    if (startLine) collected.push(startLine);
    for (let i = startIdx + 1; i < lines.length && i < startIdx + 5; i += 1) {
      const l = lines[i];
      if (/выдач|\d{3}-\d{3}|дата\s*рожд/i.test(l)) break;
      collected.push(l);
    }
    issuedBy = normSpaces(collected.join(' '));
  } else {
    const org = lines.find((l) => /УФМС|МВД|ОВД|ГУ\s*МВД|ОТДЕЛ/i.test(l) && l.length > 10);
    if (org) issuedBy = normSpaces(org);
  }

  return { fullName, seriesNumber, issueDate, deptCode, issuedBy, birthDate };
}

function nameWordCount(s) {
  return String(s || '').trim().split(/\s+/).filter(Boolean).length;
}

function mergeFields(...parts) {
  const out = { fullName: '', seriesNumber: '', issueDate: '', deptCode: '', issuedBy: '', birthDate: '' };
  for (const p of parts) {
    for (const k of Object.keys(out)) {
      if (!p?.[k]) continue;
      // ФИО: берём вариант с большим числом слов (entities иногда без фамилии)
      if (k === 'fullName') {
        if (nameWordCount(p[k]) > nameWordCount(out[k])) out[k] = p[k];
        continue;
      }
      if (k === 'seriesNumber') {
        const next = normalizeSeriesNumber(p[k]);
        if (isSeriesNumber(next) && !isSeriesNumber(out[k])) out[k] = next;
        else if (!out[k] && next) out[k] = next;
        continue;
      }
      if (!out[k]) out[k] = p[k];
    }
  }
  return out;
}

/** Красная серия и номер на фото часто не читаются обычным OCR. Затемняем красные штрихи. */
async function emphasizeRedInk(base64Image) {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const img = await loadImage(Buffer.from(base64Image, 'base64'));
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const px = imageData.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const redness = r - Math.max(g, b);
    const gray = 0.3 * r + 0.59 * g + 0.11 * b;
    const v = redness > 28 && r > 80 ? 0 : gray;
    const out = Math.max(0, Math.min(255, Math.round(v)));
    px[i] = out;
    px[i + 1] = out;
    px[i + 2] = out;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toBuffer('image/jpeg').toString('base64');
}

function hasUsefulFields(f) {
  return Boolean(f.fullName || f.seriesNumber || f.issueDate || f.deptCode || f.issuedBy || f.birthDate);
}

/**
 * Распознаёт скан/фото главной страницы паспорта РФ.
 */
export async function recognizePassportImage(base64Image) {
  if (!passportOcrConfigured()) {
    const err = new Error('Сканирование паспорта не настроено (нет ключа Yandex Vision на сервере)');
    err.status = 503;
    throw err;
  }

  const passport = await callYandexVisionOcr(base64Image, 'passport');
  let fromEntities = extractFromEntities(passport.entities);
  let fromLines = extractFromLines(passport.lines);
  let merged = mergeFields(fromEntities, fromLines);
  let rawText = passport.fullText;

  async function fillFromPage(image) {
    const page = await callYandexVisionOcr(image, 'page');
    const pageFields = extractFromLines(page.lines.length ? page.lines : page.fullText.split(/\n+/));
    merged = mergeFields(merged, pageFields);
    if (!rawText) rawText = page.fullText;
    else if (page.fullText && page.fullText.length > rawText.length) rawText = page.fullText;
  }

  async function fillFromRedInk() {
    try {
      const red = await emphasizeRedInk(base64Image);
      const again = await callYandexVisionOcr(red, 'passport');
      merged = mergeFields(
        merged,
        extractFromEntities(again.entities),
        extractFromLines(again.lines.length ? again.lines : again.fullText.split(/\n+/)),
      );
      if (again.fullText && again.fullText.length > (rawText || '').length) rawText = again.fullText;
    } catch (e) {
      console.warn('[passport ocr] red-ink pass', e?.message || e);
    }
  }

  // ФИО уже есть, а серии нет: красные цифры, не гоняем общий OCR ещё раз.
  if (merged.fullName && !isSeriesNumber(merged.seriesNumber)) {
    await fillFromRedInk();
  } else if (!merged.fullName || !isSeriesNumber(merged.seriesNumber)) {
    await fillFromPage(base64Image);
    if (!isSeriesNumber(merged.seriesNumber)) await fillFromRedInk();
  }

  if (!hasUsefulFields(merged) && !rawText) {
    const err = new Error('Не удалось распознать текст на фото. Переснимите при хорошем освещении, без бликов');
    err.status = 422;
    throw err;
  }

  // Title-case ФИО, если пришло нижним регистром от entities
  if (merged.fullName && merged.fullName === merged.fullName.toLowerCase()) {
    merged.fullName = merged.fullName
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  const passportLineParts = [];
  if (merged.seriesNumber) passportLineParts.push(merged.seriesNumber);
  if (merged.issuedBy) passportLineParts.push(merged.issuedBy);
  if (merged.issueDate) passportLineParts.push(`выдан ${merged.issueDate}`);
  if (merged.deptCode) passportLineParts.push(`код подразделения ${merged.deptCode}`);

  return {
    fullName: merged.fullName || '',
    seriesNumber: merged.seriesNumber || '',
    issueDate: merged.issueDate || '',
    deptCode: merged.deptCode || '',
    issuedBy: merged.issuedBy || '',
    birthDate: merged.birthDate || '',
    passportLine: passportLineParts.join(', '),
    rawText: rawText || '',
  };
}
