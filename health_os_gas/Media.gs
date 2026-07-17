// ===== ГОЛОС И ФОТО ЧЕРЕЗ OPENAI =====
// Замена локальным сервисам Python-версии: faster-whisper (крутился на Mac и
// на серверах Google работать не может) → Whisper API. Фото и разбор текста —
// те же модели, что были: gpt-4o и gpt-4o-mini.

function getOpenAiKey_() {
  var key = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!key) throw new Error('OPENAI_API_KEY не задан в Script Properties.');
  return key;
}

function openAiChat_(model, messages) {
  var res = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + getOpenAiKey_() },
    payload: JSON.stringify({ model: model, messages: messages, temperature: 0 }),
    muteHttpExceptions: true
  });
  var body = JSON.parse(res.getContentText());
  if (body.error) throw new Error('OpenAI: ' + body.error.message);
  return body.choices[0].message.content;
}

/** Расшифровать голосовое сообщение (Telegram отдаёт .oga/opus — Whisper его понимает). */
function transcribeVoice_(fileId) {
  var blob = downloadTelegramFile_(fileId).setName('voice.oga');
  var res = UrlFetchApp.fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'post',
    headers: { Authorization: 'Bearer ' + getOpenAiKey_() },
    payload: { file: blob, model: 'whisper-1', language: 'ru' },
    muteHttpExceptions: true
  });
  var body = JSON.parse(res.getContentText());
  if (body.error) throw new Error('Whisper: ' + body.error.message);
  return body.text;
}

/**
 * Вытащить метрику дневника из расшифрованной речи.
 * Возвращает { metricType, value, notes } или null.
 */
function extractMetricFromText_(text) {
  var prompt =
    'Извлеки из текста запись дневника здоровья. Ответь ТОЛЬКО JSON без пояснений:\n' +
    '{"metric_type":"sleep|food|workout|energy","value":"кратко","notes":"контекст или пустая строка"}\n' +
    'Если запись не про сон/питание/тренировку/самочувствие — ответь {"metric_type":null}.\n\n' +
    'Текст: ' + text;
  var raw = openAiChat_('gpt-4o-mini', [{ role: 'user', content: prompt }]);
  try {
    var parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    if (!parsed.metric_type) return null;
    return { metricType: parsed.metric_type, value: String(parsed.value || ''), notes: String(parsed.notes || '') };
  } catch (e) {
    return null;
  }
}

/** Сохранить фото в папку Google Drive и вернуть ссылку. */
function savePhotoToDrive_(fileId, memberName) {
  var blob = downloadTelegramFile_(fileId);
  var folderId = PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID');
  var folder = folderId
    ? DriveApp.getFolderById(folderId)
    : DriveApp.createFolder('Health OS — документы');
  var name = (memberName || 'family') + '_' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmmss') + '.jpg';
  blob.setName(name);
  var file = folder.createFile(blob);
  return file.getUrl();
}

/** Краткое медицинское саммари бланка/скана по фото. */
function summarizePhoto_(fileId) {
  var blob = downloadTelegramFile_(fileId);
  var dataUrl = 'data:image/jpeg;base64,' + Utilities.base64Encode(blob.getBytes());
  return openAiChat_('gpt-4o', [{
    role: 'user',
    content: [
      { type: 'text', text: 'Это фото медицинского документа. Опиши кратко по-русски: что это за документ и ключевые результаты/заключение. Без вымысла — только то, что видно.' },
      { type: 'image_url', image_url: { url: dataUrl } }
    ]
  }]);
}
