// ===== НАСТРОЙКА =====
// Запускается вручную из редактора Apps Script один раз при развёртывании.
// Все три функции безопасно запускать повторно.

/** Шаг 1. Создать служебный лист диалогов и проверить, что остальные на месте. */
function setup() {
  var sheet = ss_().getSheetByName(SHEET_SESSIONS);
  if (!sheet) {
    sheet = ss_().insertSheet(SHEET_SESSIONS);
    sheet.appendRow(['Чат', 'Шаг', 'Данные', 'Обновлено']);
    Logger.log('Служебный лист создан.');
  } else {
    Logger.log('Служебный лист уже существует.');
  }

  var required = [SHEET_FAMILY, SHEET_USERS, SHEET_MEDICAL, SHEET_ANALYSES];
  var missing = required.filter(function (name) { return !ss_().getSheetByName(name); });
  if (missing.length) {
    Logger.log('ВНИМАНИЕ: не найдены листы: ' + missing.join(', '));
  } else {
    Logger.log('Все нужные листы на месте. Дальше — startPolling().');
  }
}

/**
 * Шаг 2. Включить бота — см. startPolling() в Polling.gs.
 *
 * Функции setWebhook здесь больше нет. Webhook на Apps Script не работает:
 * Google на любой запрос отвечает редиректом 302, Telegram считает доставку
 * неудачной и присылает то же сообщение снова — так однажды и получилось
 * 30 приветствий подряд. Бот забирает сообщения сам через getUpdates.
 */

/** Проверка: не остался ли где-то webhook (он ломает getUpdates ошибкой 409). */
function getWebhookInfo() {
  var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + getBotToken_() + '/getWebhookInfo');
  Logger.log(res.getContentText());
}

/** Снять webhook. Вызывается автоматически из startPolling(). */
function deleteWebhook() {
  Logger.log(JSON.stringify(tgCall_('deleteWebhook', {})));
}
