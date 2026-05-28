/**
 * Семейство skeleton-компонентов для состояний загрузки.
 *
 * Использование:
 *   import { Skeleton, SkeletonCard, SkeletonRow, SkeletonStats, SkeletonChart } from './Skeleton.jsx';
 *
 *   {loading ? <SkeletonCard rows={4} /> : <RealCard ... />}
 *
 * Принципы:
 *   - Имитируем РЕАЛЬНУЮ структуру контента (а не один спиннер).
 *   - Несколько строк с разной шириной, чтобы выглядело живо.
 *   - Анимация shimmer уже определена в index.css (.skeleton-line).
 *   - Для тёмной и светлой темы цвета берутся из CSS-переменных.
 */

/** Универсальный «прямоугольник», тянется по ширине родителя. */
export function Skeleton({ w, h = 14, r = 6, style, className = '' }) {
  const widthStyle = w == null ? '100%' : (typeof w === 'number' ? `${w}px` : w);
  const heightStyle = typeof h === 'number' ? `${h}px` : h;
  return (
    <span
      className={`cg-skel ${className}`.trim()}
      aria-hidden
      style={{
        display: 'inline-block',
        width: widthStyle,
        height: heightStyle,
        borderRadius: r,
        background:
          'linear-gradient(90deg, var(--gold-soft) 0%, rgba(212,175,55,0.22) 50%, var(--gold-soft) 100%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.4s ease infinite',
        verticalAlign: 'middle',
        ...style,
      }}
    />
  );
}

/** Круг (для аватарок, иконок). */
export function SkeletonCircle({ size = 36, style }) {
  return <Skeleton w={size} h={size} r="50%" style={{ display: 'block', ...style }} />;
}

/**
 * Карточка с заголовком и N строк текста (имитация контентной карточки).
 *
 * @param rows количество строк после заголовка (по умолчанию 3)
 * @param showTitle показывать ли заголовок (по умолчанию true)
 */
export function SkeletonCard({ rows = 3, showTitle = true, padded = true, className = '' }) {
  const arr = Array.from({ length: rows });
  // Имитируем разную длину строк — последняя короче.
  const widths = ['96%', '88%', '74%', '92%', '60%', '82%'];
  return (
    <div
      className={`cg-skel-card ${className}`.trim()}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--stroke)',
        borderRadius: 18,
        padding: padded ? '18px 20px' : 0,
        boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
      }}
    >
      {showTitle && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
          <Skeleton w={42} h={42} r={10} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Skeleton w="48%" h={14} />
            <Skeleton w="30%" h={10} />
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {arr.map((_, i) => (
          <Skeleton key={i} w={widths[i % widths.length]} h={12} />
        ))}
      </div>
    </div>
  );
}

/** Строка для списков (имя, контакт и т.п.). */
export function SkeletonRow({ leftWidth = '60%', rightWidth = '20%', withAvatar = false }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '12px 14px',
        border: '1px solid var(--stroke-soft)',
        borderRadius: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
        {withAvatar && <SkeletonCircle size={36} />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
          <Skeleton w={leftWidth} h={12} />
          <Skeleton w="35%" h={10} />
        </div>
      </div>
      <Skeleton w={rightWidth} h={14} />
    </div>
  );
}

/** Сетка KPI-плиток (используется в Аналитике / Goldindex / TeamPerformance). */
export function SkeletonStats({ count = 4 }) {
  return (
    <div
      className="cg-skel-stats"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(200px, 1fr))`,
        gap: 12,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--stroke)',
            borderRadius: 14,
            padding: '14px 16px',
            minHeight: 90,
          }}
        >
          <Skeleton w="40%" h={10} />
          <div style={{ height: 10 }} />
          <Skeleton w="70%" h={22} />
          <div style={{ height: 6 }} />
          <Skeleton w="55%" h={10} />
        </div>
      ))}
    </div>
  );
}

/** Имитация графика (прямоугольник с «зубцами»). */
export function SkeletonChart({ height = 220 }) {
  // Сгенерируем псевдо-столбцы разной высоты, чтобы было похоже на бар-чарт.
  const bars = [62, 88, 74, 95, 50, 78, 90, 64, 82, 55, 70, 92];
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--stroke)',
        borderRadius: 14,
        padding: '14px 16px',
        height,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <Skeleton w="35%" h={12} />
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: `repeat(${bars.length}, 1fr)`,
          gap: 6,
          alignItems: 'end',
        }}
      >
        {bars.map((p, i) => (
          <Skeleton key={i} h={`${p}%`} r={4} style={{ display: 'block', width: '100%' }} />
        ))}
      </div>
    </div>
  );
}

/** Имитация прямоугольной карты (для GoldIndex). */
export function SkeletonMap({ height = 380 }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--stroke)',
        borderRadius: 14,
        padding: 14,
        height,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton w="30%" h={12} />
        <Skeleton w={80} h={28} r={999} />
      </div>
      <div
        style={{
          flex: 1,
          borderRadius: 10,
          background:
            'linear-gradient(135deg, var(--gold-soft) 0%, rgba(212,175,55,0.10) 50%, var(--gold-soft) 100%)',
          backgroundSize: '200% 200%',
          animation: 'shimmer 1.8s ease infinite',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* псевдо-пины */}
        {[
          [22, 30], [55, 45], [70, 70], [40, 75], [80, 25],
        ].map(([l, t], i) => (
          <span
            key={i}
            style={{
              position: 'absolute',
              left: `${l}%`,
              top: `${t}%`,
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: 'var(--gold)',
              boxShadow: '0 0 0 4px var(--gold-soft)',
              opacity: 0.6,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** Имитация таблицы с N строк и K колонок. */
export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--stroke)',
        borderRadius: 14,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 12,
          padding: '6px 8px',
          borderBottom: '1px solid var(--stroke-soft)',
          marginBottom: 4,
        }}
      >
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} w="60%" h={10} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 12,
            padding: '8px 8px',
          }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              w={c === 0 ? '85%' : c === cols - 1 ? '60%' : '70%'}
              h={12}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
