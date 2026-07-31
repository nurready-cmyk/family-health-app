// ===== ОПРОС TELEGRAM ПО РАСПИСАНИЮ =====
// Webhook-вариант несовместим с Apps Script: Telegram требует в ответ чистый
// «200 OK», а Apps Script на любой запрос отвечает переадресацией «302».
// Telegram считал каждую доставку неудачной и повторял её — одно сообщение
// обрабатывалось десятки раз. Поэтому бот сам забирает новые сообщения
// через getUpdates (как это делала Python-версия, только по расписанию
// Google, а не бесконечным циклом).
//
// ---------- Почему опрос «адаптивный» ----------
// Чаще одного раза в минуту Google триггеры запускать не умеет. Если просто
// спрашивать раз в минуту и выходить, то каждое нажатие кнопки ждёт до 60
// секунд — именно так бот и выглядит «зависшим», хотя он исправен.
//
// Держать запуск открытым постоянно тоже нельзя: у обычного аккаунта Google
// на все триггеры отведено 90 минут работы в сутки, и непрерывный опрос
// съест их за полтора часа, после чего бот замолчит до завтра.
//
// Отсюда компромисс: в тишине запуск длится долю секунды, а как только
// пришло первое сообщение — бот остаётся на линии и ждёт продолжения
// диалога (long polling: Telegram отвечает сам, как только что-то есть).
// Первое сообщение после паузы ждёт до минуты, всё остальное внутри
// диалога — доли секунды. Кнопки перестают «залипать» именно там, где это
// раздражает: в середине сценария.

var POLL_BURST_MS = 50000;     // сколько держим запуск после активности
var POLL_WAIT_SECONDS = 25;    // насколько долго Telegram держит наш запрос

function poll() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;  // предыдущий запуск ещё на линии — он и заберёт

  var props = PropertiesService.getScriptProperties();
  var startedAt = Date.now();
  try {
    var offset = Number(props.getProperty('UPDATES_OFFSET') || 0);
    var active = false;

    while (true) {
      var remainingMs = POLL_BURST_MS - (Date.now() - startedAt);
      // Пока диалога нет — спрашиваем и сразу уходим (timeout 0).
      // Как только диалог начался — ждём ответа Telegram, но не дольше,
      // чем нам осталось до конца запуска.
      var wait = active
        ? Math.min(POLL_WAIT_SECONDS, Math.floor(remainingMs / 1000) - 2)
        : 0;
      if (active && wait < 1) return;

      var res = tgCall_('getUpdates', {
        offset: offset,
        timeout: wait,
        allowed_updates: ['message', 'callback_query']
      });

      // ok === false — это почти всегда 409 «webhook is active».
      // Без записи в журнал бот выглядел бы просто молчащим.
      if (!res.ok) { Logger.log('getUpdates отказал: ' + JSON.stringify(res)); return; }

      var updates = res.result || [];
      if (!updates.length) {
        if (!active) return;              // тишина и до этого ничего не было
        if (remainingMs <= 0) return;     // время запуска вышло
        continue;                         // ждём дальше, диалог ещё живой
      }

      active = true;
      for (var i = 0; i < updates.length; i++) {
        var update = updates[i];
        // Сначала подтверждаем получение (сдвигаем offset), потом обрабатываем:
        // если обработка упадёт, сообщение потеряется один раз, но никогда
        // не задвоится — после истории с 30 приветствиями это важнее.
        offset = update.update_id + 1;
        props.setProperty('UPDATES_OFFSET', String(offset));
        try {
          handleUpdate_(update);
        } catch (err) {
          Logger.log('Ошибка обработки апдейта ' + update.update_id + ': ' + err + '\n' + (err.stack || ''));
        }
      }

      if (Date.now() - startedAt > POLL_BURST_MS) return;
    }
  } finally {
    recordBudget_(props, Date.now() - startedAt);
    lock.releaseLock();
  }
}

/**
 * Копим, сколько секунд в сутки съел опрос. Одна запись свойства на запуск —
 * дёшево, в отличие от строки в таблице: диагностика не должна сама
 * становиться источником задержки, ради которой её и заводили.
 */
function recordBudget_(props, elapsedMs) {
  try {
    var key = 'POLL_SECONDS_' +
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    props.setProperty(key, String(
      Math.round(Number(props.getProperty(key) || 0) + elapsedMs / 1000)));
  } catch (e) { /* счётчик не стоит того, чтобы из-за него падать */ }
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

/**
 * Сколько минут в сутки бот уже потратил из отведённых Google 90.
 * Пригодится, если бот начнёт замолкать к вечеру: значит, POLL_BURST_MS
 * стоит уменьшить.
 */
function checkTriggerBudget() {
  var props = PropertiesService.getScriptProperties();
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  Logger.log('Сегодня (' + today + ') израсходовано примерно ' +
    (Number(props.getProperty('POLL_SECONDS_' + today) || 0) / 60).toFixed(1) +
    ' мин из 90. Точные цифры — в «Выполнения» слева.');
}
