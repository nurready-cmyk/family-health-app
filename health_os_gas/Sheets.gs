// ===== ДОСТУП К GOOGLE SHEETS =====
// Скрипт привязан к таблице «Здоровье семьи» (создан через Расширения → Apps Script),
// поэтому SpreadsheetApp.getActiveSpreadsheet() — это она и есть.

// Названия листов и колонок — по-русски: таблицу заполняет человек, а не
// программист, и ему не должно требоваться переводить family_member_id.
var SHEET_FAMILY = 'Семья';
var SHEET_USERS = 'Доступ';
var SHEET_MEDICAL = 'Обследования';
var SHEET_ANALYSES = 'Анализы';
var SHEET_CATALOG = 'Справочник анализов';
var SHEET_PERSONAL_NORMS = 'Личные нормы';
var SHEET_FEATURES = 'Особенности';
var SHEET_SESSIONS = 'Служебное';

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

// ---------- Кэш справочных листов ----------
// На одно нажатие кнопки бот открывал таблицу 5-7 раз: права доступа, список
// семьи, справочник, личные нормы. Сами листы крошечные, но каждое обращение —
// это отдельный поход в Google, и из них складывалась заметная задержка.
//
// Кэшируются только справочные листы, которые меняются раз в месяц. «Анализы» и
// «Служебное» не кэшируются никогда: они меняются в тот же момент, когда читаются.
//
// ВАЖНО: кэшируются строки листа, а не решение «пустить / не пустить».
// Отрицательный ответ в кэш попадать не должен — иначе человек, написавший
// боту до того, как его внесли в лист «Доступ», получал бы отказ ещё 6 часов
// после того, как его туда внесли.

var CACHE_TTL_SECONDS = 6 * 60 * 60;
var _memo = {};   // в пределах одного запуска — даже без похода в CacheService

// Кэш — ускорение, а не источник истины: любой сбой CacheService должен
// приводить к обычному чтению листа, а не к падению. Простые триггеры вроде
// onEdit работают с урезанными правами, и ронять из-за кэша автоподстановку
// кода показателя было бы обидно.

function cachedRows_(sheetName) {
  if (_memo[sheetName]) return _memo[sheetName];

  try {
    var hit = CacheService.getScriptCache().get('sheet:' + sheetName);
    if (hit) {
      _memo[sheetName] = JSON.parse(hit);
      return _memo[sheetName];
    }
  } catch (e) { /* кэш недоступен или повреждён — читаем лист */ }

  var rows = readAll_(sheetName);
  _memo[sheetName] = rows;
  try {
    // Больше 100 КБ в одну запись CacheService не принимает — тогда просто
    // читаем лист каждый раз, как было раньше.
    CacheService.getScriptCache()
      .put('sheet:' + sheetName, JSON.stringify(rows), CACHE_TTL_SECONDS);
  } catch (e) {
    Logger.log('Лист ' + sheetName + ' не закэширован: ' + e);
  }
  return rows;
}

/** Забыть кэш листа. Вызывается и при записи ботом, и при правке руками. */
function dropSheetCache_(sheetName) {
  delete _memo[sheetName];
  try {
    CacheService.getScriptCache().remove('sheet:' + sheetName);
  } catch (e) { /* нечего сбрасывать — значит, и кэша не было */ }
}

// ---------- Журнал ошибок ----------
// Журнал выполнения Apps Script виден только в редакторе, и когда бот молчит,
// причину приходится искать вручную. Поэтому ошибки дублируются в лист таблицы.
//
// ВАЖНО: пишем только ошибки, не каждое сообщение. Запись в таблицу — дорогая
// операция, и логирование каждого апдейта само стало бы причиной задержек,
// которые этим логированием и ищут.

var SHEET_ERRORS = 'Ошибки';

function logError_(where, err) {
  try {
    var sheet = ss_().getSheetByName(SHEET_ERRORS);
    if (!sheet) {
      sheet = ss_().insertSheet(SHEET_ERRORS);
      sheet.appendRow(['Когда', 'Где', 'Ошибка', 'Подробности']);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#fce8e6');
    }
    sheet.appendRow([
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
      String(where),
      String(err && err.message ? err.message : err).slice(0, 2000),
      String(err && err.stack ? err.stack : '').slice(0, 4000)
    ]);
  } catch (e) {
    // Журнал не должен быть причиной падения того, что он записывает.
    Logger.log('Не удалось записать ошибку в лист: ' + e);
  }
}

/** Все строки листа как объекты {заголовок: значение}. */
function readAll_(sheetName) {
  var sheet = ss_().getSheetByName(sheetName);
  if (!sheet) return [];
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  return values.slice(1).map(function (row) {
    var obj = {};
    headers.forEach(function (h, i) { obj[h] = row[i]; });
    return obj;
  }).filter(function (obj) {
    return Object.keys(obj).some(function (k) { return String(obj[k]).trim() !== ''; });
  });
}

function appendRow_(sheetName, headerToValue) {
  var sheet = ss_().getSheetByName(sheetName);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.appendRow(headers.map(function (h) {
    return headerToValue[h] != null ? headerToValue[h] : '';
  }));
}

function newId_() {
  return Utilities.getUuid();
}

// ---------- Семья, доступ ----------

function getFamilyMembers_() {
  return cachedRows_(SHEET_FAMILY).map(function (r) {
    // Отдельной колонки с именем больше нет: id члена семьи — это и есть имя,
    // и две одинаковые колонки рядом только путали.
    var who = String(r['Кто']);
    return { id: who, name: who, gender: String(r['Пол']), birthYear: r['Год рождения'] };
  });
}

function findUserRow_(tgId) {
  var rows = cachedRows_(SHEET_USERS);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['Telegram id']) === String(tgId)) {
      return {
        tgId: rows[i]['Telegram id'],
        name: String(rows[i]['Имя']),
        role: String(rows[i]['Роль']),
        familyMemberId: String(rows[i]['Кто из семьи'])
      };
    }
  }
  return null;
}

/**
 * Не нашли человека — единственный случай, когда стоит усомниться в кэше:
 * его могли внести в лист минуту назад. Перечитываем лист и пробуем ещё раз,
 * чтобы отказ никогда не «прилипал» на срок жизни кэша.
 */
function getUserByTgId_(tgId) {
  var user = findUserRow_(tgId);
  if (user) return user;
  dropSheetCache_(SHEET_USERS);
  return findUserRow_(tgId);
}

// Пол и роль в таблице записаны по-русски, но старые английские значения
// продолжаем понимать: в листах могли остаться строки от прежней версии,
// и молча перепутать норму для мужчины и женщины — худшее, что тут можно.

function isFemale_(gender) {
  var g = String(gender).trim().toLowerCase();
  return g === 'женский' || g === 'ж' || g === 'female';
}

function isAdmin_(role) {
  var r = String(role).trim().toLowerCase();
  return r === 'админ' || r === 'администратор' || r === 'admin';
}

/**
 * Контекст доступа — как AccessContext в Python-версии:
 * админ действует за всех, обычный пользователь — только за себя.
 */
function resolveAccess_(tgId) {
  var user = getUserByTgId_(tgId);
  if (!user) return null;
  var all = getFamilyMembers_();
  var allowed = isAdmin_(user.role)
    ? all
    : all.filter(function (m) { return m.id === user.familyMemberId; });
  return { user: user, allowedMembers: allowed };
}

function canActFor_(access, memberId) {
  return access.allowedMembers.some(function (m) { return m.id === memberId; });
}

function getMemberById_(access, memberId) {
  for (var i = 0; i < access.allowedMembers.length; i++) {
    if (access.allowedMembers[i].id === memberId) return access.allowedMembers[i];
  }
  return null;
}

/**
 * id члена семьи — это его имя.
 *
 * Раньше здесь была транслитерация («Адель» → adel). Из-за неё в таблице
 * повсюду стояли коды вроде nurla/gulna, которые нечитаемы ни для человека,
 * заполняющего лист руками, ни для ИИ, если выгрузить таблицу в ChatGPT.
 * Имя в семье и так уникально, а Telegram разрешает кириллицу в callback_data
 * (лимит 64 байта — «Гульнара» это 16). Тёзок разводим номером: «Адель 2».
 */
function uniqueMemberId_(name) {
  var existing = getFamilyMembers_().map(function (m) { return m.id; });
  var base = String(name).trim() || 'Без имени';
  var candidate = base;
  var suffix = 1;
  while (existing.indexOf(candidate) !== -1) {
    suffix++;
    candidate = base + ' ' + suffix;
  }
  return candidate;
}

function addFamilyMember_(name, gender, birthYear) {
  var id = uniqueMemberId_(name);
  appendRow_(SHEET_FAMILY, { 'Кто': id, 'Пол': gender, 'Год рождения': birthYear });
  dropSheetCache_(SHEET_FAMILY);
  return { id: id, name: name, gender: gender, birthYear: birthYear };
}

// ---------- Записи данных ----------

/**
 * Новая запись уходит не в конец, а сразу под шапку — по той же причине,
 * что и в addAnalyses_: за годы лист дорастает до тысяч строк, и «допишется
 * в конец» означало бы каждый раз прокручивать вниз.
 */
function addMedicalRecord_(recordDate, memberId, eventType, summary, documentUrl) {
  var sheet = ss_().getSheetByName(SHEET_MEDICAL);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var byHeader = {
    'Дата': recordDate, 'Кто': memberId, 'Что это было': eventType,
    'Заключение': summary, 'Ссылка на документ': documentUrl, 'Служебный id': newId_()
  };
  var values = headers.map(function (h) { return byHeader[h] != null ? byHeader[h] : ''; });
  sheet.insertRowBefore(2);
  sheet.getRange(2, 1, 1, values.length).setValues([values]);
  reapplyMedicalRowValidation_(sheet, 2, 1);
}

// ---------- Особенности организма ----------
// Постоянные свойства человека: аллергии, непереносимости, хронические
// болезни, ограничения по питанию. В отличие от листа «Мои правила», который
// срабатывает при отклонении показателя, это верно всегда — и именно эти
// строки должен видеть ИИ, когда ему отдают базу целиком.

function getFeatures_(memberId) {
  return cachedRows_(SHEET_FEATURES).filter(function (r) {
    return String(r['Кто']).trim() === memberId;
  });
}

function addFeature_(memberId, type, description) {
  appendRow_(SHEET_FEATURES, {
    'Кто': memberId, 'Тип': type, 'Описание': description, 'Служебный id': newId_()
  });
  dropSheetCache_(SHEET_FEATURES);
}

// ---------- Анализы: длинный список// ---------- Анализы: длинный список ----------
// Раньше лист был широким (строка = бланк, колонки = показатели). После
// живого использования выяснилось, что 30-40 колонок неудобно листать, а
// каждый новый показатель — это новая колонка чуть дальше вправо. Длинный
// формат устраняет обе проблемы: столбцов всегда девять, а показатель
// выбирается из выпадающего списка, который сам подтягивает справочник —
// сначала вносите анализы в справочник, потом они появляются в списке здесь.
//
// Одна запись = одна строка. Повторный ввод той же даты/человека/показателя
// обновляет существующую строку, а не плодит дубль — если на неё руками
// вписали норму с бланка лаборатории, она не потеряется при обновлении из бота.
//
// Норма с бланка — необязательные колонки «Норма мин/макс (с бланка)».
// Разные лаборатории считают по-разному, и норма именно с этого бланка точнее
// общего справочника. Если её не вписали — используется справочник/личные
// нормы/встроенные нормы, как раньше. См. checkNorm_ в Norms.gs.

var ANALYSES_COL_DATE = 1;
var ANALYSES_COL_MEMBER = 2;
var ANALYSES_COL_INDICATOR = 3;
var ANALYSES_COL_VALUE = 4;
var ANALYSES_COL_UNIT = 5;
var ANALYSES_COL_LAB_MIN = 6;
var ANALYSES_COL_LAB_MAX = 7;
var ANALYSES_COL_CODE = 8;
var ANALYSES_COL_ROWID = 9;
var ANALYSES_HEADERS = ['Дата', 'Кто', 'Показатель', 'Значение', 'Единицы',
  'Норма мин (с бланка)', 'Норма макс (с бланка)', 'Код', 'Служебный id'];

/** Значение ячейки с датой (Date или текст) → 'yyyy-MM-dd'. */
function normalizeDate_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var text = String(value == null ? '' : value).trim();
  if (!text) return '';
  return parseFlexibleDate_(text) || text;
}

function analysesSheet_() {
  return ss_().getSheetByName(SHEET_ANALYSES);
}

/** Шапка листа «Анализы» на месте. Безопасно вызывать сколько угодно раз. */
function ensureAnalysesHeaders_() {
  var sheet = analysesSheet_();
  var have = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), ANALYSES_HEADERS.length)).getValues()[0];
  var ok = ANALYSES_HEADERS.every(function (h, i) { return String(have[i] || '').trim() === h; });
  if (ok) return;
  if (sheet.getMaxColumns() < ANALYSES_HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), ANALYSES_HEADERS.length - sheet.getMaxColumns());
  }
  sheet.getRange(1, 1, 1, ANALYSES_HEADERS.length).setValues([ANALYSES_HEADERS]);
}

/** Название показателя (колонка «Показатель» справочника) → код. */
function headerToKeyMap_() {
  var map = {};
  cachedRows_(SHEET_CATALOG).forEach(function (row) {
    var label = String(row['Показатель'] || '').trim();
    var key = String(row['Код'] || '').trim();
    if (label && key) map[label.toLowerCase()] = key;
  });
  return map;
}

/** Строка этого человека, этой даты, этого показателя; 0 — если такой ещё нет. */
function findAnalysisRow_(sheet, memberId, entryDate, code) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var rows = sheet.getRange(2, ANALYSES_COL_DATE, lastRow - 1, ANALYSES_COL_CODE).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (normalizeDate_(rows[i][ANALYSES_COL_DATE - 1]) === entryDate &&
        String(rows[i][ANALYSES_COL_MEMBER - 1]).trim() === memberId &&
        String(rows[i][ANALYSES_COL_CODE - 1]).trim() === code) {
      return i + 2;
    }
  }
  return 0;
}

/**
 * Записать пачку показателей {key: value} за одну дату одному человеку.
 *
 * Новые строки уходят не в конец листа, а сразу под шапку (строка 2), одной
 * вставкой на всю пачку. Через год ежедневного заполнения лист доходит до
 * тысяч строк, и «допишется в конец» означало бы каждый раз прокручивать
 * вниз в поисках первой пустой строки — что бот, что рука. Здесь новое
 * всегда наверху, обновление существующей записи остаётся на месте.
 */
function addAnalyses_(memberId, entryDate, indicators) {
  var sheet = analysesSheet_();
  ensureAnalysesHeaders_();

  var keys = Object.keys(indicators);
  var fresh = [];

  // Обновления — сначала, пока номера строк ещё верны (вставка ниже их сдвинет).
  keys.forEach(function (key) {
    var row = findAnalysisRow_(sheet, memberId, entryDate, key);
    if (!row) { fresh.push(key); return; }
    // Норму с бланка, вписанную руками, не затираем.
    var existing = sheet.getRange(row, ANALYSES_COL_LAB_MIN, 1, 4).getValues()[0];
    sheet.getRange(row, ANALYSES_COL_DATE, 1, ANALYSES_HEADERS.length).setValues([[
      entryDate, memberId, indicatorLabel_(key), indicators[key], indicatorUnit_(key),
      existing[0], existing[1], key, existing[3] || newId_()
    ]]);
  });

  if (fresh.length) {
    sheet.insertRowsBefore(2, fresh.length);
    fresh.forEach(function (key, i) {
      sheet.getRange(2 + i, ANALYSES_COL_DATE, 1, ANALYSES_HEADERS.length).setValues([[
        entryDate, memberId, indicatorLabel_(key), indicators[key], indicatorUnit_(key), '', '', key, newId_()
      ]]);
    });
    reapplyAnalysesRowValidation_(sheet, 2, fresh.length);
  }
}

/**
 * Последнее известное значение каждого показателя: {код: значение}.
 * Даты сравниваются приведёнными к 'yyyy-MM-dd' — иначе строка, которую Google
 * Sheets распознал как настоящую дату, сортировалась бы как «Mon Jun 10 2026»
 * и «последним» оказывался бы не тот анализ.
 */
function getLatestValues_(memberId) {
  var sheet = analysesSheet_();
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return {};
  var latest = {}, latestDate = {};
  values.slice(1).forEach(function (r) {
    if (String(r[ANALYSES_COL_MEMBER - 1]).trim() !== memberId) return;
    var code = String(r[ANALYSES_COL_CODE - 1]).trim();
    var value = r[ANALYSES_COL_VALUE - 1];
    if (!code || value === '' || value == null) return;
    var d = normalizeDate_(r[ANALYSES_COL_DATE - 1]);
    if (!latestDate[code] || d >= latestDate[code]) {
      latestDate[code] = d;
      latest[code] = String(value);
    }
  });
  return latest;
}

/**
 * Норма с бланка лаборатории для последнего значения каждого показателя, если
 * её вписали: {код: [min, max]}. Используется только для отображения статуса
 * (норма/не норма) в ответах бота — какие продукты рекомендовать (Rules.gs)
 * по-прежнему решается по справочнику и личным нормам, чтобы опечатка в
 * бланке не подменила диетические рекомендации.
 */
function getLatestLabRanges_(memberId) {
  var sheet = analysesSheet_();
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return {};
  var ranges = {}, latestDate = {};
  values.slice(1).forEach(function (r) {
    if (String(r[ANALYSES_COL_MEMBER - 1]).trim() !== memberId) return;
    var code = String(r[ANALYSES_COL_CODE - 1]).trim();
    if (!code) return;
    var d = normalizeDate_(r[ANALYSES_COL_DATE - 1]);
    if (latestDate[code] && d < latestDate[code]) return;
    latestDate[code] = d;
    var min = parseFloat(r[ANALYSES_COL_LAB_MIN - 1]);
    var max = parseFloat(r[ANALYSES_COL_LAB_MAX - 1]);
    ranges[code] = (!isNaN(min) && !isNaN(max)) ? [min, max] : null;
  });
  return ranges;
}

/**
 * История значений показателя у человека, от старых к новым.
 * sinceDate — необязательная нижняя граница ('yyyy-MM-dd'); null — вся история.
 * Возвращает [{ date, value, labMin, labMax }].
 */
function analysisHistory_(memberId, code, sinceDate) {
  var sheet = analysesSheet_();
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var rows = [];
  values.slice(1).forEach(function (r) {
    if (String(r[ANALYSES_COL_MEMBER - 1]).trim() !== memberId) return;
    if (String(r[ANALYSES_COL_CODE - 1]).trim() !== code) return;
    var raw = r[ANALYSES_COL_VALUE - 1];
    if (raw === '' || raw == null) return;
    var date = normalizeDate_(r[ANALYSES_COL_DATE - 1]);
    if (sinceDate && date < sinceDate) return;
    var min = parseFloat(r[ANALYSES_COL_LAB_MIN - 1]);
    var max = parseFloat(r[ANALYSES_COL_LAB_MAX - 1]);
    rows.push({
      date: date,
      value: parseFloat(String(raw).replace(',', '.')),
      labMin: isNaN(min) ? null : min,
      labMax: isNaN(max) ? null : max
    });
  });
  rows.sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
  return rows;
}

// ---------- Отчёт по кнопкам: группа → показатель → сколько последних ----------

/** Коды показателей, по которым у человека есть хоть одно значение — в порядке появления в листе. */
function distinctCodesForMember_(memberId) {
  var sheet = analysesSheet_();
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var seen = {}, order = [];
  values.slice(1).forEach(function (r) {
    if (String(r[ANALYSES_COL_MEMBER - 1]).trim() !== memberId) return;
    var code = String(r[ANALYSES_COL_CODE - 1]).trim();
    var value = r[ANALYSES_COL_VALUE - 1];
    if (!code || value === '' || value == null) return;
    if (!seen[code]) { seen[code] = true; order.push(code); }
  });
  return order;
}

/** Код показателя → его группа, по справочнику. Без группы — «Прочее». */
function codeToGroup_() {
  var map = {};
  cachedRows_(SHEET_CATALOG).forEach(function (row) {
    var code = String(row['Код'] || '').trim();
    if (code) map[code] = String(row['Группа'] || '').trim() || 'Прочее';
  });
  return map;
}

/** Группы (по справочнику), по которым у человека есть хоть один результат. */
function personActiveGroups_(memberId) {
  var groupOf = codeToGroup_();
  var seen = {}, groups = [];
  distinctCodesForMember_(memberId).forEach(function (code) {
    var g = groupOf[code] || 'Прочее';
    if (!seen[g]) { seen[g] = true; groups.push(g); }
  });
  return groups;
}

/** Все показатели человека, без деления на группы: [{key, label}]. */
function personAllIndicators_(memberId) {
  return distinctCodesForMember_(memberId).map(function (code) {
    return { key: code, label: indicatorLabel_(code) };
  });
}

/** Показатели этой группы, по которым у человека есть данные: [{key, label}]. */
function personIndicatorsInGroup_(memberId, group) {
  var groupOf = codeToGroup_();
  return distinctCodesForMember_(memberId)
    .filter(function (code) { return (groupOf[code] || 'Прочее') === group; })
    .map(function (code) { return { key: code, label: indicatorLabel_(code) }; });
}

/** Название обследования → его группа, по справочнику. */
function examNameToGroup_() {
  var map = {};
  cachedRows_(SHEET_EXAM_CATALOG).forEach(function (row) {
    var name = String(row['Название'] || '').trim();
    var group = String(row['Группа'] || '').trim();
    if (name && group) map[name] = group;
  });
  return map;
}

/**
 * История обследований у человека, от старых к новым.
 * filter: {type:'name',value} — конкретный вид; {type:'group',value} — вся
 * группа (например, все УЗИ); {type:'all'} — все подряд.
 * Возвращает [{ date, type, summary }].
 */
function examHistory_(memberId, filter, sinceDate) {
  var sheet = ss_().getSheetByName(SHEET_MEDICAL);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var headers = values[0].map(function (h) { return String(h).trim(); });
  var dateCol = headers.indexOf('Дата');
  var memberCol = headers.indexOf('Кто');
  var typeCol = headers.indexOf('Что это было');
  var summaryCol = headers.indexOf('Заключение');
  var nameToGroup = filter.type === 'group' ? examNameToGroup_() : null;

  var rows = [];
  values.slice(1).forEach(function (r) {
    if (String(r[memberCol]).trim() !== memberId) return;
    var type = String(r[typeCol] || '').trim();
    if (filter.type === 'name' && type !== filter.value) return;
    if (filter.type === 'group' && nameToGroup[type] !== filter.value) return;
    var date = normalizeDate_(r[dateCol]);
    if (sinceDate && date < sinceDate) return;
    rows.push({ date: date, type: type, summary: String(r[summaryCol] || '') });
  });
  rows.sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
  return rows;
}

// ---------- Sessions (состояние диалога) ----------
// Apps Script не хранит состояние между запросами — каждый шаг диалога
// записывается в лист Sessions (аналог MemoryStorage в aiogram, но
// переживает даже перезапуск, в отличие от Python-версии).

function getSession_(chatId) {
  var rows = readAll_(SHEET_SESSIONS);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['Чат']) === String(chatId)) {
      var data = {};
      try { data = JSON.parse(String(rows[i]['Данные']) || '{}'); } catch (e) {}
      return { state: String(rows[i]['Шаг'] || ''), data: data };
    }
  }
  return { state: '', data: {} };
}

function setSession_(chatId, state, data) {
  var sheet = ss_().getSheetByName(SHEET_SESSIONS);
  var values = sheet.getDataRange().getValues();
  var json = JSON.stringify(data || {});
  var now = new Date();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(chatId)) {
      sheet.getRange(i + 1, 2, 1, 3).setValues([[state, json, now]]);
      return;
    }
  }
  sheet.appendRow([chatId, state, json, now]);
}

function clearSession_(chatId) {
  setSession_(chatId, '', {});
}
