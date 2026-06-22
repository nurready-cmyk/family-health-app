// ===== MEDICAL NORMS =====
const Norms = {
  // key: { label, unit, male: [min, max], female: [min, max] }
  hemoglobin: {
    label: 'Гемоглобин', unit: 'г/л',
    male: [130, 170], female: [120, 155]
  },
  rbc: {
    label: 'Эритроциты', unit: '×10¹²/л',
    male: [4.0, 5.5], female: [3.7, 4.7]
  },
  wbc: {
    label: 'Лейкоциты', unit: '×10⁹/л',
    male: [4.0, 9.0], female: [4.0, 9.0]
  },
  platelets: {
    label: 'Тромбоциты', unit: '×10⁹/л',
    male: [150, 400], female: [150, 400]
  },
  glucose: {
    label: 'Глюкоза', unit: 'ммоль/л',
    male: [3.9, 6.1], female: [3.9, 6.1]
  },
  cholesterol: {
    label: 'Холестерин общий', unit: 'ммоль/л',
    male: [0, 5.2], female: [0, 5.2]
  },
  hdl: {
    label: 'ЛПВП (хороший холестерин)', unit: 'ммоль/л',
    male: [1.0, 99], female: [1.2, 99]
  },
  ldl: {
    label: 'ЛПНП (плохой холестерин)', unit: 'ммоль/л',
    male: [0, 3.4], female: [0, 3.4]
  },
  alt: {
    label: 'АЛТ', unit: 'Ед/л',
    male: [0, 41], female: [0, 31]
  },
  ast: {
    label: 'АСТ', unit: 'Ед/л',
    male: [0, 40], female: [0, 32]
  },
  ferritin: {
    label: 'Ферритин', unit: 'нг/мл',
    male: [30, 300], female: [12, 150]
  },
  vitaminD: {
    label: 'Витамин D', unit: 'нг/мл',
    male: [30, 100], female: [30, 100]
  },
  tsh: {
    label: 'ТТГ (щитовидная железа)', unit: 'мЕд/л',
    male: [0.4, 4.0], female: [0.4, 4.0]
  },
  creatinine: {
    label: 'Креатинин', unit: 'мкмоль/л',
    male: [62, 115], female: [53, 97]
  },
  uricAcid: {
    label: 'Мочевая кислота', unit: 'мкмоль/л',
    male: [208, 428], female: [155, 357]
  },
  vitaminB12: {
    label: 'Витамин B12', unit: 'пг/мл',
    male: [200, 900], female: [200, 900]
  },
  iron: {
    label: 'Железо сывороточное', unit: 'мкмоль/л',
    male: [11.6, 31.3], female: [9.0, 30.4]
  },
  systolic: {
    label: 'Давление систолическое', unit: 'мм рт.ст.',
    male: [90, 130], female: [90, 130]
  },
  diastolic: {
    label: 'Давление диастолическое', unit: 'мм рт.ст.',
    male: [60, 85], female: [60, 85]
  }
};

/**
 * Check a value against norms
 * @returns { status: 'normal'|'low'|'high', min, max, label, unit }
 */
function checkNorm(key, value, gender) {
  const norm = Norms[key];
  if (!norm) return null;
  const range = gender === 'female' ? norm.female : norm.male;
  const [min, max] = range;
  let status = 'normal';
  if (value < min) status = 'low';
  else if (value > max) status = 'high';
  return { status, min, max, label: norm.label, unit: norm.unit };
}

/**
 * Get all analysis keys grouped
 */
const AnalysisGroups = {
  'Общий анализ крови': ['hemoglobin', 'rbc', 'wbc', 'platelets'],
  'Биохимия': ['glucose', 'cholesterol', 'hdl', 'ldl', 'alt', 'ast', 'creatinine', 'uricAcid'],
  'Микроэлементы и витамины': ['ferritin', 'iron', 'vitaminD', 'vitaminB12'],
  'Гормоны': ['tsh'],
  'Давление': ['systolic', 'diastolic']
};
