// ===== ДОСТУП К GOOGLE SHEETS =====
// Скрипт привязан к таблице «Здоровье семьи» (создан через Расширения → Apps Script),
// поэтому SpreadsheetApp.getActiveSpreadsheet() — это она и есть.

// Названия листов и колонок — по-русски: таблицу заполняет человек, а не
// программист, и ему не должно требоваться переводить family_member_id.
var SHEET_FAMILY = 'Семья';
var SHEET_USERS = 'Доступ';
var SHEET_LOGS = 'Дневник';
var SHEET_MEDICAL = 'Обследования';
var SHEET_KB = 'Мои правила';
var SHEET_ANALYSES = 'Анализы';
var SHEET_CATALOG = 'Справочник анализов';
var SHEET_PERSONAL_NORMS = 'Личные нормы';
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

function addLog_(entryDate, memberId, metricType, value, notes) {
  appendRow_(SHEET_LOGS, {
    'Дата': entryDate, 'Кто': memberId, 'Что': metricType,
    'Запись': value, 'Заметка': notes, 'Служебный id': newId_()
  });
}

function addMedicalRecord_(recordDate, memberId, eventType, summary, documentUrl) {
  appendRow_(SHEET_MEDICAL, {
    'Дата': recordDate, 'Кто': memberId, 'Что это было': eventType,
    'Заключение': summary, 'Ссылка на документ': documentUrl, 'Служебный id': newId_()
  });
}

function addKnowledgeRule_(memberId, ruleText) {
  appendRow_(SHEET_KB, {
    'Кто': memberId, 'Правило': ruleText, 'Важность': 0, 'Служебный id': newId_()
  });
  dropSheetCache_(SHEET_KB);
}

function getKnowledgeRules_(memberId) {
  return cachedRows_(SHEET_KB)
    .filter(function (r) { return String(r['Кто']) === memberId; })
    .sort(function (a, b) { return (Number(b['Важность']) || 0) - (Number(a['Важность']) || 0); });
}

// ---------- Анализы: широкий лист ----------
// Лист Analyses устроен как бумажный бланк: строка = один человек на одну дату,
// колонки = показатели («Дата | Кто | Гемоглобин | Глюкоза | ...»).
//
// Раньше он был «длинным» (строка на каждый показатель, со служебными id и
// латинскими кодами). Широкий вариант выбран сознательно: в него быстро
// вбивать бланк руками, он читается глазами без расшифровки кодов, и он же
// понятен ChatGPT/Gemini, если выгрузить таблицу целиком — не нужен ни
// отдельный лист для ручного ввода, ни синхронизация между ними.

var ANALYSES_COL_DATE = 1;
var ANALYSES_COL_MEMBER = 2;
var ANALYSES_COL_FIRST_INDICATOR = 3;

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

function analysesHeaders_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return String(h).trim();
  });
}

/** Название колонки листа «Анализы» → код показателя, по справочнику. */
function headerToKeyMap_() {
  var map = {};
  cachedRows_(SHEET_CATALOG).forEach(function (row) {
    var label = String(row['Показатель'] || '').trim();
    var key = String(row['Код'] || '').trim();
    if (label && key) map[label.toLowerCase()] = key;
  });
  return map;
}

/**
 * Убедиться, что в листе есть нужное число колонок. Лист создан ровно по
 * ширине справочника, и без этого запись в первую же новую колонку падает
 * с «диапазон за пределами листа».
 */
function ensureColumns_(sheet, needed) {
  var have = sheet.getMaxColumns();
  if (needed > have) sheet.insertColumnsAfter(have, needed - have);
}

/** Строка этого человека за эту дату; 0 — если такой ещё нет. */
function findAnalysisRow_(sheet, memberId, entryDate) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var keys = sheet.getRange(2, ANALYSES_COL_DATE, lastRow - 1, 2).getValues();
  for (var i = 0; i < keys.length; i++) {
    if (normalizeDate_(keys[i][0]) === entryDate &&
        String(keys[i][1]).trim() === memberId) {
      return i + 2;
    }
  }
  return 0;
}

/**
 * Записать пачку показателей {key: value} за одну дату одному человеку.
 *
 * Всё делается за считанные обращения к таблице независимо от того, сколько
 * показателей в бланке. Раньше на каждый показатель приходилось перечитывать
 * шапку и отдельно записывать ячейку — бланк из 15 строк превращался в 30
 * с лишним походов в Google, и «Записал» приходило с заметной паузой.
 */
function addAnalyses_(memberId, entryDate, indicators) {
  var sheet = analysesSheet_();
  var headers = analysesHeaders_(sheet);
  if (headers.length < ANALYSES_COL_FIRST_INDICATOR - 1) {
    headers = ['Дата', 'Кто'];
    sheet.getRange(1, 1, 1, 2).setValues([headers]);
  }

  // Показатели, для которых колонки ещё нет, дописываем справа — одним махом.
  var position = {};
  headers.forEach(function (h, i) { position[h.toLowerCase()] = i + 1; });

  var fresh = [];
  var keys = Object.keys(indicators);
  keys.forEach(function (key) {
    var label = indicatorLabel_(key);
    if (position[label.toLowerCase()] == null) {
      position[label.toLowerCase()] = headers.length + fresh.length + 1;
      fresh.push(label);
    }
  });
  if (fresh.length) {
    ensureColumns_(sheet, headers.length + fresh.length);
    sheet.getRange(1, headers.length + 1, 1, fresh.length).setValues([fresh]);
    styleAnalysesHeader_(sheet, null, headers.length + fresh.length);
  }

  var width = headers.length + fresh.length;
  var row = findAnalysisRow_(sheet, memberId, entryDate);
  var values;
  if (row) {
    // Существующий бланк дополняем, а не затираем: в нём могли быть
    // показатели, введённые руками.
    values = sheet.getRange(row, 1, 1, width).getValues()[0];
  } else {
    row = Math.max(sheet.getLastRow(), 1) + 1;
    values = [];
    for (var i = 0; i < width; i++) values.push('');
    values[ANALYSES_COL_DATE - 1] = entryDate;
    values[ANALYSES_COL_MEMBER - 1] = memberId;
  }

  keys.forEach(function (key) {
    values[position[indicatorLabel_(key).toLowerCase()] - 1] = indicators[key];
  });
  sheet.getRange(row, 1, 1, width).setValues([values]);
}

/**
 * Последнее известное значение каждого показателя: {indicator_key: value}.
 * Даты сравниваются приведёнными к 'yyyy-MM-dd' — иначе строка, которую Google
 * Sheets распознал как настоящую дату, сортировалась бы как «Mon Jun 10 2026»
 * и «последним» оказывался бы не тот анализ.
 */
function getLatestValues_(memberId) {
  var sheet = analysesSheet_();
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return {};

  var headers = values[0].map(function (h) { return String(h).trim(); });
  var byHeader = headerToKeyMap_();
  var keyByCol = {};
  for (var c = ANALYSES_COL_FIRST_INDICATOR - 1; c < headers.length; c++) {
    if (!headers[c]) continue;
    // Колонки нет в справочнике — берём заголовок как ключ: значение
    // сохранится и покажется, просто без сверки с нормой.
    keyByCol[c] = byHeader[headers[c].toLowerCase()] || headers[c];
  }

  var latest = {};
  values.slice(1)
    .filter(function (r) {
      return String(r[ANALYSES_COL_MEMBER - 1]).trim() === memberId;
    })
    .sort(function (a, b) {
      return normalizeDate_(a[ANALYSES_COL_DATE - 1])
        .localeCompare(normalizeDate_(b[ANALYSES_COL_DATE - 1]));
    })
    .forEach(function (r) {
      Object.keys(keyByCol).forEach(function (c) {
        var value = r[c];
        if (value !== '' && value != null) latest[keyByCol[c]] = String(value);
      });
    });
  return latest;
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
