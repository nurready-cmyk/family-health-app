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
var _customIndicators = {};   // { key: { label, unit, male:[min,max]|null, female:[min,max]|null } } — свои
var _unitOverrides = {};      // { key: 'ммоль/л' } — колонка «Единицы» справочника
var _labelOverrides = {};     // { key: 'Гемоглобин' } — колонка «Показатель» справочника
var _aliasOverrides = {};     // { key: ['СРБ', 'CRP'] } — колонка «Синонимы» справочника

// Одни и те же показатели описаны дважды: в NORMS выше и в листе
// Справочник_Анализов. Раз так, договоримся, кто главный:
//   название и единицы — всегда из таблицы (её видит человек, её же читает ИИ);
//   числовые нормы     — из таблицы, если заполнены, иначе из NORMS.
// Без этого переименование показателя в таблице бот просто игнорировал:
// в колонке было одно, в ответе бота — другое, и связать их было нечем.

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
  _unitOverrides = {};
  _labelOverrides = {};
  _aliasOverrides = {};

  cachedRows_(SHEET_CATALOG).forEach(function (row) {
    var key = String(row['Код'] || '').trim();
    var label = String(row['Показатель'] || '').trim();
    if (!key || !label) return;

    var male = parseNormRange_(row['Норма (мужчины)']);
    var female = parseNormRange_(row['Норма (женщины)']);
    if (male || female) { male = male || female; female = female || male; }

    var unit = String(row['Единицы'] || '').trim();
    if (unit) _unitOverrides[key] = unit;
    _labelOverrides[key] = label;

    // «Синонимы» — чтобы новое сокращение не требовало правки кода.
    var synonyms = String(row['Синонимы'] || '').split(/[,;]/)
      .map(function (a) { return a.trim(); })
      .filter(function (a) { return a; });
    if (synonyms.length) _aliasOverrides[key] = synonyms;

    if (NORMS[key]) {
      if (male || female) _normOverrides[key] = { male: male, female: female };
    } else {
      _customIndicators[key] = { label: label, unit: unit, male: male, female: female };
    }
  });

  if (!memberId) return;

  cachedRows_(SHEET_PERSONAL_NORMS).forEach(function (row) {
    if (String(row['Кто'] || '').trim() !== memberId) return;
    var key = String(row['Код'] || '').trim();
    var range = parseNormRange_(row['Норма']);
    if (!key || !range) return;
    // Личная норма перекрывает всё остальное (одна на оба пола).
    if (NORMS[key]) _normOverrides[key] = { male: range, female: range };
    else {
      var known = _customIndicators[key];
      _customIndicators[key] = {
        label: known ? known.label : key,
        unit: known ? known.unit : '',
        male: range, female: range
      };
    }
  });
}

/** Название: справочник важнее кода — см. договорённость наверху файла. */
function indicatorLabel_(key) {
  if (_labelOverrides[key]) return _labelOverrides[key];
  if (NORMS[key]) return NORMS[key].label;
  if (_customIndicators[key]) return _customIndicators[key].label;
  return key;
}

/** Единицы: колонка «Единицы» справочника важнее встроенных. */
function indicatorUnit_(key) {
  if (_unitOverrides[key]) return _unitOverrides[key];
  if (NORMS[key]) return NORMS[key].unit;
  if (_customIndicators[key]) return _customIndicators[key].unit || '';
  return '';
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
    range = ov ? (isFemale_(gender) ? ov.female : ov.male) : (isFemale_(gender) ? base.female : base.male);
    label = indicatorLabel_(key); unit = indicatorUnit_(key);
  } else if (_customIndicators[key]) {
    var c = _customIndicators[key];
    if (!c.male && !c.female) return null;
    range = isFemale_(gender) ? (c.female || c.male) : (c.male || c.female);
    label = indicatorLabel_(key); unit = indicatorUnit_(key);
  } else {
    return null;
  }
  var status = 'normal';
  if (value < range[0]) status = 'low';
  else if (value > range[1]) status = 'high';
  return { status: status, min: range[0], max: range[1], label: label, unit: unit };
}

/** Привести к виду, в котором сравниваются названия: «С-реактивный» = «с реактивный». */
function normalizeForMatch_(text) {
  return String(text).toLowerCase().replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/g, ' ').trim();
}

/**
 * Сопоставить свободный текст с ключом показателя. Длинное название побеждает,
 * иначе «холестерин общий» всегда проигрывал бы «холестерину».
 *
 * Ищем и по встроенным алиасам, и по названиям из справочника, и по колонке
 * «Синонимы» — чтобы для нового сокращения («СРБ») не приходилось править код.
 */
function matchIndicatorKey_(text) {
  var norm = normalizeForMatch_(text);
  if (!norm) return null;

  var best = null, bestLen = 0;
  function consider(key, alias) {
    var a = normalizeForMatch_(alias);
    if (!a) return;
    if (norm.indexOf(a) !== -1 && a.length > bestLen) { best = key; bestLen = a.length; }
  }

  Object.keys(INDICATOR_ALIASES).forEach(function (key) {
    INDICATOR_ALIASES[key].forEach(function (alias) { consider(key, alias); });
  });
  Object.keys(_labelOverrides).forEach(function (key) { consider(key, _labelOverrides[key]); });
  Object.keys(_aliasOverrides).forEach(function (key) {
    _aliasOverrides[key].forEach(function (alias) { consider(key, alias); });
  });
  Object.keys(_customIndicators).forEach(function (key) { consider(key, _customIndicators[key].label); });
  return best;
}

/**
 * Выдернуть дату из свободного текста. Возвращает { date, rest }.
 *
 * Дату обязательно убираем из текста до разбора чисел: иначе «15.07.2025»
 * распалось бы на показатели со значениями 15 и 2025.
 */
function extractDate_(text) {
  var s = String(text);
  var tz = Session.getScriptTimeZone();

  var dmy = s.match(/(^|[^\d])(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4}|\d{2})([^\d]|$)/);
  if (dmy) {
    var year = dmy[4].length === 2 ? 2000 + Number(dmy[4]) : Number(dmy[4]);
    var d = new Date(year, Number(dmy[3]) - 1, Number(dmy[2]));
    if (d.getDate() === Number(dmy[2]) && d.getMonth() === Number(dmy[3]) - 1) {
      return { date: Utilities.formatDate(d, tz, 'yyyy-MM-dd'), rest: s.replace(dmy[0], ' ') };
    }
  }

  var iso = s.match(/(^|[^\d])(\d{4})-(\d{2})-(\d{2})([^\d]|$)/);
  if (iso) {
    var value = iso[2] + '-' + iso[3] + '-' + iso[4];
    if (!isNaN(new Date(value + 'T00:00:00').getTime())) {
      return { date: value, rest: s.replace(iso[0], ' ') };
    }
  }

  var word = s.match(/(^|[^a-zа-яё])(сегодня|вчера|позавчера)([^a-zа-яё]|$)/i);
  if (word) {
    var shift = { 'сегодня': 0, 'вчера': 1, 'позавчера': 2 }[word[2].toLowerCase()];
    var day = new Date();
    day.setDate(day.getDate() - shift);
    return { date: Utilities.formatDate(day, tz, 'yyyy-MM-dd'), rest: s.replace(word[0], ' ') };
  }

  return { date: null, rest: s };
}

/**
 * Разобрать свободный текст в { key: value }.
 *
 * Разделители не нужны: «МНО 2,5 С реактивный белок 2» читается так же, как
 * «мно 2.5, срб 2». Идея простая — найти в тексте числа, а названием считать
 * всё, что стоит перед числом и после предыдущего числа. Прежняя версия резала
 * строку по запятым и точкам с запятой и на тексте без разделителей склеивала
 * два показателя в один.
 *
 * Число обязано быть отдельным словом — иначе «витамин д3» и «B12» распались
 * бы на название и значение 3 и 12.
 */
function parseAnalysisText_(text) {
  var results = {};
  scanIndicatorValues_(text).forEach(function (f) {
    if (f.key) results[f.key] = f.value;
  });
  return results;
}

/**
 * Названия, за которыми стояло число, но которых нет ни в коде, ни в
 * справочнике. Их нужно показать человеку: молча выбросить «пульс 70» —
 * значит дать ему думать, что запись сохранена целиком.
 */
function unknownIndicators_(text) {
  return scanIndicatorValues_(text)
    .filter(function (f) { return !f.key && normalizeForMatch_(f.label); })
    .map(function (f) { return f.label.replace(/^[\s,;.]+|[\s,;.]+$/g, ''); })
    .filter(function (label) { return label; });
}

/**
 * Разложить текст на пары «название → число».
 * key === null, если название не удалось сопоставить с показателем.
 */
function scanIndicatorValues_(text) {
  var found = [];
  var remaining = String(text);

  var bp = remaining.match(/давлен\w*\D{0,10}(\d{2,3})\s*\/\s*(\d{2,3})/i);
  if (bp) {
    found.push({ label: 'давление', value: parseFloat(bp[1]), key: 'systolic' });
    found.push({ label: 'давление', value: parseFloat(bp[2]), key: 'diastolic' });
    remaining = remaining.replace(bp[0], ' ');
  }

  var re = /(^|[^0-9a-zA-Zа-яёА-ЯЁ])(-?\d+(?:[.,]\d+)?)(?![0-9a-zA-Zа-яёА-ЯЁ])/g;
  var lastEnd = 0;
  var m;
  while ((m = re.exec(remaining)) !== null) {
    var label = remaining.slice(lastEnd, m.index + m[1].length);
    lastEnd = re.lastIndex;
    var value = parseFloat(m[2].replace(',', '.'));
    if (isNaN(value)) continue;
    found.push({ label: label, value: value, key: matchIndicatorKey_(label) });
  }

  return found;
}
