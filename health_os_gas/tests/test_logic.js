// Прогон чистой логики GAS-файлов на движке JavaScriptCore (osascript -l JavaScript).
// Google-специфичные объекты подменены заглушками — проверяем только те функции,
// которые не ходят в сеть/таблицу: разбор текста, нормы, даты, id.

ObjC.import('Foundation');

function readFile(path) {
  var text = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null);
  if (!text || !text.js) {
    throw new Error('Не найден файл ' + path + '. Запускать из папки health_os_gas.');
  }
  return text.js;
}

// Пути относительные — тесты запускаются из папки health_os_gas
// (см. README). Абсолютный путь был вшит в файл и сломался при переносе папки.
var BASE = $.NSFileManager.defaultManager.currentDirectoryPath.js + '/';

// --- Заглушки Google Apps Script ---
var Utilities = {
  formatDate: function (date, tz, fmt) {
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  },
  getUuid: function () { return 'uuid-stub'; }
};
var Session = { getScriptTimeZone: function () { return 'Asia/Almaty'; } };
var Logger = { log: function () {} };

// Данные, которые «лежат в таблице» — их подменяет каждый тест.
var FAKE_CATALOG = [];
var FAKE_PERSONAL = [];
var SHEET_CATALOG = 'Справочник анализов';
var SHEET_PERSONAL_NORMS = 'Личные нормы';
var SHEET_EXAM_CATALOG = 'Справочник обследований';
var FAKE_EXAMS = [];
function readAll_(name) {
  if (name === SHEET_CATALOG) return FAKE_CATALOG;
  if (name === SHEET_PERSONAL_NORMS) return FAKE_PERSONAL;
  if (name === SHEET_EXAM_CATALOG) return FAKE_EXAMS;
  return [];
}
// В боевом коде это кэш на 6 часов; в тестах кэшировать нечего.
function cachedRows_(name) { return readAll_(name); }
// Пол по-русски, но английские значения тоже понимаются — см. Sheets.gs.
function isFemale_(g) {
  g = String(g).trim().toLowerCase();
  return g === 'женский' || g === 'ж' || g === 'female';
}

// --- Загружаем проверяемый код ---
eval(readFile(BASE + 'Norms.gs'));

// Из Main.gs берём только parseFlexibleDate_ (остальное лезет в сеть).
var mainSrc = readFile(BASE + 'Main.gs');
var dateFn = mainSrc.match(/function parseFlexibleDate_[\s\S]*?\n}\n/)[0];
eval(dateFn);
eval(mainSrc.match(/function displayDate_[\s\S]*?\n}\n/)[0]);

// Из Sheets.gs — normalizeDate_ (сортировка дат в широком листе Analyses).
var sheetsSrc = readFile(BASE + 'Sheets.gs');
eval(sheetsSrc.match(/function normalizeDate_[\s\S]*?\n}\n/)[0]);

// Из Entry.gs — транслитерация кода нового показателя.
var entrySrc = readFile(BASE + 'Entry.gs');
eval(entrySrc.match(/function transliterate_[\s\S]*?\n}\n/)[0]);
eval(entrySrc.match(/function uniqueIndicatorKey_[\s\S]*?\n}\n/)[0]);

function todayIsoForTest() { return Utilities.formatDate(new Date(), null, null); }

// --- Мини-фреймворк ---
var passed = 0, failed = 0, log = [];
function ok(name, cond) {
  if (cond) { passed++; }
  else { failed++; log.push('  ✗ ' + name); }
}
function eq(name, actual, expected) {
  var a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; }
  else { failed++; log.push('  ✗ ' + name + '\n      получено: ' + a + '\n      ожидалось: ' + e); }
}

// ---------- parseNormRange_ ----------
eq('норма "120-155"', parseNormRange_('120-155'), [120, 155]);
eq('норма с запятой "3,9-6,1"', parseNormRange_('3,9-6,1'), [3.9, 6.1]);
eq('пустая норма', parseNormRange_(''), null);
eq('мусор в норме', parseNormRange_('не число'), null);

// ---------- checkNorm_ (встроенные) ----------
refreshCatalog_(null);
eq('гемоглобин 100 male = low', checkNorm_('hemoglobin', 100, 'male').status, 'low');
eq('гемоглобин 150 male = normal', checkNorm_('hemoglobin', 150, 'male').status, 'normal');
eq('гемоглобин 200 male = high', checkNorm_('hemoglobin', 200, 'male').status, 'high');
eq('125 норма для female', checkNorm_('hemoglobin', 125, 'female').status, 'normal');
eq('125 low для male', checkNorm_('hemoglobin', 125, 'male').status, 'low');
eq('неизвестный показатель', checkNorm_('unknown', 1, 'male'), null);

// ---------- Норма с бланка лаборатории ----------
// Разные лаборатории считают по-разному; норма с конкретного бланка точнее
// общего справочника и должна побеждать всё остальное.
FAKE_CATALOG = []; FAKE_PERSONAL = [];
refreshCatalog_(null);
eq('норма с бланка побеждает встроенную', checkNorm_('hemoglobin', 100, 'male', [90, 110]).status, 'normal');
eq('норма с бланка помечена как fromLab', checkNorm_('hemoglobin', 100, 'male', [90, 110]).fromLab, true);
eq('без нормы с бланка — обычная не помечена', checkNorm_('hemoglobin', 150, 'male').fromLab, false);
eq('без нормы с бланка — как раньше', checkNorm_('hemoglobin', 100, 'male').status, 'low');
eq('битая норма с бланка игнорируется', checkNorm_('hemoglobin', 150, 'male', [NaN, 110]).status, 'normal');
eq('норма с бланка работает и для личных норм ребёнка',
   (function () {
     FAKE_PERSONAL = [{ 'Кто': 'adel', 'Показатель': 'Гемоглобин', 'Код': 'hemoglobin', 'Норма': '115-145' }];
     refreshCatalog_('adel');
     var r = checkNorm_('hemoglobin', 100, 'female', [90, 110]).status;
     FAKE_PERSONAL = []; refreshCatalog_(null);
     return r;
   })(), 'normal');

// ---------- Переопределение нормы из справочника ----------
FAKE_CATALOG = [{ 'Показатель': 'Гемоглобин', 'Код': 'hemoglobin', 'Норма (мужчины)': '100-200', 'Норма (женщины)': '100-200' }];
refreshCatalog_(null);
eq('своя норма из справочника', checkNorm_('hemoglobin', 125, 'male').status, 'normal');

// Один заполненный столбец применяется к обоим полам
FAKE_CATALOG = [{ 'Показатель': 'АЛТ', 'Код': 'alt', 'Норма (мужчины)': '0-45', 'Норма (женщины)': '' }];
refreshCatalog_(null);
eq('одна норма на оба пола (male)', checkNorm_('alt', 44, 'male').status, 'normal');
eq('одна норма на оба пола (female)', checkNorm_('alt', 44, 'female').status, 'normal');

// ---------- Свой показатель (МНО) ----------
FAKE_CATALOG = [{ 'Показатель': 'МНО', 'Код': 'INR', 'Норма (мужчины)': '', 'Норма (женщины)': '' }];
refreshCatalog_(null);
eq('МНО распознаётся по названию', matchIndicatorKey_('мно'), 'INR');
eq('МНО без нормы = нет статуса', checkNorm_('INR', 1.4, 'male'), null);
eq('название МНО для вывода', indicatorLabel_('INR'), 'МНО');
eq('парсинг "МНО 1.4"', parseAnalysisText_('МНО 1.4'), { INR: 1.4 });

FAKE_CATALOG = [{ 'Показатель': 'МНО', 'Код': 'INR', 'Норма (мужчины)': '0.8-1.2', 'Норма (женщины)': '0.8-1.2' }];
refreshCatalog_(null);
eq('МНО 1.4 выше своей нормы', checkNorm_('INR', 1.4, 'male').status, 'high');
eq('МНО 1.0 в своей норме', checkNorm_('INR', 1.0, 'male').status, 'normal');

// ---------- Личные нормы (дети) ----------
FAKE_CATALOG = [];
FAKE_PERSONAL = [{ 'Кто': 'adel', 'Показатель': 'Гемоглобин', 'Код': 'hemoglobin', 'Норма': '115-145' }];
refreshCatalog_('adel');
eq('детская норма: 120 = normal', checkNorm_('hemoglobin', 120, 'female').status, 'normal');
refreshCatalog_('salim');
eq('чужая детская норма не течёт', checkNorm_('hemoglobin', 118, 'male').status, 'low');

// Личная норма побеждает справочник
FAKE_CATALOG = [{ 'Показатель': 'Гемоглобин', 'Код': 'hemoglobin', 'Норма (мужчины)': '90-110', 'Норма (женщины)': '90-110' }];
FAKE_PERSONAL = [{ 'Кто': 'adel', 'Показатель': 'Гемоглобин', 'Код': 'hemoglobin', 'Норма': '115-145' }];
refreshCatalog_('adel');
eq('личная норма важнее справочника', checkNorm_('hemoglobin', 120, 'female').status, 'normal');

// ---------- parseAnalysisText_ ----------
FAKE_CATALOG = []; FAKE_PERSONAL = [];
refreshCatalog_(null);
eq('простой показатель', parseAnalysisText_('гемоглобин 135'), { hemoglobin: 135 });
eq('несколько через запятую', parseAnalysisText_('гемоглобин 135, глюкоза 5.2'), { hemoglobin: 135, glucose: 5.2 });
eq('запятая как десятичный знак', parseAnalysisText_('глюкоза 5,2'), { glucose: 5.2 });
eq('давление', parseAnalysisText_('давление 120/80'), { systolic: 120, diastolic: 80 });
eq('длинный алиас побеждает', parseAnalysisText_('холестерин общий 5.0'), { cholesterol: 5.0 });
eq('каждый на новой строке', parseAnalysisText_('алт 30\nаст 25'), { alt: 30, ast: 25 });
eq('мусор игнорируется', parseAnalysisText_('привет как дела'), {});

// ---------- Свободная строка: «МНО 2,5 С реактивный белок 2» ----------
// Главный сценарий ручного ввода. Прежний парсер резал строку по запятым и
// на тексте без разделителей склеивал два показателя в один.
FAKE_CATALOG = [
  { 'Показатель': 'МНО', 'Код': 'INR', 'Синонимы': '', 'Норма (мужчины)': '', 'Норма (женщины)': '' },
  { 'Показатель': 'С-реактивный белок', 'Код': 'crp', 'Синонимы': 'СРБ, CRP', 'Норма (мужчины)': '0-5', 'Норма (женщины)': '0-5' }
];
FAKE_PERSONAL = [];
refreshCatalog_(null);

eq('два показателя без разделителей',
   parseAnalysisText_('МНО 2,5 С реактивный белок 2'), { INR: 2.5, crp: 2 });
eq('дефис в названии не мешает',
   parseAnalysisText_('С-реактивный белок 4'), { crp: 4 });
eq('синоним из справочника', parseAnalysisText_('СРБ 7'), { crp: 7 });
eq('латинский синоним', parseAnalysisText_('crp 7'), { crp: 7 });
eq('цифра внутри названия не значение',
   parseAnalysisText_('витамин д3 45'), { vitaminD: 45 });
eq('B12 не распадается', parseAnalysisText_('витамин b12 450'), { vitaminB12: 450 });
eq('давление вместе с остальным',
   parseAnalysisText_('давление 120/80 глюкоза 5.2'), { systolic: 120, diastolic: 80, glucose: 5.2 });
eq('запятые тоже работают',
   parseAnalysisText_('гемоглобин 135, глюкоза 5.2'), { hemoglobin: 135, glucose: 5.2 });
eq('мусор без чисел', parseAnalysisText_('привет как дела'), {});
eq('число без названия игнорируется', parseAnalysisText_('42'), {});

// Название должно стоять прямо перед числом, а не где угодно в тексте —
// иначе вопрос "дай МНО за последний год" читался бы как запись данных,
// а "контрастное вещество" — как показатель АСТ.
eq('вопрос про МНО не превращается в запись',
   parseAnalysisText_('дай мне все анализы мно за последний 1 год'), {});
eq('«аст» внутри «контрастное» не матчится',
   parseAnalysisText_('контрастное вещество 5 мл'), {});
eq('но «мно 1» отдельно всё ещё работает', parseAnalysisText_('мно 1'), { INR: 1 });
eq('аст сам по себе всё ещё работает', parseAnalysisText_('аст 30'), { ast: 30 });

// Незнакомое название не должно пропадать молча.
eq('неизвестный показатель попадает в список непонятого',
   unknownIndicators_('давление 120/80 пульс 70'), ['пульс']);
eq('всё понятно — список пуст', unknownIndicators_('гемоглобин 135'), []);
eq('несколько незнакомых',
   unknownIndicators_('пульс 70 сатурация 98'), ['пульс', 'сатурация']);

// ---------- Дата внутри свободной строки ----------
eq('дата вырезается, показатели остаются',
   parseAnalysisText_(extractDate_('МНО 2,5 15.07.2025').rest), { INR: 2.5 });
eq('дата распознана', extractDate_('МНО 2,5 15.07.2025').date, '2025-07-15');
eq('дата ISO', extractDate_('гемоглобин 135 2025-07-15').date, '2025-07-15');
eq('двузначный год', extractDate_('МНО 2 15.07.25').date, '2025-07-15');
eq('несуществующая дата не берётся', extractDate_('МНО 2 32.13.2025').date, null);
eq('без даты — null', extractDate_('МНО 2,5').date, null);
eq('«сегодня» понимается', extractDate_('гемоглобин 135 сегодня').date, todayIsoForTest());
eq('дата не съедает показатель',
   parseAnalysisText_(extractDate_('15.07.2025 гемоглобин 135').rest), { hemoglobin: 135 });

FAKE_CATALOG = []; FAKE_PERSONAL = [];
refreshCatalog_(null);

// ---------- parseFlexibleDate_ ----------
var todayIso = Utilities.formatDate(new Date(), null, null);
eq('«сегодня»', parseFlexibleDate_('сегодня'), todayIso);
eq('«-» = сегодня', parseFlexibleDate_('-'), todayIso);
eq('ДД.ММ.ГГГГ', parseFlexibleDate_('15.07.2025'), '2025-07-15');
eq('ДД/ММ/ГГГГ', parseFlexibleDate_('15/07/2025'), '2025-07-15');
eq('ГГГГ-ММ-ДД', parseFlexibleDate_('2025-07-15'), '2025-07-15');
eq('несуществующая дата', parseFlexibleDate_('32.13.2025'), null);
eq('мусор вместо даты', parseFlexibleDate_('вчера'), null);

// ---------- Справочник главнее кода ----------
// Одни и те же показатели описаны и в NORMS, и в листе. Раньше код побеждал,
// и переименование в таблице бот игнорировал.
FAKE_CATALOG = [{ 'Показатель': 'Гемоглобин (Hb)', 'Код': 'hemoglobin',
                  'Единицы': 'g/L', 'Норма (мужчины)': '', 'Норма (женщины)': '' }];
FAKE_PERSONAL = [];
refreshCatalog_(null);
eq('название из справочника важнее кода', indicatorLabel_('hemoglobin'), 'Гемоглобин (Hb)');
eq('единицы из справочника важнее кода', indicatorUnit_('hemoglobin'), 'g/L');
eq('переименованный показатель узнаётся в тексте',
   parseAnalysisText_('гемоглобин (hb) 135'), { hemoglobin: 135 });
eq('старый алиас продолжает работать', parseAnalysisText_('гем 135'), { hemoglobin: 135 });
eq('норма осталась из кода, раз в справочнике пусто',
   checkNorm_('hemoglobin', 100, 'male').status, 'low');
eq('checkNorm_ отдаёт название из справочника',
   checkNorm_('hemoglobin', 150, 'male').label, 'Гемоглобин (Hb)');
FAKE_CATALOG = []; FAKE_PERSONAL = [];
refreshCatalog_(null);

// ---------- Пол по-русски и по-английски ----------
eq('женский = женская норма', checkNorm_('hemoglobin', 125, 'женский').status, 'normal');
eq('мужской = мужская норма', checkNorm_('hemoglobin', 125, 'мужской').status, 'low');
eq('старое female ещё понимается', checkNorm_('hemoglobin', 125, 'female').status, 'normal');

// ---------- displayDate_: как дату видит человек ----------
eq('ISO → дд.мм.гггг', displayDate_('2026-08-04'), '04.08.2026');
eq('однозначные день/месяц с нулём', displayDate_('2026-01-05'), '05.01.2026');
eq('пусто остаётся пустым', displayDate_(''), '');
eq('мусор возвращается как есть', displayDate_('не дата'), 'не дата');

// ---------- normalizeDate_ ----------
// Ключевой момент широкого листа: дату Google Sheets может отдать объектом
// Date, а не строкой. Без приведения «последним» анализом становился не тот.
eq('дата-текст ISO', normalizeDate_('2025-07-15'), '2025-07-15');
eq('дата-текст ДД.ММ.ГГГГ', normalizeDate_('15.07.2025'), '2025-07-15');
eq('дата объектом Date', normalizeDate_(new Date(2025, 6, 15)), '2025-07-15');
eq('пустая ячейка', normalizeDate_(''), '');
eq('сортировка: 2025-07-15 > 2025-06-10',
   normalizeDate_(new Date(2025, 6, 15)) > normalizeDate_('10.06.2025'), true);

// ---------- Код нового показателя из справочника ----------
eq('Мочевина → mochevina', transliterate_('Мочевина'), 'mochevina');
eq('МНО → mno', transliterate_('МНО'), 'mno');
eq('С-реактивный белок', transliterate_('С-реактивный белок'), 's_reaktivnyy_belok');
eq('Витамин B12 (латиница+цифры)', transliterate_('Витамин B12'), 'vitamin_b12');
eq('код не повторяется', uniqueIndicatorKey_('МНО', ['mno']), 'mno_2');
eq('свободный код без суффикса', uniqueIndicatorKey_('МНО', ['alt']), 'mno');

// ---------- extractPeriod_: «за год», «за 6 месяцев» ----------
var today = new Date();
function yearsAgoIso(n) { var d = new Date(today); d.setFullYear(d.getFullYear() - n); return Utilities.formatDate(d, null, null); }
function monthsAgoIso(n) { var d = new Date(today); d.setMonth(d.getMonth() - n); return Utilities.formatDate(d, null, null); }
function daysAgoIso(n) { var d = new Date(today); d.setDate(d.getDate() - n); return Utilities.formatDate(d, null, null); }

eq('«за 1 год»', extractPeriod_('МНО за 1 год').sinceDate, yearsAgoIso(1));
eq('«за год» без числа = 1 год', extractPeriod_('МНО за год').sinceDate, yearsAgoIso(1));
eq('«за последний год» — прилагательное не мешает', extractPeriod_('МНО за последний год').sinceDate, yearsAgoIso(1));
eq('исходная фраза пользователя из бага', extractPeriod_('дай мне все анализы МНО за последний 1 год').sinceDate, yearsAgoIso(1));
eq('«за 6 месяцев»', extractPeriod_('гемоглобин за 6 месяцев').sinceDate, monthsAgoIso(6));
eq('«за неделю» = 7 дней', extractPeriod_('узи за неделю').sinceDate, daysAgoIso(7));
eq('«за 30 дней»', extractPeriod_('мно за 30 дней').sinceDate, daysAgoIso(30));
eq('без периода — вся история (null)', extractPeriod_('гемоглобин').sinceDate, null);
eq('«годовщина» не ловится как период', extractPeriod_('за годовщину свадьбы 5').sinceDate, null);
eq('«за полгода»', extractPeriod_('ферритин за полгода').sinceDate, monthsAgoIso(6));
eq('«за пол года» раздельно', extractPeriod_('ферритин за пол года').sinceDate, monthsAgoIso(6));
eq('«за последние полгода»', extractPeriod_('ферритин за последние полгода').sinceDate, monthsAgoIso(6));
eq('«полгода» вырезается из текста', extractPeriod_('ферритин за полгода').rest.indexOf('полгода'), -1);
eq('период вырезается из текста', extractPeriod_('МНО за 1 год').rest.indexOf('год'), -1);
eq('название остаётся после вырезания периода',
   extractPeriod_('МНО за 1 год').rest.replace(/\s+/g, ' ').trim(), 'МНО');

// ---------- containsIndicatorKey_: вопрос, а не запись ----------
FAKE_CATALOG = [{ 'Показатель': 'МНО', 'Код': 'INR', 'Норма (мужчины)': '', 'Норма (женщины)': '' }];
FAKE_PERSONAL = [];
refreshCatalog_(null);
eq('находит показатель в вопросе', containsIndicatorKey_('покажи мно за год'), 'INR');
FAKE_CATALOG = []; refreshCatalog_(null);
eq('находит показатель сам по себе', containsIndicatorKey_('гемоглобин'), 'hemoglobin');
eq('«аст» внутри «контрастное» не находится', containsIndicatorKey_('контрастное вещество'), null);
eq('длинное название побеждает короткое', containsIndicatorKey_('холестерин общий'), 'cholesterol');
eq('ничего не найдено — null', containsIndicatorKey_('как погода сегодня'), null);

// ---------- Падежи: «результат ферритина Салима» ----------
// Реальный случай пользователя: длинные названия должны находиться и в
// склонённой форме, а короткие аббревиатуры — только точным словом, иначе
// «мно» как приставка совпало бы с «много».
eq('родительный падеж: «ферритина»', containsIndicatorKey_('дай результат ферритина за полгода'), 'ferritin');
eq('творительный падеж: «гемоглобином»', containsIndicatorKey_('что с гемоглобином'), 'hemoglobin');
eq('«глюкозы» находит «глюкоза» (замена гласной)', containsIndicatorKey_('какая была глюкозы'), 'glucose');
eq('короткая аббревиатура «мно» не путается с «много»',
   containsIndicatorKey_('у нас много всего скопилось'), null);
FAKE_CATALOG = [{ 'Показатель': 'МНО', 'Код': 'INR', 'Норма (мужчины)': '', 'Норма (женщины)': '' }];
refreshCatalog_(null);
eq('«мно» точным словом всё ещё находится', containsIndicatorKey_('мно за год'), 'INR');
FAKE_CATALOG = []; refreshCatalog_(null);

// ---------- matchExamFilter_: «узи за год», «обследования» ----------
FAKE_EXAMS = [
  { 'Группа': 'УЗИ', 'Название': 'УЗИ органов брюшной полости', 'Что смотрят / примечание': '' },
  { 'Группа': 'УЗИ', 'Название': 'УЗИ щитовидной железы', 'Что смотрят / примечание': '' },
  { 'Группа': 'Диагностика', 'Название': 'ЭКГ', 'Что смотрят / примечание': '' }
];
eq('конкретное название находится', matchExamFilter_('покажи УЗИ щитовидной железы'), { type: 'name', value: 'УЗИ щитовидной железы' });
eq('группа находится по слову «узи»', matchExamFilter_('узи за год'), { type: 'group', value: 'УЗИ' });
eq('«обследования» без уточнения — все подряд', matchExamFilter_('покажи обследования за год'), { type: 'all' });
eq('ничего похожего — null', matchExamFilter_('покажи анализы'), null);
FAKE_EXAMS = [];

// ---------- Итог ----------
var out = '\n' + (failed ? log.join('\n') + '\n\n' : '') +
  (failed === 0 ? '✅ Все ' + passed + ' проверок прошли' : '❌ Провалено: ' + failed + ', прошло: ' + passed);
out;
