// Clinical safety helpers: allergy checks, dispense quantities and lab result flags.

// A recorded allergy to a drug class also blocks the members of that class.
const ALLERGY_CLASSES = {
  penicillin: ['penicillin', 'amoxicillin', 'ampicillin', 'cloxacillin', 'flucloxacillin'],
  sulfonamide: ['sulfa', 'sulpha', 'sulfamethoxazole', 'co-trimoxazole'],
  aspirin: ['aspirin', 'acetylsalicylic'],
  nsaid: ['ibuprofen', 'diclofenac', 'naproxen', 'aspirin', 'mefenamic'],
};

function allergyConflicts(allergyText, medicines) {
  if (!allergyText) return [];
  const terms = allergyText.toLowerCase().split(/[,;/]+/).map((s) => s.trim()).filter(Boolean)
    .flatMap((a) => {
      const cls = Object.keys(ALLERGY_CLASSES).find((k) => a.includes(k.slice(0, 6)));
      return cls ? ALLERGY_CLASSES[cls] : [a];
    });
  return medicines.filter((m) => {
    const names = `${m.name} ${m.generic_name || ''}`.toLowerCase();
    return terms.some((t) => t.length >= 4 && names.includes(t));
  });
}

const DOSES_PER_DAY = { OD: 1, BD: 2, TDS: 3, QDS: 4, NOCTE: 1, PRN: 1, STAT: 1 };

function defaultQuantity(frequency, days, form) {
  if (['inhaler', 'syrup', 'cream', 'drops'].includes(form)) return 1;     // one pack
  if (frequency === 'STAT') return 1;
  return Math.max(1, (DOSES_PER_DAY[frequency] || 1) * days);
}

// L = low, N = normal, H = high, A = abnormal (for non-numeric ranges such as "Negative")
function labFlag(referenceRange, value) {
  const v = String(value).trim();
  const m = /^([\d.]+)\s*-\s*([\d.]+)$/.exec(referenceRange);
  if (!m) return v.toLowerCase() === referenceRange.toLowerCase() ? 'N' : 'A';
  const num = Number(v);
  if (!Number.isFinite(num)) return 'A';
  if (num < Number(m[1])) return 'L';
  if (num > Number(m[2])) return 'H';
  return 'N';
}

module.exports = { allergyConflicts, defaultQuantity, labFlag };
