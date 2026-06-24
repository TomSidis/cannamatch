const AXIS_HUMAN = {
  antiAnxiety: 'חרדה',
  sleep:       'שינה',
  antiPain:    'כאב',
  bodyCalm:    'הרגעה',
  clearHead:   'ריכוז',
  mood:        'מצב רוח',
  appetite:    'תיאבון',
};

export default function BatchSignalBadge({ axis, n, adverseRate }) {
  if (!axis || n < 5 || adverseRate < 0.6) return null;
  return (
    <span style={{
      fontSize: 10,
      padding: '2px 8px',
      borderRadius: 4,
      border: '1px solid rgba(251,191,36,0.3)',
      background: 'rgba(251,191,36,0.06)',
      color: '#FBBF24',
      display: 'inline-block',
      marginTop: 4,
    }}>
      מטופלים דיווחו על {AXIS_HUMAN[axis] ?? axis} באצווה זו — כדאי לשים לב 🔍
    </span>
  );
}
