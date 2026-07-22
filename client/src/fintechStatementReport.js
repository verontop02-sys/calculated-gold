/**
 * PDF-выписка по счёту fintech-кабинета: портфель + история операций.
 * Переиспользует общий движок печати отчётов (client/src/reportPrint.js).
 */
import {
  escapeHtml,
  readTheme,
  formatReportDate,
  reportBlock,
  buildReportHtml,
  openReportPrint,
  kpiCardHtml,
} from './reportPrint.js';

const ENTRY_LABELS = {
  deposit_rub: 'Пополнение',
  withdraw_rub: 'Вывод',
  buy_gold: 'Покупка золота',
  sell_gold: 'Продажа золота',
  fee: 'Комиссия',
  correction: 'Корректировка',
};

function formatMoney(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Number(n));
}

function formatGrams(n) {
  if (n == null || !Number.isFinite(Number(n)) || Number(n) === 0) return '—';
  return `${Number(n).toFixed(4)} г`;
}

function formatDateTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export async function openFintechStatementReport({ clientName, phoneMasked, portfolio = {}, entries = [] } = {}) {
  const theme = readTheme();
  const generatedAt = formatReportDate();

  const rows = entries
    .map((e) => {
      const label = ENTRY_LABELS[e.entryType] || e.entryType;
      const rubSign = e.rubDelta > 0 ? '+' : '';
      const gramsSign = e.goldGramsDelta > 0 ? '+' : '';
      return `
      <tr>
        <td>${escapeHtml(formatDateTime(e.createdAt))}</td>
        <td>${escapeHtml(label)}</td>
        <td class="num">${e.rubDelta ? `${rubSign}${formatMoney(e.rubDelta)}` : '—'}</td>
        <td class="num">${e.goldGramsDelta ? `${gramsSign}${formatGrams(e.goldGramsDelta)}` : '—'}</td>
        <td class="num">${e.ratePerGram ? formatMoney(e.ratePerGram) : '—'}</td>
      </tr>`;
    })
    .join('');

  const blocks = [
    reportBlock(
      'Портфель на текущий момент',
      `<div class="r-kpis">
        ${kpiCardHtml({ icon: 'gold', hero: true, label: 'Золото, г', valueHtml: formatGrams(portfolio.goldGrams) })}
        ${kpiCardHtml({ icon: 'money', label: 'Стоимость портфеля', valueHtml: formatMoney(portfolio.marketValueRub) })}
        ${kpiCardHtml({ icon: 'avg', label: 'Вложено', valueHtml: formatMoney(portfolio.investedRub) })}
        ${kpiCardHtml({
          icon: 'money',
          tone: (portfolio.pnlRub ?? 0) >= 0 ? 'emerald' : '',
          label: 'Доход',
          valueHtml: `${formatMoney(portfolio.pnlRub)}${portfolio.pnlPercent != null ? ` (${portfolio.pnlPercent > 0 ? '+' : ''}${portfolio.pnlPercent}%)` : ''}`,
        })}
      </div>`
    ),
    reportBlock(
      'История операций',
      `<div class="r-table-wrap">
        <table class="r-table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Операция</th>
              <th class="num">Сумма, ₽</th>
              <th class="num">Золото, г</th>
              <th class="num">Курс, ₽/г</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="5" class="r-empty">Операций пока нет</td></tr>'}</tbody>
        </table>
      </div>`
    ),
  ];

  return openReportPrint({
    title: 'Выписка по счёту — Reaktivo Invest',
    fileName: `Выписка — ${clientName || phoneMasked || 'клиент'}`,
    bodyHtml: buildReportHtml({
      header: {
        sectionTitle: 'Выписка по счёту',
        authorName: clientName || phoneMasked || '',
        generatedAt,
      },
      blocks,
    }),
    theme,
  });
}
