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
 * статуса). Возвращает { status:'normal'|'low'|'high', min, max, label, unit, fromLab }.
 *
 * labRange — необязательная норма с конкретного бланка лаборатории (колонки
 * «Норма мин/макс (с бланка)» в листе «Анализы»). Разные лаборатории считают
 * по-разному, и она точнее общего справочника — если задана, побеждает
 * всё остальное: и справочник, и личные нормы, и встроенные нормы.
 */
function checkNorm_(key, value, gender, labRange) {
  var label = indicatorLabel_(key);
  var unit = indicatorUnit_(key);
  var fromLab = labRange && labRange.length === 2 && isFinite(labRange[0]) && isFinite(labRange[1]);
  var range = fromLab ? labRange : null;

  if (!range) {
    if (NORMS[key]) {
      var base = NORMS[key];
      var ov = _normOverrides[key];
      range = ov ? (isFemale_(gender) ? ov.female : ov.male) : (isFemale_(gender) ? base.female : base.male);
    } else if (_customIndicators[key]) {
      var c = _customIndicators[key];
      range = isFemale_(gender) ? (c.female || c.male) : (c.male || c.female);
    }
  }
  if (!range) return null;

  var status = 'normal';
  if (value < range[0]) status = 'low';
  else if (value > range[1]) status = 'high';
  return { status: status, min: range[0], max: range[1], label: label, unit: unit, fromLab: !!fromLab };
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
 * Название должно стоять прямо перед числом (concом строки-кандидата), а не
 * где угодно внутри неё. Раньше «аст» находился как подстрока в середине
 * слова «контрастное», а вопрос «дай МНО за последний 1 год» бот принимал за
 * запись «МНО = 1» — название упоминалось где-то раньше по тексту, число не
 * имело к нему отношения.
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
    if (norm === a) {
      if (a.length > bestLen) { best = key; bestLen = a.length; }
      return;
    }
    // Название — суффикс кандидата, и перед ним граница слова (пробел),
    // а не середина другого слова («контрАСТное»).
    if (norm.length > a.length &&
        norm.slice(norm.length - a.length) === a &&
        norm.charAt(norm.length - a.length - 1) === ' ') {
      if (a.length > bestLen) { best = key; bestLen = a.length; }
    }
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

// ---------- Вопросы про историю: «МНО за год», «узи за полгода» ----------
// В отличие от записи (где число обязано стоять сразу после названия),
// здесь числа может не быть вообще — «покажи гемоглобин» тоже вопрос.
// Из-за этого используется отдельное, менее строгое сопоставление названия:
// «где угодно в тексте, но на границе слова» — не там же по всему тексту как
// подстрока (это как раз и было первым найденным багом с «контрастное»).

var HALF_YEAR_RE = /за\s+(?:последн[а-яёА-ЯЁ]*\s+)?(?:пол\s*-?\s*года|полугода)/i;

var PERIOD_RE = new RegExp(
  'за\\s+(?:последн[а-яёА-ЯЁ]*\\s+)?(\\d+)?\\s*' +
  '(лет|года|год|месяцев|месяца|месяц|недель|недели|неделю|дней|дня|день)(?![а-яёА-ЯЁ])',
  'i'
);

/**
 * Вынуть относительный период из текста: «за год», «за 6 месяцев», «за
 * последний год», «за полгода», «за 30 дней». Возвращает { sinceDate, rest }.
 * sinceDate === null — период не указан (или явно «за всё время»): значит
 * показываем всю историю, без ограничения по дате.
 */
function extractPeriod_(text) {
  var s = String(text);
  var tz = Session.getScriptTimeZone();

  // Проверяем раньше общего PERIOD_RE: «полгода» — одно слово, не «пол» + «года».
  var half = s.match(HALF_YEAR_RE);
  if (half) {
    var sinceHalf = new Date();
    sinceHalf.setMonth(sinceHalf.getMonth() - 6);
    return { sinceDate: Utilities.formatDate(sinceHalf, tz, 'yyyy-MM-dd'), rest: s.replace(half[0], ' ') };
  }

  var m = s.match(PERIOD_RE);
  if (m) {
    var n = m[1] ? Number(m[1]) : 1;
    var unit = m[2].toLowerCase();
    var since = new Date();
    if (unit.indexOf('год') === 0 || unit.indexOf('лет') === 0) since.setFullYear(since.getFullYear() - n);
    else if (unit.indexOf('месяц') === 0) since.setMonth(since.getMonth() - n);
    else if (unit.indexOf('недел') === 0) since.setDate(since.getDate() - n * 7);
    else since.setDate(since.getDate() - n);
    return { sinceDate: Utilities.formatDate(since, tz, 'yyyy-MM-dd'), rest: s.replace(m[0], ' ') };
  }

  if (/за\s+вс[её]\s+время|весь\s+период/i.test(s)) {
    return { sinceDate: null, rest: s.replace(/за\s+вс[её]\s+время|весь\s+период/i, ' ') };
  }

  return { sinceDate: null, rest: s };
}

/**
 * «Встречается по смыслу» в уже обёрнутом пробелами normalizeForMatch_-тексте
 * (norm), с допуском на падежи: «ферритин» находит и «ферритина» (родительный
 * падеж — «результат ферритина»), «гемоглобин» — «гемоглобином».
 *
 * Допуск действует только для фраз от 5 символов: короткие аббревиатуры
 * (МНО, АСТ, АЛТ, ТТГ) в естественной речи не склоняются, а «мно» как
 * начало слова совпало бы с «много». Отбрасываем максимум одну гласную на
 * конце («глюкоза» → стем «глюкоз», ловит «глюкозы», «глюкозу», «глюкозе»).
 */
function containsPhrase_(norm, phrase) {
  var p = normalizeForMatch_(phrase);
  if (!p) return false;
  if (norm.indexOf(' ' + p + ' ') !== -1) return true;
  if (p.length < 5) return false;
  var stem = /[аоеуыь]$/.test(p) ? p.slice(0, -1) : p;
  return norm.indexOf(' ' + stem) !== -1;
}

/**
 * Лучшее совпадение текста с элементом произвольного списка (с тем же
 * допуском на падежи, что и в containsPhrase_). Для отчёта: набор кнопок у
 * каждого человека свой (виды обследований, которые он реально проходил),
 * поэтому список передаётся, а не берётся из справочника целиком.
 */
function matchAmongList_(list, text) {
  var norm = ' ' + normalizeForMatch_(text) + ' ';
  var best = null, bestLen = 0;
  list.forEach(function (item) {
    if (containsPhrase_(norm, item) && item.length > bestLen) { best = item; bestLen = item.length; }
  });
  return best;
}

/**
 * Найти показатель где угодно в тексте (не обязательно перед числом) — для
 * вопросов вида «МНО за год», «результат ферритина» или просто «гемоглобин».
 */
function containsIndicatorKey_(text) {
  var norm = ' ' + normalizeForMatch_(text) + ' ';
  var best = null, bestLen = 0;
  function consider(key, alias) {
    var a = normalizeForMatch_(alias);
    if (a && containsPhrase_(norm, alias) && a.length > bestLen) { best = key; bestLen = a.length; }
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
 * Вид обследования, упомянутый в тексте: конкретное название («УЗИ органов
 * брюшной полости»), группа («узи», «мрт») или просто «обследования» без
 * уточнения — тогда без фильтра по типу. null, если про обследования речи
 * вообще нет.
 */
function matchExamFilter_(text) {
  var norm = ' ' + normalizeForMatch_(text) + ' ';

  var bestName = null, bestNameLen = 0;
  cachedRows_(SHEET_EXAM_CATALOG).forEach(function (row) {
    var name = row['Название'] || '';
    if (name && containsPhrase_(norm, name) && name.length > bestNameLen) {
      bestName = name; bestNameLen = name.length;
    }
  });
  if (bestName) return { type: 'name', value: bestName };

  var groups = {};
  cachedRows_(SHEET_EXAM_CATALOG).forEach(function (row) {
    var g = String(row['Группа'] || '').trim();
    if (g) groups[g] = true;
  });
  var bestGroup = null, bestGroupLen = 0;
  Object.keys(groups).forEach(function (g) {
    if (containsPhrase_(norm, g) && g.length > bestGroupLen) { bestGroup = g; bestGroupLen = g.length; }
  });
  if (bestGroup) return { type: 'group', value: bestGroup };

  if (normalizeForMatch_(text).indexOf('обследован') !== -1) return { type: 'all' };
  return null;
}
