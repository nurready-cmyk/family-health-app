// ===== TELEGRAM BOT API =====
// Прямые вызовы api.telegram.org через UrlFetchApp — без библиотек.
// Токен хранится в Script Properties (Настройки проекта → Свойства скрипта),
// не в коде.

function getBotToken_() {
  var token = PropertiesService.getScriptProperties().getProperty('BOT_TOKEN');
  if (!token) throw new Error('BOT_TOKEN не задан в Script Properties.');
  return token;
}

function tgCall_(method, payload) {
  var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + getBotToken_() + '/' + method, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var body = res.getContentText();
  // Telegram отвечает 200-кодом далеко не всегда, а отказ в отправке —
  // это ровно тот случай, когда бот выглядит молчащим при исправном опросе.
  if (res.getResponseCode() >= 300) {
    Logger.log('Telegram API error [' + method + ']: ' + body);
    logError_('Telegram ' + method, new Error(body));
  }
  return JSON.parse(body);
}

/**
 * Экранировать текст, который пришёл от человека или от модели, перед вставкой
 * в сообщение с parse_mode: HTML. Без этого символ «<» в свободном тексте
 * (например, описании особенности) ломает разбор на стороне Telegram —
 * сообщение просто не доходит, и бот выглядит зависшим.
 */
function esc_(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sendMessage(chatId, text, replyMarkup) {
  var payload = { chat_id: chatId, text: text, parse_mode: 'HTML' };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return tgCall_('sendMessage', payload);
}

function answerCallbackQuery(callbackQueryId, text) {
  return tgCall_('answerCallbackQuery', { callback_query_id: callbackQueryId, text: text || '' });
}

/** Скачать файл Telegram (голос/фото) как Blob. */
function downloadTelegramFile_(fileId) {
  var info = tgCall_('getFile', { file_id: fileId });
  if (!info.ok) throw new Error('Не удалось получить файл из Telegram');
  var url = 'https://api.telegram.org/file/bot' + getBotToken_() + '/' + info.result.file_path;
  return UrlFetchApp.fetch(url).getBlob();
}

// ---------- Клавиатуры ----------

var MENU_ANALYSIS = '📊 Анализы';
var MENU_EXAM = '🩺 Обследования';
var MENU_REPORT = '📈 Отчёт';
var MENU_FEATURE = '🧬 Особенности';

/** Постоянное меню внизу чата. */
function mainMenuKeyboard() {
  return {
    keyboard: [
      [MENU_ANALYSIS, MENU_EXAM],
      [MENU_REPORT, MENU_FEATURE]
    ],
    resize_keyboard: true
  };
}

/** Выбор члена семьи. callback_data: "member:<id>" */
function membersKeyboard(members) {
  return {
    inline_keyboard: members.map(function (m) {
      return [{ text: m.name, callback_data: 'member:' + m.id }];
    })
  };
}

/** Пол при добавлении члена семьи. */
function genderKeyboard() {
  return {
    inline_keyboard: [
      [{ text: 'Мужской', callback_data: 'gender:мужской' }],
      [{ text: 'Женский', callback_data: 'gender:женский' }]
    ]
  };
}

var FEATURE_TYPES = [
  'Аллергия',
  'Непереносимость',
  'Хроническое заболевание',
  'Ограничение по питанию',
  'Постоянное лекарство',
  'Перенесённая операция',
  'Прочее'
];

/** Тип особенности. callback_data: "feature:<номер в FEATURE_TYPES>" */
function featureTypesKeyboard() {
  return {
    inline_keyboard: FEATURE_TYPES.map(function (t, i) {
      return [{ text: t, callback_data: 'feature:' + i }];
    })
  };
}

/** Подтверждение того, что бот увидел на фото, перед сохранением. */
function confirmKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '✅ Да, сохранить', callback_data: 'confirm:yes' }],
      [{ text: '✏️ Отмена', callback_data: 'confirm:no' }]
    ]
  };
}

// ---------- Разбор апдейта ----------

/**
 * Привести сырой Telegram-апдейт к простому виду.
 * userId — от кого пришло (для прав), chatId — куда отвечать.
 */
function parseUpdate_(update) {
  var msg = update.message;
  if (msg) {
    return {
      chatId: msg.chat.id,
      userId: msg.from.id,
      text: msg.text != null ? msg.text.trim() : null,
      photoFileId: msg.photo ? msg.photo[msg.photo.length - 1].file_id : null,
      callbackData: null,
      callbackQueryId: null
    };
  }
  if (update.callback_query) {
    return {
      chatId: update.callback_query.message.chat.id,
      userId: update.callback_query.from.id,
      text: null,
      photoFileId: null,
      callbackData: update.callback_query.data,
      callbackQueryId: update.callback_query.id
    };
  }
  return null;
}
