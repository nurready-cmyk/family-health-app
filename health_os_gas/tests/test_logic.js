// Прогон чистой логики GAS-файлов на движке JavaScriptCore (osascript -l JavaScript).
// Google-специфичные объекты подменены заглушками — проверяем только те функции,
// которые не ходят в сеть/таблицу: разбор текста, нормы, даты, id.

ObjC.import('Foundation');

function readFile(path) {
  return $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null).js;
}

var BASE = '/Users/nurland/Documents/БИЗНЕС/Архив/HealthApp/health_os_gas/';

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
var SHEET_CATALOG = 'Справочник_Анализов';
var SHEET_PERSONAL_NORMS = 'Личные_Нормы';
function readAll_(name) {
  if (name === SHEET_CATALOG) return FAKE_CATALOG;
  if (name === SHEET_PERSONAL_NORMS) return FAKE_PERSONAL;
  return [];
}

// --- Загружаем проверяемый код ---
eval(readFile(BASE + 'Norms.gs'));

// Из Main.gs берём только parseFlexibleDate_ (остальное лезет в сеть).
var mainSrc = readFile(BASE + 'Main.gs');
var dateFn = mainSrc.match(/function parseFlexibleDate_[\s\S]*?\n}\n/)[0];
eval(dateFn);

// Из Sheets.gs — только slugifyName_.
var sheetsSrc = readFile(BASE + 'Sheets.gs');
var slugFn = sheetsSrc.match(/function slugifyName_[\s\S]*?\n}\n/)[0];
eval(slugFn);

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

// ---------- Переопределение нормы из справочника ----------
FAKE_CATALOG = [{ 'Русское название': 'Гемоглобин', 'Код (indicator_key)': 'hemoglobin', 'Норма (мужчины)': '100-200', 'Норма (женщины)': '100-200' }];
refreshCatalog_(null);
eq('своя норма из справочника', checkNorm_('hemoglobin', 125, 'male').status, 'normal');

// Один заполненный столбец применяется к обоим полам
FAKE_CATALOG = [{ 'Русское название': 'АЛТ', 'Код (indicator_key)': 'alt', 'Норма (мужчины)': '0-45', 'Норма (женщины)': '' }];
refreshCatalog_(null);
eq('одна норма на оба пола (male)', checkNorm_('alt', 44, 'male').status, 'normal');
eq('одна норма на оба пола (female)', checkNorm_('alt', 44, 'female').status, 'normal');

// ---------- Свой показатель (МНО) ----------
FAKE_CATALOG = [{ 'Русское название': 'МНО', 'Код (indicator_key)': 'INR', 'Норма (мужчины)': '', 'Норма (женщины)': '' }];
refreshCatalog_(null);
eq('МНО распознаётся по названию', matchIndicatorKey_('мно'), 'INR');
eq('МНО без нормы = нет статуса', checkNorm_('INR', 1.4, 'male'), null);
eq('название МНО для вывода', indicatorLabel_('INR'), 'МНО');
eq('парсинг "МНО 1.4"', parseAnalysisText_('МНО 1.4'), { INR: 1.4 });

FAKE_CATALOG = [{ 'Русское название': 'МНО', 'Код (indicator_key)': 'INR', 'Норма (мужчины)': '0.8-1.2', 'Норма (женщины)': '0.8-1.2' }];
refreshCatalog_(null);
eq('МНО 1.4 выше своей нормы', checkNorm_('INR', 1.4, 'male').status, 'high');
eq('МНО 1.0 в своей норме', checkNorm_('INR', 1.0, 'male').status, 'normal');

// ---------- Личные нормы (дети) ----------
FAKE_CATALOG = [];
FAKE_PERSONAL = [{ 'family_member_id': 'adel', 'Русское название': 'Гемоглобин', 'Код (indicator_key)': 'hemoglobin', 'Норма': '115-145' }];
refreshCatalog_('adel');
eq('детская норма: 120 = normal', checkNorm_('hemoglobin', 120, 'female').status, 'normal');
refreshCatalog_('salim');
eq('чужая детская норма не течёт', checkNorm_('hemoglobin', 118, 'male').status, 'low');

// Личная норма побеждает справочник
FAKE_CATALOG = [{ 'Русское название': 'Гемоглобин', 'Код (indicator_key)': 'hemoglobin', 'Норма (мужчины)': '90-110', 'Норма (женщины)': '90-110' }];
FAKE_PERSONAL = [{ 'family_member_id': 'adel', 'Русское название': 'Гемоглобин', 'Код (indicator_key)': 'hemoglobin', 'Норма': '115-145' }];
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

// ---------- parseFlexibleDate_ ----------
var todayIso = Utilities.formatDate(new Date(), null, null);
eq('«сегодня»', parseFlexibleDate_('сегодня'), todayIso);
eq('«-» = сегодня', parseFlexibleDate_('-'), todayIso);
eq('ДД.ММ.ГГГГ', parseFlexibleDate_('15.07.2025'), '2025-07-15');
eq('ДД/ММ/ГГГГ', parseFlexibleDate_('15/07/2025'), '2025-07-15');
eq('ГГГГ-ММ-ДД', parseFlexibleDate_('2025-07-15'), '2025-07-15');
eq('несуществующая дата', parseFlexibleDate_('32.13.2025'), null);
eq('мусор вместо даты', parseFlexibleDate_('вчера'), null);

// ---------- slugifyName_ ----------
eq('Адель → adel', slugifyName_('Адель'), 'adel');
eq('Салим → salim', slugifyName_('Салим'), 'salim');
eq('Нурлан → nurla (5 симв.)', slugifyName_('Нурлан'), 'nurla');
eq('Гульнара → gulna', slugifyName_('Гульнара'), 'gulna');

// ---------- Итог ----------
var out = '\n' + (failed ? log.join('\n') + '\n\n' : '') +
  (failed === 0 ? '✅ Все ' + passed + ' проверок прошли' : '❌ Провалено: ' + failed + ', прошло: ' + passed);
out;
