// ===== РУЧНОЙ ВВОД ПРЯМО В ТАБЛИЦЕ =====
// Бланков накапливается больше, чем удобно надиктовывать боту, поэтому анализы
// и обследования можно вбивать руками в те же самые листы, из которых читает
// бот. Отдельных «входных» листов нет специально: чем меньше листов, тем
// понятнее выгрузка, если отдать таблицу целиком ChatGPT или Gemini.
//
// Этот файл отвечает за удобство листа, а не за данные:
//   • меню «🩺 Health OS» сверху таблицы;
//   • выпадающие списки (кто из семьи, тип обследования);
//   • колонки листа Analyses, собранные по Справочнику_Анализов;
//   • автоматический код (indicator_key) для нового показателя.

var SHEET_EXAM_CATALOG = 'Справочник обследований';

/** Меню появляется само при открытии таблицы. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🩺 Health OS')
    .addItem('Обновить списки и колонки', 'refreshEntrySheets')
    .addSeparator()
    .addItem('Проверить анализы по нормам', 'highlightOutOfRange')
    .addSeparator()
    .addItem('Сбросить кэш бота', 'dropAllCaches')
    .addToUi();
}

/**
 * Собрать листы для ручного ввода: колонки анализов по справочнику,
 * выпадающие списки, ширина и закрепление шапки. Безопасно запускать сколько
 * угодно раз — ничего не удаляет, только добавляет недостающее.
 */
function refreshEntrySheets() {
  ensureExamCatalog_();
  syncAnalysesColumns_();
  applyValidations_();
  SpreadsheetApp.getActive().toast('Списки и колонки обновлены.', 'Health OS', 5);
}

/** Забыть всё, что бот держит в кэше. Страховка, если что-то разошлось. */
function dropAllCaches() {
  [SHEET_FAMILY, SHEET_USERS, SHEET_CATALOG, SHEET_PERSONAL_NORMS, SHEET_KB, SHEET_FEATURES]
    .forEach(dropSheetCache_);
  SpreadsheetApp.getActive().toast('Кэш сброшен — бот перечитает листы.', 'Health OS', 5);
}

// ---------- Справочник анализов: код показателя вписывается сам ----------

/**
 * Простой триггер: срабатывает на любое ручное изменение таблицы.
 * Задача одна — проставлять машинный код (indicator_key) вместо человека,
 * чтобы от него требовалось только русское название показателя.
 */
function onEdit(e) {
  if (!e || !e.range) return;
  var name = e.range.getSheet().getName();

  // Кэш живёт 6 часов, и без этого правка листа доходила бы до бота только
  // через 6 часов. Сбрасываем ровно тот лист, который правили: остальные
  // продолжают отвечать из кэша.
  dropSheetCache_(name);

  if (name === SHEET_CATALOG) fillCatalogKey_(e);
  else if (name === SHEET_PERSONAL_NORMS) fillPersonalNormKey_(e);
}

function headerIndex_(sheet) {
  var index = {};
  sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .forEach(function (h, i) { index[String(h).trim()] = i + 1; });
  return index;
}

/** Новая строка справочника: по русскому названию сочиняем свободный код. */
function fillCatalogKey_(e) {
  var sheet = e.range.getSheet();
  var cols = headerIndex_(sheet);
  var nameCol = cols['Показатель'];
  var keyCol = cols['Код'];
  if (!nameCol || !keyCol) return;

  var row = e.range.getRow();
  if (row < 2 || e.range.getColumn() !== nameCol) return;

  var label = String(sheet.getRange(row, nameCol).getValue()).trim();
  var keyCell = sheet.getRange(row, keyCol);
  if (!label || String(keyCell.getValue()).trim()) return;

  var taken = sheet.getRange(2, keyCol, Math.max(sheet.getLastRow() - 1, 1), 1)
    .getValues().map(function (r) { return String(r[0]).trim(); });
  keyCell.setValue(uniqueIndicatorKey_(label, taken));
}

/** Личная норма: выбрали показатель из списка — код подставляем из справочника. */
function fillPersonalNormKey_(e) {
  var sheet = e.range.getSheet();
  var cols = headerIndex_(sheet);
  var nameCol = cols['Показатель'];
  var keyCol = cols['Код'];
  if (!nameCol || !keyCol) return;

  var row = e.range.getRow();
  if (row < 2 || e.range.getColumn() !== nameCol) return;

  var label = String(sheet.getRange(row, nameCol).getValue()).trim();
  if (!label) return;
  var key = headerToKeyMap_()[label.toLowerCase()];
  if (key) sheet.getRange(row, keyCol).setValue(key);
}

/** «Мочевина» → mochevina; «МНО» → mno. Латиница, чтобы ключ был машинным. */
function transliterate_(text) {
  var map = {
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z',
    'и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r',
    'с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'c','ч':'ch','ш':'sh','щ':'sch',
    'ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'
  };
  return String(text).toLowerCase().split('').map(function (ch) {
    if (map[ch] != null) return map[ch];
    if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')) return ch;
    return ' ';
  }).join('').trim().replace(/\s+/g, '_');
}

function uniqueIndicatorKey_(name, taken) {
  var base = transliterate_(name).slice(0, 24) || 'indicator';
  var candidate = base;
  var suffix = 1;
  while (taken.indexOf(candidate) !== -1) {
    suffix++;
    candidate = base + '_' + suffix;
  }
  return candidate;
}

// ---------- Лист Analyses: колонки по справочнику ----------

/**
 * Дописать в лист Analyses колонку для каждого показателя справочника,
 * которого там ещё нет. Существующие колонки не двигаются и не переименовываются:
 * уже введённые значения обязаны остаться на месте.
 */
function syncAnalysesColumns_() {
  var sheet = analysesSheet_();
  var headers = analysesHeaders_(sheet);
  if (!headers.length) {
    sheet.getRange(1, 1, 1, 2).setValues([['Дата', 'Кто']]);
    headers = ['Дата', 'Кто'];
  }

  var present = {};
  headers.forEach(function (h) { present[h.toLowerCase()] = true; });

  var missing = [];
  readAll_(SHEET_CATALOG).forEach(function (row) {
    var label = String(row['Показатель'] || '').trim();
    if (label && !present[label.toLowerCase()]) {
      present[label.toLowerCase()] = true;
      missing.push(label);
    }
  });

  if (missing.length) {
    ensureColumns_(sheet, headers.length + missing.length);
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
  }

  var lastCol = Math.max(headers.length + missing.length, 2);
  styleAnalysesHeader_(sheet, null, lastCol);
  sheet.getRange(1, ANALYSES_COL_DATE, sheet.getMaxRows(), 1)
    .setNumberFormat('yyyy-mm-dd');
  sheet.getRange(1, 1).setNumberFormat('@');  // заголовок «Дата» остаётся текстом
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(2);
}

/** Оформление шапки: одна колонка (col) или весь диапазон до lastCol. */
function styleAnalysesHeader_(sheet, col, lastCol) {
  var range = col
    ? sheet.getRange(1, col)
    : sheet.getRange(1, 1, 1, lastCol || sheet.getLastColumn());
  range.setFontWeight('bold').setBackground('#e8f0fe').setWrap(true);
}

// ---------- Выпадающие списки ----------

function memberNamesRange_() {
  return ss_().getSheetByName(SHEET_FAMILY).getRange('A2:A200');
}

/**
 * Списки строятся на диапазонах, а не на списке значений: добавили человека в
 * Family_Members или обследование в справочник — выпадающий список подхватил
 * это сам, без повторного запуска чего-либо.
 */
function applyValidations_() {
  var members = SpreadsheetApp.newDataValidation()
    .requireValueInRange(memberNamesRange_(), true)
    .setAllowInvalid(false)
    .setHelpText('Выберите члена семьи из списка.')
    .build();

  var analyses = analysesSheet_();
  analyses.getRange(2, ANALYSES_COL_MEMBER, analyses.getMaxRows() - 1, 1)
    .setDataValidation(members);

  var medical = ss_().getSheetByName(SHEET_MEDICAL);
  var medHeaders = medical.getRange(1, 1, 1, medical.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim(); });
  var memberCol = medHeaders.indexOf('Кто') + 1;
  var typeCol = medHeaders.indexOf('Что это было') + 1;
  if (memberCol) {
    medical.getRange(2, memberCol, medical.getMaxRows() - 1, 1).setDataValidation(members);
  }
  if (typeCol) {
    medical.getRange(2, typeCol, medical.getMaxRows() - 1, 1).setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInRange(ss_().getSheetByName(SHEET_EXAM_CATALOG).getRange('B2:B500'), true)
        .setAllowInvalid(true)   // разрешаем своё: не каждое обследование попадёт в справочник
        .setHelpText('Выберите из справочника обследований или впишите своё.')
        .build());
  }

  // Особенности организма: кто — из списка, тип — из фиксированного набора,
  // чтобы в выгрузке для ИИ не оказалось пяти написаний слова «аллергия».
  var features = ss_().getSheetByName(SHEET_FEATURES);
  if (features) {
    features.getRange(2, 1, features.getMaxRows() - 1, 1).setDataValidation(members);
    features.getRange(2, 2, features.getMaxRows() - 1, 1).setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(FEATURE_TYPES, true)
        .setAllowInvalid(false)
        .setHelpText('Выберите тип особенности.')
        .build());
    features.setFrozenRows(1);
    features.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#e8f0fe');
    features.setColumnWidth(1, 120);
    features.setColumnWidth(2, 220);
    features.setColumnWidth(3, 560);
  }

  var personal = ss_().getSheetByName(SHEET_PERSONAL_NORMS);
  personal.getRange(2, 1, personal.getMaxRows() - 1, 1).setDataValidation(members);
  personal.getRange(2, 2, personal.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInRange(ss_().getSheetByName(SHEET_CATALOG).getRange('B2:B500'), true)
      .setAllowInvalid(false)
      .setHelpText('Выберите показатель из Справочника_Анализов.')
      .build());
}

// ---------- Справочник обследований ----------

var EXAM_CATALOG_SEED = [
  ['УЗИ', 'УЗИ органов брюшной полости', 'Печень, желчный пузырь, поджелудочная, селезёнка'],
  ['УЗИ', 'УЗИ почек и надпочечников', ''],
  ['УЗИ', 'УЗИ щитовидной железы', ''],
  ['УЗИ', 'УЗИ сердца (ЭхоКГ)', ''],
  ['УЗИ', 'УЗИ сосудов шеи (БЦА)', ''],
  ['УЗИ', 'УЗИ органов малого таза', ''],
  ['УЗИ', 'УЗИ молочных желёз', ''],
  ['УЗИ', 'УЗИ предстательной железы', ''],
  ['УЗИ', 'УЗИ мягких тканей / лимфоузлов', ''],
  ['УЗИ', 'НСГ (нейросонография)', 'Детям до закрытия родничка'],
  ['Диагностика', 'ЭКГ', ''],
  ['Диагностика', 'Холтер (суточное ЭКГ)', ''],
  ['Диагностика', 'Флюорография / рентген ОГК', ''],
  ['Диагностика', 'Рентген (другое)', ''],
  ['Диагностика', 'МРТ', ''],
  ['Диагностика', 'КТ', ''],
  ['Диагностика', 'ФГДС (гастроскопия)', ''],
  ['Диагностика', 'Колоноскопия', ''],
  ['Диагностика', 'Маммография', ''],
  ['Диагностика', 'Денситометрия', ''],
  ['Приём врача', 'Приём терапевта', ''],
  ['Приём врача', 'Приём педиатра', ''],
  ['Приём врача', 'Приём кардиолога', ''],
  ['Приём врача', 'Приём эндокринолога', ''],
  ['Приём врача', 'Приём гастроэнтеролога', ''],
  ['Приём врача', 'Приём невролога', ''],
  ['Приём врача', 'Приём гинеколога', ''],
  ['Приём врача', 'Приём уролога', ''],
  ['Приём врача', 'Приём офтальмолога', ''],
  ['Приём врача', 'Приём ЛОРа', ''],
  ['Приём врача', 'Приём дерматолога', ''],
  ['Приём врача', 'Приём стоматолога', ''],
  ['Приём врача', 'Приём хирурга', ''],
  ['Прочее', 'Вакцинация', ''],
  ['Прочее', 'Госпитализация', ''],
  ['Прочее', 'Операция', ''],
  ['Прочее', 'Медосмотр / диспансеризация', '']
];

/** Создать справочник обследований, если его ещё нет. Существующий не трогаем. */
function ensureExamCatalog_() {
  var sheet = ss_().getSheetByName(SHEET_EXAM_CATALOG);
  if (sheet) return sheet;
  sheet = ss_().insertSheet(SHEET_EXAM_CATALOG);
  sheet.getRange(1, 1, 1, 3).setValues([['Группа', 'Название', 'Что смотрят / примечание']]);
  sheet.getRange(2, 1, EXAM_CATALOG_SEED.length, 3).setValues(EXAM_CATALOG_SEED);
  styleAnalysesHeader_(sheet, null, 3);
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(2, 260);
  sheet.setColumnWidth(3, 320);
  return sheet;
}

// ---------- Подсветка отклонений ----------

/**
 * Прокрасить значения листа Analyses: красным — вне нормы, зелёным — в норме.
 * Нормы берутся так же, как их считает бот, включая личные нормы детей.
 */
function highlightOutOfRange() {
  var sheet = analysesSheet_();
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return;

  var headers = values[0].map(function (h) { return String(h).trim(); });
  var byHeader = headerToKeyMap_();
  var genders = {};
  getFamilyMembers_().forEach(function (m) { genders[m.id] = m.gender; });

  for (var r = 1; r < values.length; r++) {
    var memberId = String(values[r][ANALYSES_COL_MEMBER - 1]).trim();
    if (!memberId) continue;
    refreshCatalog_(memberId);
    var colors = [];
    for (var c = ANALYSES_COL_FIRST_INDICATOR - 1; c < headers.length; c++) {
      var raw = values[r][c];
      var value = parseFloat(String(raw).replace(',', '.'));
      if (raw === '' || raw == null || isNaN(value)) { colors.push(null); continue; }
      var key = byHeader[headers[c].toLowerCase()] || headers[c];
      var check = checkNorm_(key, value, genders[memberId]);
      colors.push(!check ? null : (check.status === 'normal' ? '#e6f4ea' : '#fce8e6'));
    }
    if (colors.length) {
      sheet.getRange(r + 1, ANALYSES_COL_FIRST_INDICATOR, 1, colors.length)
        .setBackgrounds([colors]);
    }
  }
  SpreadsheetApp.getActive().toast('Готово: красным — вне нормы, зелёным — в норме.', 'Health OS', 5);
}
