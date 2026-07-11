// ===== SCHEDULED TRIGGERS =====
// Apps Script time-driven triggers are free — this replaces any need for a paid
// cron service. Run setupTriggers() once (from the Apps Script editor) after
// TELEGRAM_CHAT_ID is set in the Config sheet (happens automatically on /start).

function setupTriggers() {
  deleteTriggersFor_('dailyCheckin');
  deleteTriggersFor_('weeklyReport');

  ScriptApp.newTrigger('dailyCheckin')
    .timeBased()
    .everyDays(1)
    .atHour(20)
    .create();

  ScriptApp.newTrigger('weeklyReport')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(19)
    .create();
}

function deleteTriggersFor_(handlerName) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === handlerName) ScriptApp.deleteTrigger(t);
  });
}

/** Evening prompt: "what did you do for your health today?" — one profile picker per family. */
function dailyCheckin() {
  var chatId = getConfig('TELEGRAM_CHAT_ID');
  if (!chatId) return; // nobody has run /start yet
  var profiles = getProfiles();
  sendMessage(chatId, '🌙 Как прошёл день? Что сделали для здоровья? Выберите, за кого отвечаете:', checkinInlineKeyboard(profiles));
}

/** Sunday summary across all profiles for the past 7 days. */
function weeklyReport() {
  var chatId = getConfig('TELEGRAM_CHAT_ID');
  if (!chatId) return;
  var since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  var profiles = getProfiles();

  var text = '📈 Еженедельный отчёт семьи\n';
  profiles.forEach(function (p) {
    var checkins = getCheckinsSince(p.id, since);
    var workouts = getWorkoutsSince(p.id, since);
    var analyses = getAnalysesSince(p.id, since);
    var goals = getGoals(p.id);
    text += '\n<b>' + escapeHtml_(p.name) + '</b>\n' +
      '✅ Чек-инов: ' + checkins.length + ' · 🏋️ Тренировок: ' + workouts.length +
      ' · 📊 Анализов: ' + analyses.length + ' · 🎯 Целей: ' + goals.length + '\n';
  });

  sendMessage(chatId, text);
}
