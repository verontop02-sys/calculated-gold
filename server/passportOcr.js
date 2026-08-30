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

  // У модели passport номер часто лежит в number / passport_number / document_number
  let seriesNumber = entityText(
    entities,
    /passport.*number|document.*number|series.*number|^(number|серия|номер)$/i
  );
  // Иногда серия и номер отдельными entities
  if (!seriesNumber) {
    const seria = entityText(entities, /^(seria|series|серия)$/i);
    const number = entityText(entities, /^(number|номер)$/i);
    if (seria || number) seriesNumber = normSpaces(`${seria} ${number}`);
  }
  seriesNumber = normalizeSeriesNumber(seriesNumber);

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

function normalizeSeriesNumber(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  const m = String(raw || '').match(/\b(\d{2}\s?\d{2})\s+(\d{6})\b/);
  if (m) return `${m[1].replace(/\s/g, '')} ${m[2]}`;
  return normSpaces(raw);
}

function normalizeDate(raw) {
  const m = String(raw || '').match(/(\d{2})[.\s/-](\d{2})[.\s/-](\d{4})/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : normSpaces(raw);
}

function extractFromLines(lines) {
  const joined = lines.join(' ');
  const seriesMatch =
    joined.match(/\b(\d{2}\s?\d{2})\s+(\d{6})\b/) || joined.match(/\b(\d{4})\s+(\d{6})\b/);
  const seriesNumber = seriesMatch
    ? `${seriesMatch[1].replace(/\s/g, '')} ${seriesMatch[2]}`
    : '';
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
      if (!out[k]) out[k] = p[k];
    }
  }
  return out;
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

  // Если модель passport недодала серию/номер или ФИО — добираем общим OCR page
  if (!merged.seriesNumber || !merged.fullName) {
    const page = await callYandexVisionOcr(base64Image, 'page');
    const pageFields = extractFromLines(page.lines.length ? page.lines : page.fullText.split(/\n+/));
    merged = mergeFields(merged, pageFields);
    if (!rawText) rawText = page.fullText;
    else if (page.fullText && page.fullText.length > rawText.length) rawText = page.fullText;
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
