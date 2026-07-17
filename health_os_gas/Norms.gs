// ===== МЕДИЦИНСКИЕ НОРМЫ =====
// Встроенные нормы + переопределения из листа Справочник_Анализов + личные
// нормы из листа Личные_Нормы + показатели, добавленные пользователем с нуля
// (которых нет в этом коде, например МНО). Полный аналог core/norms.py.

var NORMS = {
  hemoglobin: { label: 'Гемоглобин', unit: 'г/л', male: [130, 170], female: [120, 155] },
  rbc: { label: 'Эритроциты', unit: '×10¹²/л', male: [4.0, 5.5], female: [3.7, 4.7] },
  wbc: { label: 'Лейкоциты', unit: '×10⁹/л', male: [4.0, 9.0], female: [4.0, 9.0] },
  platelets: { label: 'Тромбоциты', unit: '×10⁹/л', male: [150, 400], female: [150, 400] },
  glucose: { label: 'Глюкоза', unit: 'ммоль/л', male: [3.9, 6.1], female: [3.9, 6.1] },
  cholesterol: { label: 'Холестерин общий', unit: 'ммоль/л', male: [0, 5.2], female: [0, 5.2] },
  hdl: { label: 'ЛПВП (хороший холестерин)', unit: 'ммоль/л', male: [1.0, 99], female: [1.2, 99] },
  ldl: { label: 'ЛПНП (плохой холестерин)', unit: 'ммоль/л', male: [0, 3.4], female: [0, 3.4] },
  alt: { label: 'АЛТ', unit: 'Ед/л', male: [0, 41], female: [0, 31] },
  ast: { label: 'АСТ', unit: 'Ед/л', male: [0, 40], female: [0, 32] },
  ferritin: { label: 'Ферритин', unit: 'нг/мл', male: [30, 300], female: [12, 150] },
  vitaminD: { label: 'Витамин D', unit: 'нг/мл', male: [30, 100], female: [30, 100] },
  tsh: { label: 'ТТГ (щитовидная железа)', unit: 'мЕд/л', male: [0.4, 4.0], female: [0.4, 4.0] },
  creatinine: { label: 'Креатинин', unit: 'мкмоль/л', male: [62, 115], female: [53, 97] },
  uricAcid: { label: 'Мочевая кислота', unit: 'мкмоль/л', male: [208, 428], female: [155, 357] },
  vitaminB12: { label: 'Витамин B12', unit: 'пг/мл', male: [200, 900], female: [200, 900] },
  iron: { label: 'Железо сывороточное', unit: 'мкмоль/л', male: [11.6, 31.3], female: [9.0, 30.4] },
  systolic: { label: 'Давление систолическое', unit: 'мм рт.ст.', male: [90, 130], female: [90, 130] },
  diastolic: { label: 'Давление диастолическое', unit: 'мм рт.ст.', male: [60, 85], female: [60, 85] }
};

var INDICATOR_ALIASES = {
  hemoglobin: ['гемоглобин', 'гем'],
  rbc: ['эритроциты', 'эритроц'],
  wbc: ['лейкоциты', 'лейк'],
  platelets: ['тромбоциты', 'тромб'],
  glucose: ['глюкоза', 'сахар'],
  cholesterol: ['холестерин общий', 'холестерин'],
  hdl: ['лпвп', 'хороший холестерин'],
  ldl: ['лпнп', 'плохой холестерин'],
  alt: ['алт'],
  ast: ['аст'],
  ferritin: ['ферритин'],
  vitaminD: ['витамин д', 'витамин d', 'вит д', 'вит д3', 'витамин д3'],
  tsh: ['ттг'],
  creatinine: ['креатинин'],
  uricAcid: ['мочевая кислота', 'мочевая'],
  vitaminB12: ['витамин б12', 'витамин b12', 'в12', 'b12', 'вит б12'],
  iron: ['железо сывороточное', 'железо'],
  systolic: ['систолическое', 'верхнее давление'],
  diastolic: ['диастолическое', 'нижнее давление']
};

// Состояние, которое подтягивается из таблицы перед каждым разбором/сверкой.
// Аналог _norm_overrides / _custom_indicators в Python-версии.
var _normOverrides = {};      // { key: { male:[min,max], female:[min,max] } } — для встроенных
var _customIndicators = {};   // { key: { label, male:[min,max]|null, female:[min,max]|null } } — свои

/** «120-155» → [120, 155]; пусто/мусор → null. */
function parseNormRange_(text) {
  if (text == null) return null;
  var m = String(text).match(/^\s*(-?\d+(?:[.,]\d+)?)\s*-\s*(-?\d+(?:[.,]\d+)?)\s*$/);
  if (!m) return null;
  return [parseFloat(m[1].replace(',', '.')), parseFloat(m[2].replace(',', '.'))];
}

/**
 * Подтянуть Справочник_Анализов и (если задан memberId) Личные_Нормы в
 * _normOverrides/_customIndicators. Вызывается перед каждым разбором текста
 * и сверкой — правки в таблице подхватываются мгновенно, без «перезапуска».
 */
function refreshCatalog_(memberId) {
  _normOverrides = {};
  _customIndicators = {};

  readAll_(SHEET_CATALOG).forEach(function (row) {
    var key = String(row['Код (indicator_key)'] || '').trim();
    var label = String(row['Русское название'] || '').trim();
    if (!key || !label) return;

    var male = parseNormRange_(row['Норма (мужчины)']);
    var female = parseNormRange_(row['Норма (женщины)']);
    if (male || female) { male = male || female; female = female || male; }

    if (NORMS[key]) {
      if (male || female) _normOverrides[key] = { male: male, female: female };
    } else {
      _customIndicators[key] = { label: label, male: male, female: female };
    }
  });

  if (!memberId) return;

  readAll_(SHEET_PERSONAL_NORMS).forEach(function (row) {
    if (String(row['family_member_id'] || '').trim() !== memberId) return;
    var key = String(row['Код (indicator_key)'] || '').trim();
    var range = parseNormRange_(row['Норма']);
    if (!key || !range) return;
    // Личная норма перекрывает всё остальное (одна на оба пола).
    if (NORMS[key]) _normOverrides[key] = { male: range, female: range };
    else _customIndicators[key] = { label: _customIndicators[key] ? _customIndicators[key].label : key, male: range, female: range };
  });
}

/** Русское название показателя — из NORMS или из справочника. */
function indicatorLabel_(key) {
  if (NORMS[key]) return NORMS[key].label;
  if (_customIndicators[key]) return _customIndicators[key].label;
  return key;
}

function indicatorUnit_(key) {
  return NORMS[key] ? NORMS[key].unit : '';
}

/**
 * Сверить значение с нормой по полу. null — если показатель неизвестен или
 * норма для него нигде не задана (значение всё равно сохраняется, просто без
 * статуса). Возвращает { status:'normal'|'low'|'high', min, max, label, unit }.
 */
function checkNorm_(key, value, gender) {
  var range, label, unit;
  if (NORMS[key]) {
    var base = NORMS[key];
    var ov = _normOverrides[key];
    range = ov ? (gender === 'female' ? ov.female : ov.male) : (gender === 'female' ? base.female : base.male);
    label = base.label; unit = base.unit;
  } else if (_customIndicators[key]) {
    var c = _customIndicators[key];
    if (!c.male && !c.female) return null;
    range = gender === 'female' ? (c.female || c.male) : (c.male || c.female);
    label = c.label; unit = '';
  } else {
    return null;
  }
  var status = 'normal';
  if (value < range[0]) status = 'low';
  else if (value > range[1]) status = 'high';
  return { status: status, min: range[0], max: range[1], label: label, unit: unit };
}

/** Сопоставить свободный текст с ключом показателя. Длинный алиас побеждает. */
function matchIndicatorKey_(text) {
  var norm = text.toLowerCase().trim();
  var best = null, bestLen = 0;
  Object.keys(INDICATOR_ALIASES).forEach(function (key) {
    INDICATOR_ALIASES[key].forEach(function (alias) {
      if (norm.indexOf(alias) !== -1 && alias.length > bestLen) { best = key; bestLen = alias.length; }
    });
  });
  Object.keys(_customIndicators).forEach(function (key) {
    var alias = _customIndicators[key].label.toLowerCase();
    if (norm.indexOf(alias) !== -1 && alias.length > bestLen) { best = key; bestLen = alias.length; }
  });
  return best;
}

/**
 * Разобрать «гемоглобин 135, глюкоза 5.2, давление 120/80» в { key: value }.
 * Запятая — и разделитель, и десятичный знак: не режем по запятой перед цифрой.
 */
function parseAnalysisText_(text) {
  var results = {};
  var remaining = text;

  var bp = text.match(/давлен\w*\D{0,10}(\d{2,3})\s*\/\s*(\d{2,3})/i);
  if (bp) {
    results.systolic = parseFloat(bp[1]);
    results.diastolic = parseFloat(bp[2]);
    remaining = remaining.replace(bp[0], '');
  }

  remaining.split(/[;\n]|,(?!\d)/).forEach(function (part) {
    part = part.trim();
    if (!part) return;
    var m = part.match(/^(.*?)(-?\d+(?:[.,]\d+)?)\s*$/);
    if (!m) return;
    var name = m[1].trim();
    if (!name) return;
    var value = parseFloat(m[2].replace(',', '.'));
    if (isNaN(value)) return;
    var key = matchIndicatorKey_(name);
    if (key) results[key] = value;
  });

  return results;
}
