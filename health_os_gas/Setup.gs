// ===== НАСТРОЙКА =====
// Запускается вручную из редактора Apps Script один раз при развёртывании.
// Все три функции безопасно запускать повторно.

/**
 * Шаг 1. Создать лист Sessions (единственный новый лист — остальные 8 уже
 * есть в таблице от Python-версии и используются как есть).
 */
function setup() {
  var sheet = ss_().getSheetByName(SHEET_SESSIONS);
  if (!sheet) {
    sheet = ss_().insertSheet(SHEET_SESSIONS);
    sheet.appendRow(['chat_id', 'state', 'data_json', 'updated_at']);
    Logger.log('Лист Sessions создан.');
  } else {
    Logger.log('Лист Sessions уже существует.');
  }

  var required = [SHEET_FAMILY, SHEET_USERS, SHEET_LOGS, SHEET_MEDICAL, SHEET_KB, SHEET_ANALYSES];
  var missing = required.filter(function (name) { return !ss_().getSheetByName(name); });
  if (missing.length) {
    Logger.log('ВНИМАНИЕ: не найдены листы: ' + missing.join(', '));
  } else {
    Logger.log('Все нужные листы на месте. Дальше — setWebhook().');
  }
}

/**
 * Шаг 2. Сказать Telegram, куда слать сообщения.
 * ВАЖНО: сначала «Начать развёртывание» → «Веб-приложение», скопировать URL
 * и вставить его ниже вместо WEB_APP_URL_СЮДА.
 */
function setWebhook() {
  var url = 'WEB_APP_URL_СЮДА';
  if (url.indexOf('http') !== 0) {
    throw new Error('Сначала вставьте URL веб-приложения в функцию setWebhook().');
  }
  var res = tgCall_('setWebhook', { url: url, drop_pending_updates: true });
  Logger.log(JSON.stringify(res));
}

/** Проверка: куда сейчас Telegram шлёт сообщения и нет ли ошибок. */
function getWebhookInfo() {
  var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + getBotToken_() + '/getWebhookInfo');
  Logger.log(res.getContentText());
}

/** Аварийно отключить webhook (например, чтобы вернуться к Python-боту на Mac). */
function deleteWebhook() {
  Logger.log(JSON.stringify(tgCall_('deleteWebhook', {})));
}
