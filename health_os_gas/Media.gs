// ===== ФОТО ЧЕРЕЗ OPENAI =====
// Разбор фото документа — та же модель, что была в Python-версии: gpt-4o.
// Голосовой ввод (Whisper) убран вместе с дневником: это было единственное
// место, куда он писал, — без дневника расшифровывать голос было бы не во что.

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
