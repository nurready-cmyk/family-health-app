// ===== ДИАЛОГИ =====
// Единственный вход — poll() из Polling.gs, который раз в минуту забирает
// новые сообщения через getUpdates. Состояние диалога живёт в листе Sessions,
// т.к. Apps Script ничего не помнит между запусками.
//
// Функции doPost здесь намеренно нет. Webhook на Apps Script всё равно не
// работает (Google отвечает редиректом 302, Telegram считает доставку
// неудачной и шлёт сообщение снова), а открытый на «у всех» веб-эндпоинт
// принимал бы поддельные апдейты: достаточно было подставить чужой
// message.from.id и свой message.chat.id, чтобы получить в свой чат отчёт по
// здоровью всей семьи. Транспорт только исходящий — подделать нечего.

function handleUpdate_(update) {
  var u = parseUpdate_(update);
  if (!u) return;

  if (u.callbackQueryId) answerCallbackQuery(u.callbackQueryId);

  var access = resolveAccess_(u.userId);

  // Первый запуск: если в таблице ещё нет ни одного пользователя, а этот
  // Telegram-id указан в BOOTSTRAP_ADMIN_IDS — регистрируем администратора.
  if (!access) {
    if (tryBootstrapAdmin_(u)) return;
    sendMessage(u.chatId, 'Вы не зарегистрированы в Health OS.');
    return;
  }

  var session = getSession_(u.chatId);

  // /start и /cancel работают всегда, обрывая любой незаконченный диалог.
  if (u.text === '/start') {
    clearSession_(u.chatId);
    sendMessage(u.chatId, 'С возвращением, ' + esc_(access.user.name) + '! Выберите действие в меню внизу.', mainMenuKeyboard());
    return;
  }
  if (u.text === '/cancel') {
    clearSession_(u.chatId);
    sendMessage(u.chatId, 'Отменено.', mainMenuKeyboard());
    return;
  }

  if (u.voiceFileId) { handleVoice_(u, access); return; }
  if (u.photoFileId) { handlePhoto_(u, access); return; }

  // Начало сценария по кнопке меню или команде.
  var starter = matchStarter_(u.text);
  if (starter) { starter(u, access); return; }

  // Продолжение начатого сценария.
  if (session.state) { continueFlow_(u, access, session); return; }

  sendMessage(u.chatId,
    'Не понял 🙂 Пользуйтесь кнопками меню внизу, либо отправьте голосовое сообщение или фото документа.',
    mainMenuKeyboard());
}

function tryBootstrapAdmin_(u) {
  var ids = String(PropertiesService.getScriptProperties().getProperty('BOOTSTRAP_ADMIN_IDS') || '');
  if (ids.split(',').map(function (s) { return s.trim(); }).indexOf(String(u.userId)) === -1) return false;
  if (readAll_(SHEET_USERS).length > 0) return false;

  setSession_(u.chatId, 'bootstrap:name', {});
  sendMessage(u.chatId, 'Настроим Health OS. Как вас зовут?');
  return true;
}

function matchStarter_(text) {
  if (!text) return null;
  var map = {};
  map[MENU_LOG] = startLog_;         map['/log'] = startLog_;
  map[MENU_ANALYSIS] = startAnalysis_; map['/analysis'] = startAnalysis_;
  map[MENU_EXAM] = startExam_;       map['/exam'] = startExam_;
  map[MENU_REPORT] = startReport_;   map['/report'] = startReport_;
  map[MENU_ADD_RULE] = startAddRule_; map['/add_rule'] = startAddRule_;
  map['/add_family_member'] = startAddFamilyMember_;
  return map[text] || null;
}

// ---------- Общее: выбор члена семьи ----------

/**
 * Если доступен один человек — сразу следующий шаг. Если несколько —
 * показать кнопки выбора. Аналог того, как это работало в Python-версии.
 */
function askMemberOrProceed_(u, access, flow, nextState, promptFn) {
  if (!access.allowedMembers.length) {
    sendMessage(u.chatId, 'Нет доступных членов семьи.');
    return;
  }
  if (access.allowedMembers.length === 1) {
    var data = { flow: flow, memberId: access.allowedMembers[0].id };
    setSession_(u.chatId, nextState, data);
    promptFn(u, data);
    return;
  }
  setSession_(u.chatId, flow + ':member', { flow: flow });
  sendMessage(u.chatId, 'За кого?', membersKeyboard(access.allowedMembers));
}

function promptDate_(u) {
  sendMessage(u.chatId,
    'На какую дату?\nНапишите дату (например <i>15.07.2025</i>) — пригодится для записей прошлых лет. Или отправьте «сегодня».');
}

/** «сегодня» / ДД.ММ.ГГГГ / ГГГГ-ММ-ДД → ISO-строка; null если не разобрали. */
function parseFlexibleDate_(text) {
  var t = String(text).trim().toLowerCase();
  var tz = Session.getScriptTimeZone();
  if (t === 'сегодня' || t === 'today' || t === '-') {
    return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  }
  var dmy = t.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})$/);
  if (dmy) {
    var d = new Date(+dmy[3], +dmy[2] - 1, +dmy[1]);
    if (d.getDate() !== +dmy[1] || d.getMonth() !== +dmy[2] - 1) return null;
    return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    var iso = new Date(t + 'T00:00:00');
    return isNaN(iso.getTime()) ? null : t;
  }
  return null;
}

// ---------- Старт сценариев ----------

function startLog_(u, access) {
  askMemberOrProceed_(u, access, 'log', 'log:metric', function (uu) {
    sendMessage(uu.chatId, 'Какая метрика?', metricsKeyboard());
  });
}

function startAnalysis_(u, access) {
  askMemberOrProceed_(u, access, 'analysis', 'analysis:date', promptDate_);
}

function startExam_(u, access) {
  askMemberOrProceed_(u, access, 'exam', 'exam:date', promptDate_);
}

function startAddRule_(u, access) {
  askMemberOrProceed_(u, access, 'rule', 'rule:text', function (uu) {
    sendMessage(uu.chatId,
      'Опишите личное правило одним сообщением. Обязательно укажите название показателя — тогда бот вспомнит правило, когда этот показатель отклонится.\n' +
      'Например: <i>если гемоглобин низкий, мне помогает гранат и меньше кофе</i>');
  });
}

function startReport_(u, access) {
  askMemberOrProceed_(u, access, 'report', 'report:go', function (uu, data) {
    sendReport_(uu, resolveAccess_(uu.userId), data.memberId);
    clearSession_(uu.chatId);
  });
}

function startAddFamilyMember_(u, access) {
  if (!isAdmin_(access.user.role)) {
    sendMessage(u.chatId, 'Добавлять членов семьи может только администратор.');
    return;
  }
  setSession_(u.chatId, 'addmember:name', {});
  sendMessage(u.chatId, 'Имя нового члена семьи?');
}

// ---------- Продолжение сценариев ----------

function continueFlow_(u, access, session) {
  var state = session.state;
  var data = session.data;

  // Выбор члена семьи кнопкой — общий шаг для всех сценариев.
  if (u.callbackData && u.callbackData.indexOf('member:') === 0) {
    // substring, а не split(':') — id теперь это имя, а в имени может
    // оказаться двоеточие.
    data.memberId = u.callbackData.substring('member:'.length);
    if (!canActFor_(access, data.memberId)) {
      sendMessage(u.chatId, 'Нет прав действовать за этого члена семьи.');
      clearSession_(u.chatId);
      return;
    }
    var flow = data.flow;
    if (flow === 'log') {
      setSession_(u.chatId, 'log:metric', data);
      sendMessage(u.chatId, 'Какая метрика?', metricsKeyboard());
    } else if (flow === 'rule') {
      setSession_(u.chatId, 'rule:text', data);
      sendMessage(u.chatId, 'Опишите личное правило одним сообщением (с названием показателя).');
    } else if (flow === 'report') {
      clearSession_(u.chatId);
      sendReport_(u, access, data.memberId);
    } else if (flow === 'voice') {
      setSession_(u.chatId, 'voice:confirm', data);
      sendVoiceConfirm_(u, data);
    } else if (flow === 'photo') {
      setSession_(u.chatId, 'photo:confirm', data);
      sendPhotoConfirm_(u, data);
    } else {
      setSession_(u.chatId, flow + ':date', data);
      promptDate_(u);
    }
    return;
  }

  switch (state) {
    // --- Первичная настройка администратора ---
    case 'bootstrap:name':
      data.name = u.text;
      setSession_(u.chatId, 'bootstrap:gender', data);
      sendMessage(u.chatId, 'Ваш пол?', genderKeyboard());
      return;
    case 'bootstrap:gender':
      if (!u.callbackData) return;
      data.gender = u.callbackData.split(':')[1];
      setSession_(u.chatId, 'bootstrap:year', data);
      sendMessage(u.chatId, 'Год рождения? (например 1986)');
      return;
    case 'bootstrap:year':
      var year = parseInt(u.text, 10);
      if (isNaN(year)) { sendMessage(u.chatId, 'Нужен год числом, например 1986.'); return; }
      var me = addFamilyMember_(data.name, data.gender, year);
      appendRow_(SHEET_USERS, { 'Telegram id': u.userId, 'Имя': data.name, 'Роль': 'админ', 'Кто из семьи': me.id, 'Служебный id': newId_() });
      dropSheetCache_(SHEET_USERS);
      clearSession_(u.chatId);
      sendMessage(u.chatId, '✅ Готово! Вы администратор. Добавляйте близких через /add_family_member.', mainMenuKeyboard());
      return;

    // --- Добавление члена семьи ---
    case 'addmember:name':
      data.name = u.text;
      setSession_(u.chatId, 'addmember:gender', data);
      sendMessage(u.chatId, 'Пол?', genderKeyboard());
      return;
    case 'addmember:gender':
      if (!u.callbackData) return;
      data.gender = u.callbackData.split(':')[1];
      setSession_(u.chatId, 'addmember:year', data);
      sendMessage(u.chatId, 'Год рождения?');
      return;
    case 'addmember:year':
      var y = parseInt(u.text, 10);
      if (isNaN(y)) { sendMessage(u.chatId, 'Нужен год числом, например 2016.'); return; }
      var added = addFamilyMember_(data.name, data.gender, y);
      clearSession_(u.chatId);
      sendMessage(u.chatId, '✅ Добавлен: ' + esc_(added.name), mainMenuKeyboard());
      return;

    // --- Дневник ---
    case 'log:metric':
      if (!u.callbackData || u.callbackData.indexOf('metric:') !== 0) return;
      data.metricType = u.callbackData.split(':')[1];
      setSession_(u.chatId, 'log:value', data);
      sendMessage(u.chatId, METRIC_LABELS[data.metricType] + ' — что записать?');
      return;
    case 'log:value':
      data.value = u.text;
      setSession_(u.chatId, 'log:notes', data);
      sendMessage(u.chatId,
        'Записал: ' + METRIC_LABELS[data.metricType] + ' = ' + esc_(data.value) + '\n\n' +
        'Заметка — необязательный комментарий с контекстом (например «после хорошего сна»). Если добавить нечего, отправьте «-».');
      return;
    case 'log:notes':
      var notes = u.text === '-' ? '' : u.text;
      addLog_(today_(), data.memberId, data.metricType, data.value, notes);
      clearSession_(u.chatId);
      sendMessage(u.chatId, '✅ Записано в дневник.', mainMenuKeyboard());
      return;

    // --- Анализы ---
    case 'analysis:date':
      var aDate = parseFlexibleDate_(u.text);
      if (!aDate) { sendMessage(u.chatId, 'Не понял дату. Формат: <i>15.07.2025</i> или «сегодня».'); return; }
      data.date = aDate;
      setSession_(u.chatId, 'analysis:values', data);
      sendMessage(u.chatId,
        '📊 Напишите показатели через запятую или каждый на новой строке.\nНапример:\n<i>гемоглобин 135, глюкоза 5.2, давление 120/80</i>');
      return;
    case 'analysis:values':
      refreshCatalog_(data.memberId);
      var indicators = parseAnalysisText_(u.text);
      if (!Object.keys(indicators).length) {
        sendMessage(u.chatId, 'Не смог распознать показатели. Попробуйте формат: <i>гемоглобин 135</i>');
        return;
      }
      recordAnalysis_(u, access, data.memberId, indicators, data.date);
      clearSession_(u.chatId);
      return;

    // --- Обследования ---
    case 'exam:date':
      var eDate = parseFlexibleDate_(u.text);
      if (!eDate) { sendMessage(u.chatId, 'Не понял дату. Формат: <i>15.07.2025</i> или «сегодня».'); return; }
      data.date = eDate;
      setSession_(u.chatId, 'exam:type', data);
      sendMessage(u.chatId, 'Что это было? Например: <i>УЗИ</i>, <i>приём кардиолога</i>, <i>рентген</i>.');
      return;
    case 'exam:type':
      data.eventType = u.text;
      setSession_(u.chatId, 'exam:summary', data);
      sendMessage(u.chatId, 'Что сказали / результат / заключение?');
      return;
    case 'exam:summary':
      addMedicalRecord_(data.date, data.memberId, data.eventType, u.text, '');
      clearSession_(u.chatId);
      sendMessage(u.chatId, '✅ Записано (' + data.date + '): ' + esc_(data.eventType), mainMenuKeyboard());
      return;

    // --- Личное правило ---
    case 'rule:text':
      addKnowledgeRule_(data.memberId, u.text);
      clearSession_(u.chatId);
      sendMessage(u.chatId, '🧠 Правило сохранено. Оно всплывёт, когда упомянутый показатель отклонится от нормы.', mainMenuKeyboard());
      return;

    // --- Подтверждение голоса ---
    case 'voice:confirm':
      if (!u.callbackData) return;
      if (u.callbackData === 'confirm:yes') {
        addLog_(today_(), data.memberId, data.metricType, data.value, data.notes || '');
        sendMessage(u.chatId, '✅ Записано в дневник.', mainMenuKeyboard());
      } else {
        sendMessage(u.chatId, 'Отменено.', mainMenuKeyboard());
      }
      clearSession_(u.chatId);
      return;

    // --- Подтверждение фото ---
    case 'photo:confirm':
      if (!u.callbackData) return;
      if (u.callbackData === 'confirm:yes') {
        var member = getMemberById_(access, data.memberId);
        var url = savePhotoToDrive_(data.photoFileId, member ? member.name : '');
        addMedicalRecord_(today_(), data.memberId, 'Документ (фото)', data.summary, url);
        sendMessage(u.chatId, '✅ Сохранено. Оригинал в Google Drive:\n' + url, mainMenuKeyboard());
      } else {
        sendMessage(u.chatId, 'Отменено.', mainMenuKeyboard());
      }
      clearSession_(u.chatId);
      return;
  }
}

function today_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// ---------- Анализы: запись + рекомендации ----------

function recordAnalysis_(u, access, memberId, indicators, entryDate) {
  var member = getMemberById_(access, memberId);
  if (!member) { sendMessage(u.chatId, 'Нет прав вносить данные за этого члена семьи.'); return; }

  refreshCatalog_(memberId);
  addAnalyses_(memberId, entryDate, indicators);

  var lines = [];
  var abnormal = [];
  Object.keys(indicators).forEach(function (key) {
    var value = indicators[key];
    var check = checkNorm_(key, value, member.gender);
    var status = check ? ({ normal: '✅ норма', low: '⬇️ ниже нормы', high: '⬆️ выше нормы' })[check.status] : '';
    if (check && check.status !== 'normal') abnormal.push(key);
    lines.push('• ' + esc_(indicatorLabel_(key)) + ': <b>' + esc_(value) + '</b> ' + esc_(indicatorUnit_(key)) + (status ? ' — ' + status : ''));
  });

  var text = '📊 Записал (' + entryDate + '):\n' + lines.join('\n');
  text += recommendationsBlock_(memberId, member.gender, abnormal);
  sendMessage(u.chatId, text, mainMenuKeyboard());
}

function sendReport_(u, access, memberId) {
  var member = getMemberById_(access, memberId);
  if (!member) { sendMessage(u.chatId, 'Нет прав смотреть данные этого члена семьи.'); return; }

  refreshCatalog_(memberId);
  var latest = getLatestValues_(memberId);
  var keys = Object.keys(latest);
  if (!keys.length) {
    sendMessage(u.chatId, 'Нет сохранённых анализов. Внесите через кнопку 📊 Анализы.', mainMenuKeyboard());
    return;
  }

  var lines = [];
  var abnormal = [];
  keys.forEach(function (key) {
    var value = parseFloat(String(latest[key]).replace(',', '.'));
    if (isNaN(value)) return;
    var check = checkNorm_(key, value, member.gender);
    var status = check ? ({ normal: '✅ норма', low: '⬇️ ниже нормы', high: '⬆️ выше нормы' })[check.status] : '';
    if (check && check.status !== 'normal') abnormal.push(key);
    lines.push('• ' + esc_(indicatorLabel_(key)) + ': <b>' + value + '</b> ' + esc_(indicatorUnit_(key)) + (status ? ' — ' + status : ''));
  });

  var text = '📋 Текущие показатели — ' + esc_(member.name) + ':\n' + lines.join('\n');
  text += recommendationsBlock_(memberId, member.gender, abnormal);
  sendMessage(u.chatId, text, mainMenuKeyboard());
}

/** Личные правила впереди общих рекомендаций — как и в Python-версии. */
function recommendationsBlock_(memberId, gender, abnormalKeys) {
  var block = '';
  var personal = getMatchingPersonalRules_(memberId, abnormalKeys);
  if (personal.length) {
    block += '\n\n🧠 Из ваших личных заметок:\n' +
      personal.map(function (r) { return '• ' + esc_(r['Правило']); }).join('\n');
  }
  var general = getActiveRecommendations_(getLatestValues_(memberId), gender);
  if (general.length) {
    block += '\n\n💡 Рекомендации:\n' + general.map(function (rule) {
      return rule.title + '\n' + rule.problem +
        '\nЕсть: ' + rule.eat.join(', ') +
        '\nИсключить: ' + rule.avoid.join(', ') +
        '\nСпорт: ' + rule.workout;
    }).join('\n\n');
  }
  return block;
}

// ---------- Голос и фото ----------

function handleVoice_(u, access) {
  sendMessage(u.chatId, '🎧 Слушаю голосовое...');
  var text;
  try {
    text = transcribeVoice_(u.voiceFileId);
  } catch (e) {
    sendMessage(u.chatId, 'Не удалось расшифровать голос: ' + esc_(e.message));
    return;
  }

  var metric = extractMetricFromText_(text);
  if (!metric) {
    sendMessage(u.chatId, 'Расшифровал:\n<i>' + esc_(text) + '</i>\n\nНо не понял, что записать. Попробуйте кнопки меню.', mainMenuKeyboard());
    return;
  }

  var data = { flow: 'voice', metricType: metric.metricType, value: metric.value, notes: metric.notes, transcript: text };

  if (access.allowedMembers.length === 1) {
    data.memberId = access.allowedMembers[0].id;
    setSession_(u.chatId, 'voice:confirm', data);
    sendVoiceConfirm_(u, data);
  } else {
    setSession_(u.chatId, 'voice:member', data);
    sendMessage(u.chatId, 'Расшифровал:\n<i>' + esc_(text) + '</i>\n\nЗа кого записать?', membersKeyboard(access.allowedMembers));
  }
}

function sendVoiceConfirm_(u, data) {
  sendMessage(u.chatId,
    'Расшифровал:\n<i>' + esc_(data.transcript) + '</i>\n\n' +
    'Записать?\n' + METRIC_LABELS[data.metricType] + ': <b>' + esc_(data.value) + '</b>' +
    (data.notes ? '\nЗаметка: ' + esc_(data.notes) : ''),
    confirmKeyboard());
}

function handlePhoto_(u, access) {
  sendMessage(u.chatId, '🔍 Смотрю фото...');
  var summary;
  try {
    summary = summarizePhoto_(u.photoFileId);
  } catch (e) {
    sendMessage(u.chatId, 'Не удалось разобрать фото: ' + esc_(e.message));
    return;
  }

  var data = { flow: 'photo', photoFileId: u.photoFileId, summary: summary };

  if (access.allowedMembers.length === 1) {
    data.memberId = access.allowedMembers[0].id;
    setSession_(u.chatId, 'photo:confirm', data);
    sendPhotoConfirm_(u, data);
  } else {
    setSession_(u.chatId, 'photo:member', data);
    sendMessage(u.chatId, 'Вот что вижу:\n<i>' + esc_(summary) + '</i>\n\nЗа кого сохранить?', membersKeyboard(access.allowedMembers));
  }
}

function sendPhotoConfirm_(u, data) {
  sendMessage(u.chatId,
    'Вот что вижу:\n<i>' + esc_(data.summary) + '</i>\n\nСохранить в медкарту вместе с оригиналом фото?',
    confirmKeyboard());
}
