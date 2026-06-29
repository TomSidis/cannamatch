/**
 * NewOnMarket — "חדש בשוק" section.
 * Shows recently detected commercial strain names sorted by first_seen_at.
 * Auto-approved (match_confidence ≥ 0.90) appear directly; others are pending.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../services/api.js';

const C = {
  bg:     '#0B1810',
  card:   'rgba(15,30,19,0.90)',
  border: 'rgba(57,255,133,0.16)',
  accent: '#39FF85',
  text:   '#EBF6ED',
  muted:  '#7EA88E',
  new:    'rgba(57,255,133,0.12)',
};

function daysSince(iso) {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso)) / 86_400_000);
  if (d === 0) return 'היום';
  if (d === 1) return 'אתמול';
  return `לפני ${d} ימים`;
}

function ConfBadge({ confidence, method }) {
  if (!confidence) return null;
  const pct = Math.round(confidence * 100);
  const color = pct >= 90 ? C.accent : pct >= 70 ? '#FBBF24' : C.muted;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, color,
      background: `${color}18`, border: `1px solid ${color}44`,
      borderRadius: 6, padding: '2px 6px', letterSpacing: '0.04em',
    }}>
      {pct}% {method === 'exact' ? '✓' : method === 'fuzzy' ? '≈' : ''}
    </span>
  );
}

function SkuCard({ item, idx }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.03 }}
      style={{
        borderRadius: 14, padding: '12px 14px',
        background: C.card, border: `1px solid ${C.border}`,
        marginBottom: 8, direction: 'rtl',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 4 }}>
            {item.commercial_name}
          </div>
          {item.genetics_display && (
            <div style={{ fontSize: 11, color: C.accent, fontWeight: 600, marginBottom: 3 }}>
              → {item.genetics_display}
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
            {item.grower && (
              <span style={{ fontSize: 10, color: C.muted }}>{item.grower}</span>
            )}
            {item.category && (
              <span style={{ fontSize: 10, color: 'rgba(251,191,36,0.75)', background: 'rgba(251,191,36,0.08)',
                borderRadius: 5, padding: '1px 6px', border: '1px solid rgba(251,191,36,0.20)' }}>
                {item.category}
              </span>
            )}
            {item.terpene_rank?.length > 0 && (
              <span style={{ fontSize: 10, color: C.muted }}>
                {item.terpene_rank.slice(0, 3).join(' · ')}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <ConfBadge confidence={item.match_confidence} method={item.match_method} />
          <span style={{ fontSize: 9, color: C.muted }}>{daysSince(item.first_seen_at)}</span>
          {item.source_display && (
            <span style={{ fontSize: 9, color: 'rgba(126,168,142,0.45)' }}>{item.source_display}</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function NewOnMarket({ limit = 20 }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getNewOnMarket(limit)
      .then(({ items: list }) => setItems(list || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [limit]);

  if (loading) {
    return (
      <div style={{ padding: '24px 16px', textAlign: 'center', color: C.muted, fontSize: 12, direction: 'rtl' }}>
        טוען זנים חדשים…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div style={{ padding: '32px 16px', textAlign: 'center', direction: 'rtl' }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>🌱</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 6 }}>
          עוד אין זנים חדשים
        </div>
        <div style={{ fontSize: 11, color: C.muted }}>
          הסריקה היומית רצה ב-07:00 ותעדכן כאן
        </div>
      </div>
    );
  }

  return (
    <div style={{ direction: 'rtl' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14, padding: '0 2px' }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: C.text, margin: 0 }}>
          🌿 חדש בשוק
        </h2>
        <span style={{ fontSize: 10, color: C.muted }}>{items.length} זנים</span>
      </div>
      <AnimatePresence>
        {items.map((item, idx) => (
          <SkuCard key={item.id} item={item} idx={idx} />
        ))}
      </AnimatePresence>
    </div>
  );
}
