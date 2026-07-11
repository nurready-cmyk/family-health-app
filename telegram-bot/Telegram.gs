// ===== TELEGRAM BOT API HELPERS =====
// Plain UrlFetchApp calls to api.telegram.org — no library, no paid tier, no key beyond
// the free bot token from @BotFather (stored in Script Properties, not in code).

function getBotToken_() {
  var token = PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN');
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN не задан. Запустите setup() из Setup.gs.');
  return token;
}

function tgApiUrl_(method) {
  return 'https://api.telegram.org/bot' + getBotToken_() + '/' + method;
}

function tgCall_(method, payload) {
  var res = UrlFetchApp.fetch(tgApiUrl_(method), {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code >= 300) {
    Logger.log('Telegram API error [' + method + ']: ' + res.getContentText());
  }
  return JSON.parse(res.getContentText());
}

function sendMessage(chatId, text, replyMarkup) {
  var payload = { chat_id: chatId, text: text, parse_mode: 'HTML' };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return tgCall_('sendMessage', payload);
}

function answerCallbackQuery(callbackQueryId, text) {
  return tgCall_('answerCallbackQuery', { callback_query_id: callbackQueryId, text: text || '' });
}

// ---------- Keyboards ----------

/** Persistent reply keyboard shown at the bottom of the chat. */
function mainMenuKeyboard() {
  return {
    keyboard: [
      ['📊 Анализы', '🏋️ Тренировка'],
      ['🍽️ Питание', '🎯 Цели'],
      ['📈 Отчёт', '🧠 Моё правило'],
      ['🔄 Профиль']
    ],
    resize_keyboard: true
  };
}

/** Inline profile-switch keyboard. callback_data: "profile:<id>" */
function profileInlineKeyboard(profiles) {
  return {
    inline_keyboard: profiles.map(function (p) {
      return [{ text: p.name, callback_data: 'profile:' + p.id }];
    })
  };
}

/** Inline keyboard used by the evening check-in trigger. callback_data: "checkin:<profileId>" */
function checkinInlineKeyboard(profiles) {
  return {
    inline_keyboard: profiles.map(function (p) {
      return [{ text: p.name, callback_data: 'checkin:' + p.id }];
    })
  };
}

// ---------- Update parsing ----------

/**
 * Normalize a raw Telegram update into { chatId, text, callbackData, callbackQueryId }.
 * Returns null for update types we don't handle (e.g. edited_message, channel_post).
 */
function parseTelegramUpdate(update) {
  if (update.message && update.message.text != null) {
    return {
      chatId: update.message.chat.id,
      text: update.message.text.trim(),
      callbackData: null,
      callbackQueryId: null,
      fileId: null
    };
  }
  if (update.message && (update.message.photo || update.message.document)) {
    var fileId = update.message.photo
      ? update.message.photo[update.message.photo.length - 1].file_id // largest size
      : update.message.document.file_id;
    return {
      chatId: update.message.chat.id,
      text: update.message.caption || null,
      callbackData: null,
      callbackQueryId: null,
      fileId: fileId
    };
  }
  if (update.callback_query) {
    return {
      chatId: update.callback_query.message.chat.id,
      text: null,
      callbackData: update.callback_query.data,
      callbackQueryId: update.callback_query.id,
      fileId: null
    };
  }
  return null;
}

/** Download a Telegram file by file_id and save it to a Drive folder (free storage). */
function saveTelegramFileToDrive(fileId, profileName) {
  var fileInfo = tgCall_('getFile', { file_id: fileId });
  if (!fileInfo.ok) throw new Error('Не удалось получить файл из Telegram');
  var filePath = fileInfo.result.file_path;
  var url = 'https://api.telegram.org/file/bot' + getBotToken_() + '/' + filePath;
  var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var blob = response.getBlob();

  var folderName = 'HealthApp — бланки анализов';
  var folders = DriveApp.getFoldersByName(folderName);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

  var name = (profileName || 'family') + '_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmmss');
  blob.setName(name + '.' + (filePath.split('.').pop() || 'jpg'));
  var file = folder.createFile(blob);
  return file.getUrl();
}
