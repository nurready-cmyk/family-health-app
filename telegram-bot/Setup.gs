// ===== ONE-TIME PROJECT SETUP =====
// Run setup() once from the Apps Script editor (select it in the function
// dropdown, then Run) after `clasp create --type sheets` has bound this
// script to a spreadsheet. Creates every tab with its header row and seeds
// the 4 family profiles. Safe to re-run — it never deletes existing rows.

var SHEET_HEADERS = {
  Config: ['key', 'value'],
  Profiles: ['id', 'name', 'gender', 'birthYear'],
  Analyses: ['id', 'profileId', 'date', 'indicatorKey', 'value'],
  Workouts: ['id', 'profileId', 'date', 'type', 'duration', 'exercises'],
  Nutrition: ['id', 'profileId', 'date', 'foodName', 'grams'],
  Goals: ['id', 'profileId', 'title', 'metric', 'current', 'target', 'deadline'],
  Checkins: ['id', 'profileId', 'date', 'text'],
  PersonalRules: ['id', 'profileId', 'triggerKeywords', 'recommendationText', 'createdAt'],
  Sessions: ['chatId', 'step', 'tempDataJson']
};

var DEFAULT_PROFILES = [
  { id: 'profile1', name: 'Я', gender: 'male', birthYear: 1990 },
  { id: 'profile2', name: 'Жена', gender: 'female', birthYear: 1992 },
  { id: 'profile3', name: 'Сын', gender: 'male', birthYear: 2015 },
  { id: 'profile4', name: 'Дочь', gender: 'female', birthYear: 2017 }
];

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  Object.keys(SHEET_HEADERS).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
    }
    if (sh.getLastRow() === 0) {
      sh.appendRow(SHEET_HEADERS[name]);
      sh.setFrozenRows(1);
    }
  });

  // Remove the default "Sheet1" Apps Script creates if it's still empty and unused.
  var default1 = ss.getSheetByName('Sheet1');
  if (default1 && default1.getLastRow() === 0 && ss.getSheets().length > 1) {
    ss.deleteSheet(default1);
  }

  if (getProfiles().length === 0) {
    DEFAULT_PROFILES.forEach(function (p) {
      append_(SHEETS.PROFILES, p);
    });
    Logger.log('Засеяно 4 профиля: Я / Жена / Сын / Дочь. Отредактируйте имена и год рождения прямо в листе Profiles.');
  }

  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TELEGRAM_BOT_TOKEN')) {
    Logger.log('ВАЖНО: задайте TELEGRAM_BOT_TOKEN в Project Settings → Script Properties (токен от @BotFather).');
  }
  if (!props.getProperty('MIGRATION_SECRET')) {
    var secret = Utilities.getUuid();
    props.setProperty('MIGRATION_SECRET', secret);
    Logger.log('Сгенерирован MIGRATION_SECRET: ' + secret + ' — используйте его в форме миграции на profiles.html.');
  }

  Logger.log('Готово. Листы созданы. Дальше: задеплойте Web App, вызовите setWebhook, затем setupTriggers().');
}
