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

  if (u.photoFileId) { handlePhoto_(u, access); return; }

  // Начало сценария по кнопке меню или команде.
  var starter = matchStarter_(u.text);
  if (starter) { starter(u, access); return; }

  // Продолжение начатого сценария.
  if (session.state) { continueFlow_(u, access, session); return; }

  // Свободная строка без всякого меню: «Адель МНО 2,5 срб 2 15.07.2025».
  if (tryQuickAnalysis_(u, access)) return;

  // Вопрос про историю: «МНО за год», «гемоглобин», «узи за полгода».
  if (tryAnalysisQuery_(u, access)) return;
  if (tryExamQuery_(u, access)) return;

  sendMessage(u.chatId,
    'Не понял 🙂\n\nМожно писать анализы прямо строкой, без кнопок:\n' +
    '<i>МНО 2,5 С-реактивный белок 2 15.07.2025</i>\n\n' +
    'Имя в начале — за кого записать: <i>Адель гемоглобин 120</i>.\n' +
    'Без даты запишу сегодняшним числом.\n\n' +
    'Или спросите историю: <i>МНО за год</i>, <i>гемоглобин</i>, <i>узи за полгода</i>.',
    mainMenuKeyboard());
}

/**
 * Разобрать сообщение как анализы, без захода в меню.
 * Возвращает true, если получилось — тогда обычный ответ «не понял» не нужен.
 */
function tryQuickAnalysis_(u, access) {
  if (!u.text || u.text.charAt(0) === '/') return false;

  var picked = pickMemberFromText_(access, u.text);
  var memberId = picked.memberId ||
    (access.allowedMembers.length === 1 ? access.allowedMembers[0].id : null);

  refreshCatalog_(memberId);
  var when = extractDate_(picked.rest);
  var indicators = parseAnalysisText_(when.rest);
  if (!Object.keys(indicators).length) return false;
  var unknown = unknownIndicators_(when.rest);

  var entryDate = when.date || today_();
  if (!memberId) {
    setSession_(u.chatId, 'quick:member',
      { flow: 'quick', date: entryDate, indicators: indicators, unknown: unknown });
    sendMessage(u.chatId,
      'Понял показатели (' + entryDate + '). За кого записать?',
      membersKeyboard(access.allowedMembers));
    return true;
  }
  recordAnalysis_(u, access, memberId, indicators, entryDate, unknown);
  return true;
}

/**
 * Найти в тексте имя из семьи и вырезать его.
 * Ищем только среди доступных этому человеку — чужое имя правами не станет.
 */
function pickMemberFromText_(access, text) {
  var lower = String(text).toLowerCase();
  var best = null, bestLen = 0;
  access.allowedMembers.forEach(function (m) {
    var name = m.id.toLowerCase();
    if (name && lower.indexOf(name) !== -1 && name.length > bestLen) {
      best = m; bestLen = name.length;
    }
  });
  if (!best) return { memberId: null, rest: text };
  var at = lower.indexOf(best.id.toLowerCase());
  return {
    memberId: best.id,
    rest: text.slice(0, at) + ' ' + text.slice(at + best.id.length)
  };
}

/** Максимум строк в одном ответе — Telegram режет длинные сообщения. */
var HISTORY_ROWS_LIMIT = 40;
var EXAM_ROWS_LIMIT = 20;

/** «Дата — значение единица [⬇️/⬆️]» на каждую строку истории показателя. */
function formatIndicatorHistoryLines_(rows, key, gender) {
  return rows.map(function (r) {
    var labRange = (r.labMin != null && r.labMax != null) ? [r.labMin, r.labMax] : null;
    var check = checkNorm_(key, r.value, gender, labRange);
    var mark = check && check.status === 'low' ? ' ⬇️' : (check && check.status === 'high' ? ' ⬆️' : '');
    return '• ' + r.date + ' — <b>' + r.value + '</b> ' + esc_(indicatorUnit_(key)) + mark;
  });
}

/**
 * Вопрос про историю показателя: «МНО за год», «гемоглобин». Без имени и
 * без единственного члена семьи не подхватываем — гадать, о ком спросили,
 * рискованнее, чем ответить «не понял».
 */
function tryAnalysisQuery_(u, access) {
  if (!u.text || u.text.charAt(0) === '/') return false;

  var picked = pickMemberFromText_(access, u.text);
  var memberId = picked.memberId ||
    (access.allowedMembers.length === 1 ? access.allowedMembers[0].id : null);
  if (!memberId) return false;

  refreshCatalog_(memberId);
  var period = extractPeriod_(picked.rest);
  var key = containsIndicatorKey_(period.rest);
  if (!key) return false;

  var member = getMemberById_(access, memberId);
  var rows = analysisHistory_(memberId, key, period.sinceDate);
  var periodNote = period.sinceDate ? ' с ' + period.sinceDate : ' (вся история)';

  if (!rows.length) {
    sendMessage(u.chatId,
      'Записей «' + esc_(indicatorLabel_(key)) + '» у ' + esc_(member.name) + periodNote + ' не нашёл.',
      mainMenuKeyboard());
    return true;
  }

  var shown = rows.length > HISTORY_ROWS_LIMIT ? rows.slice(-HISTORY_ROWS_LIMIT) : rows;
  var lines = formatIndicatorHistoryLines_(shown, key, member.gender);

  var head = esc_(indicatorLabel_(key)) + ' — ' + esc_(member.name) + periodNote + ':\n';
  if (rows.length > shown.length) head += '(показаны последние ' + shown.length + ' из ' + rows.length + ')\n';
  sendMessage(u.chatId, head + lines.join('\n'), mainMenuKeyboard());
  return true;
}

/** Вопрос про историю обследований: «узи за год», «обследования». */
function tryExamQuery_(u, access) {
  if (!u.text || u.text.charAt(0) === '/') return false;

  var picked = pickMemberFromText_(access, u.text);
  var memberId = picked.memberId ||
    (access.allowedMembers.length === 1 ? access.allowedMembers[0].id : null);
  if (!memberId) return false;

  var period = extractPeriod_(picked.rest);
  var filter = matchExamFilter_(period.rest);
  if (!filter) return false;

  var member = getMemberById_(access, memberId);
  var rows = examHistory_(memberId, filter, period.sinceDate);
  var periodNote = period.sinceDate ? ' с ' + period.sinceDate : ' (вся история)';

  if (!rows.length) {
    sendMessage(u.chatId, 'Обследований у ' + esc_(member.name) + periodNote + ' не нашёл.', mainMenuKeyboard());
    return true;
  }

  var shown = rows.length > EXAM_ROWS_LIMIT ? rows.slice(-EXAM_ROWS_LIMIT) : rows;
  var lines = shown.map(function (r) {
    var summary = r.summary.length > 150 ? r.summary.slice(0, 150) + '…' : r.summary;
    return '• ' + r.date + ' — <b>' + esc_(r.type) + '</b>' + (summary ? '\n  ' + esc_(summary) : '');
  });

  var head = esc_(member.name) + ' — обследования' + periodNote + ':\n';
  if (rows.length > shown.length) head += '(показаны последние ' + shown.length + ' из ' + rows.length + ')\n';
  sendMessage(u.chatId, head + lines.join('\n'), mainMenuKeyboard());
  return true;
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
  map[MENU_ANALYSIS] = startAnalysis_; map['/analysis'] = startAnalysis_;
  map[MENU_EXAM] = startExam_;       map['/exam'] = startExam_;
  map[MENU_REPORT] = startReport_;   map['/report'] = startReport_;
  map[MENU_FEATURE] = startFeature_;  map['/feature'] = startFeature_;
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

function startAnalysis_(u, access) {
  askMemberOrProceed_(u, access, 'analysis', 'analysis:date', promptDate_);
}

function startExam_(u, access) {
  askMemberOrProceed_(u, access, 'exam', 'exam:date', promptDate_);
}

function startFeature_(u, access) {
  askMemberOrProceed_(u, access, 'feature', 'feature:type', function (uu) {
    sendMessage(uu.chatId, 'Что это за особенность?', featureTypesKeyboard());
  });
}

/**
 * Отчёт — не сразу всё подряд, а по шагам: группа показателей → конкретный
 * показатель (или вся группа целиком) → сколько последних результатов.
 * «Всё сразу» на первом шаге ведёт себя как раньше — полный список.
 */
function startReport_(u, access) {
  askMemberOrProceed_(u, access, 'report', 'report:group', function (uu, data) {
    sendReportGroupMenu_(uu, access, data);
  });
}

function sendReportGroupMenu_(u, access, data) {
  var member = getMemberById_(access, data.memberId);
  refreshCatalog_(data.memberId);
  var groups = personActiveGroups_(data.memberId);
  if (!groups.length) {
    sendMessage(u.chatId, 'Нет сохранённых анализов у ' + esc_(member.name) + '. Внесите через кнопку 📊 Анализы.', mainMenuKeyboard());
    clearSession_(u.chatId);
    return;
  }
  data.groups = groups;
  setSession_(u.chatId, 'report:group', data);
  sendMessage(u.chatId, 'Какая группа показателей — ' + esc_(member.name) + '?', reportGroupsKeyboard(groups));
}

/** Последние значения по выбранным ключам — как sendReport_, но по подмножеству. */
function sendGroupSnapshot_(u, access, memberId, groupLabel, keys) {
  var member = getMemberById_(access, memberId);
  refreshCatalog_(memberId);
  var latest = getLatestValues_(memberId);
  var labRanges = getLatestLabRanges_(memberId);

  var lines = keys.map(function (key) {
    var raw = latest[key];
    if (raw == null) return null;
    var value = parseFloat(String(raw).replace(',', '.'));
    if (isNaN(value)) return null;
    var check = checkNorm_(key, value, member.gender, labRanges[key]);
    var status = check ? ({ normal: '✅ норма', low: '⬇️ ниже нормы', high: '⬆️ выше нормы' })[check.status] : '';
    return '• ' + esc_(indicatorLabel_(key)) + ': <b>' + value + '</b> ' + esc_(indicatorUnit_(key)) + (status ? ' — ' + status : '');
  }).filter(function (line) { return line; });

  var text = '📦 ' + esc_(groupLabel) + ' — ' + esc_(member.name) + ':\n' + lines.join('\n');
  sendMessage(u.chatId, text, mainMenuKeyboard());
}

/** Последние `count` результатов одного показателя. count === 'all' — вся история. */
function sendIndicatorHistory_(u, access, memberId, key, count) {
  var member = getMemberById_(access, memberId);
  refreshCatalog_(memberId);
  var rows = analysisHistory_(memberId, key, null);
  if (!rows.length) {
    sendMessage(u.chatId, 'Записей «' + esc_(indicatorLabel_(key)) + '» у ' + esc_(member.name) + ' не нашёл.', mainMenuKeyboard());
    return;
  }

  var shown = count === 'all' ? rows : rows.slice(-Number(count));
  var lines = formatIndicatorHistoryLines_(shown, key, member.gender);

  var head = esc_(indicatorLabel_(key)) + ' — ' + esc_(member.name) +
    ' (последние ' + shown.length + (count === 'all' ? '' : ' из ' + rows.length) + '):\n';
  sendMessage(u.chatId, head + lines.join('\n'), mainMenuKeyboard());
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
    if (flow === 'report') {
      sendReportGroupMenu_(u, access, data);
    } else if (flow === 'quick') {
      clearSession_(u.chatId);
      recordAnalysis_(u, access, data.memberId, data.indicators, data.date, data.unknown);
    } else if (flow === 'feature') {
      setSession_(u.chatId, 'feature:type', data);
      sendMessage(u.chatId, 'Что это за особенность?', featureTypesKeyboard());
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
      if (!u.text) { sendMessage(u.chatId, 'Напишите имя текстом.'); return; }
      data.name = u.text;
      setSession_(u.chatId, 'bootstrap:gender', data);
      sendMessage(u.chatId, 'Ваш пол?', genderKeyboard());
      return;
    case 'bootstrap:gender':
      if (!u.callbackData) { sendMessage(u.chatId, 'Выберите пол кнопкой.', genderKeyboard()); return; }
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
      if (!u.text) { sendMessage(u.chatId, 'Напишите имя текстом.'); return; }
      data.name = u.text;
      setSession_(u.chatId, 'addmember:gender', data);
      sendMessage(u.chatId, 'Пол?', genderKeyboard());
      return;
    case 'addmember:gender':
      if (!u.callbackData) { sendMessage(u.chatId, 'Выберите пол кнопкой.', genderKeyboard()); return; }
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

    // --- Анализы ---
    case 'analysis:date':
      if (!u.text) { sendMessage(u.chatId, 'Напишите дату текстом.'); return; }
      // Человек часто пишет всё сразу — «15.07.2025 гемоглобин 135».
      // Тогда спрашивать показатели отдельным шагом незачем.
      refreshCatalog_(data.memberId);
      var whenAndValues = extractDate_(u.text);
      var straightaway = parseAnalysisText_(whenAndValues.rest);
      if (Object.keys(straightaway).length) {
        recordAnalysis_(u, access, data.memberId, straightaway,
                        whenAndValues.date || today_(),
                        unknownIndicators_(whenAndValues.rest));
        clearSession_(u.chatId);
        return;
      }
      var aDate = parseFlexibleDate_(u.text);
      if (!aDate) { sendMessage(u.chatId, 'Не понял дату. Формат: <i>15.07.2025</i> или «сегодня».'); return; }
      data.date = aDate;
      setSession_(u.chatId, 'analysis:values', data);
      sendMessage(u.chatId,
        '📊 Напишите показатели. Разделители не обязательны:\n' +
        '<i>гемоглобин 135 глюкоза 5.2 давление 120/80</i>');
      return;
    case 'analysis:values':
      if (!u.text) { sendMessage(u.chatId, 'Напишите показатели текстом.'); return; }
      refreshCatalog_(data.memberId);
      var indicators = parseAnalysisText_(u.text);
      if (!Object.keys(indicators).length) {
        sendMessage(u.chatId, 'Не смог распознать показатели. Попробуйте формат: <i>гемоглобин 135</i>');
        return;
      }
      recordAnalysis_(u, access, data.memberId, indicators, data.date, unknownIndicators_(u.text));
      clearSession_(u.chatId);
      return;

    // --- Обследования ---
    case 'exam:date':
      if (!u.text) { sendMessage(u.chatId, 'Напишите дату текстом.'); return; }
      var eDate = parseFlexibleDate_(u.text);
      if (!eDate) { sendMessage(u.chatId, 'Не понял дату. Формат: <i>15.07.2025</i> или «сегодня».'); return; }
      data.date = eDate;
      setSession_(u.chatId, 'exam:type', data);
      sendMessage(u.chatId, 'Что это было? Например: <i>УЗИ</i>, <i>приём кардиолога</i>, <i>рентген</i>.');
      return;
    case 'exam:type':
      if (!u.text) { sendMessage(u.chatId, 'Напишите текстом, что это было.'); return; }
      data.eventType = u.text;
      setSession_(u.chatId, 'exam:summary', data);
      sendMessage(u.chatId, 'Что сказали / результат / заключение?');
      return;
    case 'exam:summary':
      if (!u.text) { sendMessage(u.chatId, 'Напишите заключение текстом.'); return; }
      addMedicalRecord_(data.date, data.memberId, data.eventType, u.text, '');
      clearSession_(u.chatId);
      sendMessage(u.chatId, '✅ Записано (' + data.date + '): ' + esc_(data.eventType), mainMenuKeyboard());
      return;

    // --- Особенности организма ---
    case 'feature:type':
      if (!u.callbackData || u.callbackData.indexOf('feature:') !== 0) {
        sendMessage(u.chatId, 'Выберите тип кнопкой ниже.', featureTypesKeyboard());
        return;
      }
      data.featureType = FEATURE_TYPES[Number(u.callbackData.split(':')[1])] || 'Прочее';
      setSession_(u.chatId, 'feature:text', data);
      sendMessage(u.chatId,
        data.featureType + ' — опишите одним сообщением.\n' +
        'Например: <i>аллергия на манго, сыпь</i> или <i>нельзя много калия, почки</i>');
      return;
    case 'feature:text':
      if (!u.text) { sendMessage(u.chatId, 'Нужен текст одним сообщением.'); return; }
      addFeature_(data.memberId, data.featureType, u.text);
      clearSession_(u.chatId);
      sendMessage(u.chatId,
        '🧬 Записал в «Особенности». Это будет видно и в отчёте, и при выгрузке базы в ИИ.',
        mainMenuKeyboard());
      return;

    // --- Отчёт: группа → показатель → сколько последних ---
    case 'report:group':
      if (!u.callbackData) { sendMessage(u.chatId, 'Выберите кнопкой ниже.', reportGroupsKeyboard(data.groups)); return; }
      if (u.callbackData === 'repall:0') {
        clearSession_(u.chatId);
        sendReport_(u, access, data.memberId);
        return;
      }
      if (u.callbackData.indexOf('repgroup:') !== 0) { sendMessage(u.chatId, 'Выберите кнопкой ниже.', reportGroupsKeyboard(data.groups)); return; }
      var pickedGroup = data.groups[Number(u.callbackData.split(':')[1])];
      if (!pickedGroup) { sendMessage(u.chatId, 'Выберите кнопкой ниже.', reportGroupsKeyboard(data.groups)); return; }
      data.group = pickedGroup;
      data.indicators = personIndicatorsInGroup_(data.memberId, pickedGroup);
      setSession_(u.chatId, 'report:indicator', data);
      sendMessage(u.chatId, pickedGroup + ' — что показать?', reportIndicatorsKeyboard(data.indicators));
      return;
    case 'report:indicator':
      if (!u.callbackData) { sendMessage(u.chatId, 'Выберите кнопкой ниже.', reportIndicatorsKeyboard(data.indicators)); return; }
      if (u.callbackData === 'repwhole:0') {
        clearSession_(u.chatId);
        sendGroupSnapshot_(u, access, data.memberId, data.group,
          data.indicators.map(function (it) { return it.key; }));
        return;
      }
      if (u.callbackData.indexOf('repind:') !== 0) { sendMessage(u.chatId, 'Выберите кнопкой ниже.', reportIndicatorsKeyboard(data.indicators)); return; }
      var pickedIndicator = data.indicators[Number(u.callbackData.split(':')[1])];
      if (!pickedIndicator) { sendMessage(u.chatId, 'Выберите кнопкой ниже.', reportIndicatorsKeyboard(data.indicators)); return; }
      data.reportKey = pickedIndicator.key;
      setSession_(u.chatId, 'report:count', data);
      sendMessage(u.chatId, pickedIndicator.label + ' — сколько последних показать?', reportCountKeyboard());
      return;
    case 'report:count':
      if (!u.callbackData || u.callbackData.indexOf('repcount:') !== 0) { sendMessage(u.chatId, 'Выберите кнопкой ниже.', reportCountKeyboard()); return; }
      var count = u.callbackData.split(':')[1];
      clearSession_(u.chatId);
      sendIndicatorHistory_(u, access, data.memberId, data.reportKey, count);
      return;

    // --- Подтверждение фото ---
    case 'photo:confirm':
      if (!u.callbackData) { sendMessage(u.chatId, 'Нажмите «Да» или «Отмена».', confirmKeyboard()); return; }
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

function recordAnalysis_(u, access, memberId, indicators, entryDate, unknown) {
  var member = getMemberById_(access, memberId);
  if (!member) { sendMessage(u.chatId, 'Нет прав вносить данные за этого члена семьи.'); return; }

  refreshCatalog_(memberId);
  addAnalyses_(memberId, entryDate, indicators);
  var labRanges = getLatestLabRanges_(memberId);

  var lines = [];
  var abnormal = [];
  Object.keys(indicators).forEach(function (key) {
    var value = indicators[key];
    var check = checkNorm_(key, value, member.gender, labRanges[key]);
    var status = check ? ({ normal: '✅ норма', low: '⬇️ ниже нормы', high: '⬆️ выше нормы' })[check.status] : '';
    if (check && check.status !== 'normal') abnormal.push(key);
    lines.push('• ' + esc_(indicatorLabel_(key)) + ': <b>' + esc_(value) + '</b> ' + esc_(indicatorUnit_(key)) + (status ? ' — ' + status : ''));
  });

  var text = '📊 Записал (' + entryDate + '):\n' + lines.join('\n');
  if (unknown && unknown.length) {
    text += '\n\n⚠️ Не понял и не записал: <b>' + esc_(unknown.join(', ')) + '</b>.\n' +
      'Добавьте показатель в лист «Справочник анализов» — и он заработает, ' +
      'включая сокращение в колонке «Синонимы».';
  }
  text += recommendationsBlock_(memberId, member.gender, abnormal);
  sendMessage(u.chatId, text, mainMenuKeyboard());
}

function sendReport_(u, access, memberId) {
  var member = getMemberById_(access, memberId);
  if (!member) { sendMessage(u.chatId, 'Нет прав смотреть данные этого члена семьи.'); return; }

  refreshCatalog_(memberId);
  var latest = getLatestValues_(memberId);
  var labRanges = getLatestLabRanges_(memberId);
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
    var check = checkNorm_(key, value, member.gender, labRanges[key]);
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
  var features = getFeatures_(memberId);
  if (features.length) {
    block += '\n\n🧬 Особенности:\n' + features.map(function (f) {
      return '• ' + esc_(f['Тип']) + ': ' + esc_(f['Описание']);
    }).join('\n');
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

// ---------- Голос и фото// ---------- Фото ----------

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
