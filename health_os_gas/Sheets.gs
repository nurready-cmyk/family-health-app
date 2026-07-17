// ===== ДОСТУП К GOOGLE SHEETS =====
// Скрипт привязан к таблице «Здоровье семьи» (создан через Расширения → Apps Script),
// поэтому SpreadsheetApp.getActiveSpreadsheet() — это она и есть. Та же таблица,
// те же листы, что использовал Python-бот: ничего не мигрирует, меняется только код.

var SHEET_FAMILY = 'Family_Members';
var SHEET_USERS = 'Users';
var SHEET_LOGS = 'Logs';
var SHEET_MEDICAL = 'Medical_Data';
var SHEET_KB = 'Knowledge_Base';
var SHEET_ANALYSES = 'Analyses';
var SHEET_CATALOG = 'Справочник_Анализов';
var SHEET_PERSONAL_NORMS = 'Личные_Нормы';
var SHEET_SESSIONS = 'Sessions';

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
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

// ---------- Family_Members / Users / доступ ----------

function getFamilyMembers_() {
  return readAll_(SHEET_FAMILY).map(function (r) {
    return { id: String(r.id), name: String(r.name), gender: String(r.gender), birthYear: r.birth_year };
  });
}

function getUserByTgId_(tgId) {
  var rows = readAll_(SHEET_USERS);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].tg_id) === String(tgId)) {
      return {
        tgId: rows[i].tg_id,
        name: String(rows[i].name),
        role: String(rows[i].role),
        familyMemberId: String(rows[i].family_member_id)
      };
    }
  }
  return null;
}

/**
 * Контекст доступа — как AccessContext в Python-версии:
 * админ действует за всех, обычный пользователь — только за себя.
 */
function resolveAccess_(tgId) {
  var user = getUserByTgId_(tgId);
  if (!user) return null;
  var all = getFamilyMembers_();
  var allowed = user.role === 'admin'
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

/** Короткий понятный id из имени («Адель» → adel), с защитой от совпадений. */
function slugifyName_(name) {
  var map = {'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'};
  // Проверяем принадлежность букве через сам map, а не через диапазон
  // /[a-zа-яё]/ — диапазон кириллицы в регулярке ломается, если файл
  // куда-нибудь попадёт в неверной кодировке.
  var slug = name.toLowerCase().split('').filter(function (c) {
    return map[c] != null || (c >= 'a' && c <= 'z');
  }).map(function (c) {
    return map[c] != null ? map[c] : c;
  }).join('').slice(0, 5);
  return slug || 'person';
}

function addFamilyMember_(name, gender, birthYear) {
  var existing = getFamilyMembers_().map(function (m) { return m.id; });
  var base = slugifyName_(name);
  var candidate = base;
  var suffix = 1;
  while (existing.indexOf(candidate) !== -1) {
    suffix++;
    var digits = String(suffix);
    candidate = base.slice(0, Math.max(1, 5 - digits.length)) + digits;
  }
  appendRow_(SHEET_FAMILY, { id: candidate, name: name, gender: gender, birth_year: birthYear });
  return { id: candidate, name: name, gender: gender, birthYear: birthYear };
}

// ---------- Записи данных ----------

function addLog_(entryDate, memberId, metricType, value, notes) {
  appendRow_(SHEET_LOGS, {
    id: newId_(), date: entryDate, family_member_id: memberId,
    metric_type: metricType, value: value, notes: notes
  });
}

function addMedicalRecord_(recordDate, memberId, eventType, summary, documentUrl) {
  appendRow_(SHEET_MEDICAL, {
    id: newId_(), date: recordDate, family_member_id: memberId,
    event_type: eventType, summary: summary, document_url: documentUrl
  });
}

function addKnowledgeRule_(memberId, ruleText) {
  appendRow_(SHEET_KB, {
    id: newId_(), family_member_id: memberId, rule_text: ruleText, priority: 0
  });
}

function getKnowledgeRules_(memberId) {
  return readAll_(SHEET_KB)
    .filter(function (r) { return String(r.family_member_id) === memberId; })
    .sort(function (a, b) { return (Number(b.priority) || 0) - (Number(a.priority) || 0); });
}

function addAnalysis_(memberId, entryDate, indicatorKey, value) {
  appendRow_(SHEET_ANALYSES, {
    id: newId_(), family_member_id: memberId, date: entryDate,
    indicator_key: indicatorKey, value: value
  });
}

/** Последнее известное значение каждого показателя: {indicator_key: value}. */
function getLatestValues_(memberId) {
  var entries = readAll_(SHEET_ANALYSES)
    .filter(function (r) { return String(r.family_member_id) === memberId; })
    .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
  var latest = {};
  entries.forEach(function (e) { latest[String(e.indicator_key)] = String(e.value); });
  return latest;
}

// ---------- Sessions (состояние диалога) ----------
// Apps Script не хранит состояние между запросами — каждый шаг диалога
// записывается в лист Sessions (аналог MemoryStorage в aiogram, но
// переживает даже перезапуск, в отличие от Python-версии).

function getSession_(chatId) {
  var rows = readAll_(SHEET_SESSIONS);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].chat_id) === String(chatId)) {
      var data = {};
      try { data = JSON.parse(String(rows[i].data_json) || '{}'); } catch (e) {}
      return { state: String(rows[i].state || ''), data: data };
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
