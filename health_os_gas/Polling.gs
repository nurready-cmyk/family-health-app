// ===== ОПРОС TELEGRAM ПО РАСПИСАНИЮ =====
// Webhook-вариант несовместим с Apps Script: Telegram требует в ответ чистый
// «200 OK», а Apps Script на любой запрос отвечает переадресацией «302».
// Telegram считал каждую доставку неудачной и повторял её — одно сообщение
// обрабатывалось десятки раз. Поэтому бот сам забирает новые сообщения
// раз в минуту через getUpdates (как это делала Python-версия, только
// по расписанию Google, а не бесконечным циклом).

function poll() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return; // предыдущий запуск ещё не закончил — выходим
  try {
    var props = PropertiesService.getScriptProperties();
    while (true) {
      var offset = Number(props.getProperty('UPDATES_OFFSET') || 0);
      var res = tgCall_('getUpdates', {
        offset: offset,
        timeout: 0,
        allowed_updates: ['message', 'callback_query']
      });
      // res.ok === false — это почти всегда 409 «webhook is active»:
      // без записи в журнал бот выглядел бы просто молчащим.
      if (!res.ok) { Logger.log('getUpdates отказал: ' + JSON.stringify(res)); return; }
      if (!res.result || !res.result.length) return;

      for (var i = 0; i < res.result.length; i++) {
        var update = res.result[i];
        // Сначала подтверждаем получение (сдвигаем offset), потом обрабатываем:
        // если обработка упадёт, сообщение потеряется один раз, но никогда
        // не задвоится — после истории с 30 приветствиями это важнее.
        props.setProperty('UPDATES_OFFSET', String(update.update_id + 1));
        try {
          handleUpdate_(update);
        } catch (err) {
          Logger.log('Ошибка обработки апдейта ' + update.update_id + ': ' + err + '\n' + (err.stack || ''));
        }
      }
    }
  } finally {
    lock.releaseLock();
  }
}

/** Включить бота: проверяет новые сообщения каждую минуту. Запускать один раз. */
function startPolling() {
  stopPolling();
  // Пока у бота зарегистрирован webhook, Telegram отвечает на getUpdates
  // ошибкой 409 и опрос молча не работает. Снимаем его до создания триггера.
  deleteWebhook();
  ScriptApp.newTrigger('poll').timeBased().everyMinutes(1).create();
  Logger.log('✅ Опрос включён: бот проверяет новые сообщения каждую минуту.');
}

/** Полностью выключить бота (например, чтобы вернуться на Python-версию). */
function stopPolling() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'poll') ScriptApp.deleteTrigger(t);
  });
  Logger.log('Опрос выключен.');
}
