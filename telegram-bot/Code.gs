// ===== MAIN ENTRY POINT =====
// Single Web App endpoint. Telegram calls it with {update_id, message|callback_query, ...}.
// The one-time migration tool (see Migration.gs + profiles.html) calls it with
// {action: 'migrate', secret, data}. We tell them apart by shape, not by URL.

function doGet(e) {
  return ContentService.createTextOutput('HealthApp bot is running.');
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService.createTextOutput('bad request');
  }

  try {
    if (body.action === 'migrate') {
      return handleMigrationRequest(body); // Migration.gs
    }
    handleTelegramUpdate(body);
  } catch (err) {
    Logger.log('doPost error: ' + err + '\n' + err.stack);
  }
  return ContentService.createTextOutput('ok');
}

function handleTelegramUpdate(update) {
  var parsed = parseTelegramUpdate(update);
  if (!parsed) return;

  var chatId = parsed.chatId;

  if (parsed.callbackData) {
    handleCallback_(chatId, parsed.callbackData, parsed.callbackQueryId);
    return;
  }

  if (parsed.fileId) {
    handlePhoto_(chatId, parsed.fileId);
    return;
  }

  var text = parsed.text || '';
  if (text === '/start') {
    handleStart_(chatId);
    return;
  }

  var session = getSession(chatId);
  var profileId = getActiveProfileId(chatId);

  switch (text) {
    case '📊 Анализы': return promptAnalyses_(chatId, profileId);
    case '🏋️ Тренировка': return promptWorkout_(chatId, profileId);
    case '🍽️ Питание': return promptNutrition_(chatId, profileId);
    case '🎯 Цели': return promptGoals_(chatId, profileId);
    case '📈 Отчёт': return sendReport_(chatId, profileId);
    case '🧠 Моё правило': return promptPersonalRule_(chatId, profileId);
    case '🔄 Профиль': return sendProfilePicker_(chatId);
  }

  // Free text belonging to a multi-step flow
  switch (session.step) {
    case 'awaiting_analysis': return handleAnalysisText_(chatId, profileId, text);
    case 'awaiting_workout': return handleWorkoutText_(chatId, profileId, text);
    case 'awaiting_nutrition': return handleNutritionText_(chatId, profileId, text);
    case 'awaiting_goal': return handleGoalText_(chatId, profileId, text);
    case 'awaiting_personal_rule': return handlePersonalRuleText_(chatId, profileId, text);
    case 'awaiting_checkin_text': return handleCheckinText_(chatId, session.tempData.checkinProfileId, text);
  }

  sendMessage(chatId, 'Не понял 🙂 Воспользуйтесь меню ниже.', mainMenuKeyboard());
}

function handleStart_(chatId) {
  clearSession(chatId);
  setConfig('TELEGRAM_CHAT_ID', chatId); // so dailyCheckin()/weeklyReport() triggers know where to send
  sendMessage(chatId, '👋 Привет! Это бот «Здоровье семьи».\n\nСначала выберите, за кого вносим данные:');
  sendProfilePicker_(chatId);
}

function sendProfilePicker_(chatId) {
  var profiles = getProfiles();
  sendMessage(chatId, 'Выберите профиль:', profileInlineKeyboard(profiles));
}

function handleCallback_(chatId, data, callbackQueryId) {
  answerCallbackQuery(callbackQueryId);

  if (data.indexOf('profile:') === 0) {
    var profileId = data.slice('profile:'.length);
    setActiveProfileId(chatId, profileId);
    var profile = getProfile(profileId);
    sendMessage(chatId, 'Профиль переключён на <b>' + escapeHtml_(profile.name) + '</b> ✅', mainMenuKeyboard());
    return;
  }

  if (data.indexOf('checkin:') === 0) {
    var checkinProfileId = data.slice('checkin:'.length);
    var checkinProfile = getProfile(checkinProfileId);
    setSession(chatId, 'awaiting_checkin_text', { checkinProfileId: checkinProfileId, activeProfileId: getActiveProfileId(chatId) });
    sendMessage(chatId, '✍️ Что сегодня сделали для здоровья — ' + escapeHtml_(checkinProfile.name) + '?');
    return;
  }
}

// ---------- Analyses ----------
function promptAnalyses_(chatId, profileId) {
  if (!profileId) return sendProfilePicker_(chatId);
  setSession(chatId, 'awaiting_analysis', { activeProfileId: profileId });
  sendMessage(chatId,
    '📊 Напишите показатели через запятую или каждый на новой строке.\n' +
    'Например:\n<i>гемоглобин 135, глюкоза 5.2, давление 120/80</i>');
}

function handleAnalysisText_(chatId, profileId, text) {
  var parsedIndicators = parseAnalysisText_(text);
  if (!parsedIndicators.length) {
    sendMessage(chatId, 'Не смог распознать показатели. Попробуйте формат: <i>гемоглобин 135</i>');
    return;
  }

  var dateIso = new Date().toISOString();
  parsedIndicators.forEach(function (ind) {
    addAnalysisEntry(profileId, dateIso, ind.key, ind.value);
  });

  var profile = getProfile(profileId);
  var latest = getLatestAnalysisValues(profileId);
  var abnormalKeys = [];
  var lines = parsedIndicators.map(function (ind) {
    var norm = checkNorm(ind.key, ind.value, profile.gender);
    var statusLabel = !norm ? '' : norm.status === 'normal' ? '✅ норма' : norm.status === 'low' ? '⬇️ ниже нормы' : '⬆️ выше нормы';
    if (norm && norm.status !== 'normal') abnormalKeys.push(ind.key);
    var label = norm ? norm.label : ind.key;
    return '• ' + label + ': <b>' + ind.value + '</b> ' + (norm ? norm.unit : '') + ' — ' + statusLabel;
  });

  var reply = '📊 Записал:\n' + lines.join('\n');

  var personal = getPersonalRecommendations(profileId, abnormalKeys);
  if (personal.length) {
    reply += '\n\n🧠 Из ваших личных заметок:\n' + personal.map(function (p) { return '• ' + p.recommendationText; }).join('\n');
  }

  var general = getActiveRecommendations(latest, profile.gender);
  if (general.length) {
    reply += '\n\n💡 Рекомендации:\n' + general.map(function (r) {
      return r.title + '\n' + r.problem + '\nЕсть: ' + r.eat.join(', ') + '\nИсключить: ' + r.avoid.join(', ') + '\nСпорт: ' + r.workout;
    }).join('\n\n');
  }

  clearSession(chatId);
  sendMessage(chatId, reply, mainMenuKeyboard());
}

/** Splits free text into {key, value} indicator pairs. Handles "давление 120/80" specially. */
function parseAnalysisText_(text) {
  var results = [];
  var remaining = text;

  var bp = /давлен\w*\D{0,10}(\d{2,3})\s*\/\s*(\d{2,3})/i.exec(text);
  if (bp) {
    results.push({ key: 'systolic', value: Number(bp[1]) });
    results.push({ key: 'diastolic', value: Number(bp[2]) });
    remaining = remaining.replace(bp[0], '');
  }

  remaining.split(/[,;\n]/).forEach(function (part) {
    part = part.trim();
    if (!part) return;
    var m = /^(.*?)(-?\d+(?:[.,]\d+)?)\s*$/.exec(part);
    if (!m) return;
    var name = m[1].trim();
    var value = Number(m[2].replace(',', '.'));
    if (!name || isNaN(value)) return;
    var key = matchIndicatorKey(name);
    if (key) results.push({ key: key, value: value });
  });

  return results;
}

// ---------- Workouts ----------
function promptWorkout_(chatId, profileId) {
  if (!profileId) return sendProfilePicker_(chatId);
  setSession(chatId, 'awaiting_workout', { activeProfileId: profileId });
  sendMessage(chatId,
    '🏋️ Напишите через запятую: тип, длительность (мин), упражнения.\n' +
    'Например:\n<i>силовая, 45, присед 4x10, жим лёжа 4x8</i>');
}

function handleWorkoutText_(chatId, profileId, text) {
  var parts = text.split(',');
  var type = (parts[0] || '').trim();
  var duration = Number((parts[1] || '').trim()) || null;
  var exercises = parts.slice(2).join(',').trim();

  addWorkout(profileId, new Date().toISOString(), type, duration, exercises);

  var tip;
  var t = type.toLowerCase();
  if (t.indexOf('сил') !== -1) {
    tip = 'Белок в течение 30 мин после тренировки, сон 8 ч, следующая силовая — не раньше чем через 48 ч на эту же группу мышц.';
  } else if (t.indexOf('кардио') !== -1 || t.indexOf('бег') !== -1) {
    tip = 'Восполните воду и электролиты, лёгкая растяжка после тренировки.';
  } else {
    tip = 'Не забудьте про воду и растяжку после тренировки.';
  }

  clearSession(chatId);
  sendMessage(chatId, '🏋️ Тренировка записана!\n\n💡 Восстановление: ' + tip, mainMenuKeyboard());
}

// ---------- Nutrition ----------
function promptNutrition_(chatId, profileId) {
  if (!profileId) return sendProfilePicker_(chatId);
  setSession(chatId, 'awaiting_nutrition', { activeProfileId: profileId });
  sendMessage(chatId,
    '🍽️ Напишите продукт и граммы.\nНапример:\n<i>гречка варёная 150</i>');
}

function handleNutritionText_(chatId, profileId, text) {
  var m = /^(.*?)(\d+(?:[.,]\d+)?)\s*г?\.?\s*$/.exec(text.trim());
  if (!m) {
    sendMessage(chatId, 'Не понял граммы. Формат: <i>продукт 150</i>');
    return;
  }
  var query = m[1].trim();
  var grams = Number(m[2].replace(',', '.'));
  var matches = searchFood(query);

  if (!matches.length) {
    sendMessage(chatId, 'Не нашёл "' + escapeHtml_(query) + '" в базе продуктов. Попробуйте другое название.');
    return;
  }

  var food = matches[0];
  addNutritionEntry(profileId, new Date().toISOString(), food.name, grams);

  var dayEntries = getNutritionForDay(profileId, new Date().toISOString());
  var calc = calculateDayNutrients(dayEntries.map(function (r) { return { foodName: r.foodName, grams: r.grams }; }));

  var topVitamins = Object.keys(calc.vitamins)
    .sort(function (a, b) { return calc.vitamins[b] - calc.vitamins[a]; })
    .slice(0, 5)
    .map(function (k) {
      // NutritionDB stores vitamin values as % of daily value per 100g already, so
      // calc.vitamins[k] (summed and grams-scaled) is directly a percentage.
      var pct = Math.round(calc.vitamins[k]);
      var name = VitaminNames[k] || k;
      return '• ' + name + ': ~' + pct + '% суточной нормы';
    });

  clearSession(chatId);
  sendMessage(chatId,
    '🍽️ Записал: ' + food.name + ' — ' + grams + ' г\n\n' +
    'За сегодня: ' + Math.round(calc.totals.calories) + ' ккал, белки ' + Math.round(calc.totals.protein) + 'г\n\n' +
    (topVitamins.length ? '💊 Топ витаминов за день:\n' + topVitamins.join('\n') : ''),
    mainMenuKeyboard());
}

// ---------- Goals ----------
function promptGoals_(chatId, profileId) {
  if (!profileId) return sendProfilePicker_(chatId);
  var goals = getGoals(profileId);
  var text;
  if (!goals.length) {
    text = 'Целей пока нет.';
  } else {
    text = '🎯 Ваши цели:\n' + goals.map(function (g) {
      var pct = Math.max(0, Math.min(100, Math.round(Number(g.current) / (Number(g.target) || 1) * 100)));
      var bar = '▓'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
      return g.title + ' (' + g.metric + '): ' + g.current + ' → ' + g.target + ' к ' + g.deadline + '\n' + bar + ' ' + pct + '%';
    }).join('\n\n');
  }
  setSession(chatId, 'awaiting_goal', { activeProfileId: profileId });
  sendMessage(chatId, text + '\n\nЧтобы добавить новую цель, напишите:\n<i>название; показатель; текущее; цель; срок ГГГГ-ММ-ДД</i>');
}

function handleGoalText_(chatId, profileId, text) {
  var parts = text.split(';').map(function (p) { return p.trim(); });
  if (parts.length < 5) {
    sendMessage(chatId, 'Нужно 5 полей через ";": название; показатель; текущее; цель; срок');
    return;
  }
  addGoal(profileId, parts[0], parts[1], parts[2], parts[3], parts[4]);
  clearSession(chatId);
  sendMessage(chatId, '🎯 Цель добавлена: ' + escapeHtml_(parts[0]), mainMenuKeyboard());
}

// ---------- Report (on-demand, last 7 days) ----------
function sendReport_(chatId, profileId) {
  if (!profileId) return sendProfilePicker_(chatId);
  var profile = getProfile(profileId);
  var since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  var checkins = getCheckinsSince(profileId, since);
  var workouts = getWorkoutsSince(profileId, since);
  var analyses = getAnalysesSince(profileId, since);
  var goals = getGoals(profileId);

  var text = '📈 Отчёт за 7 дней — ' + profile.name + '\n\n' +
    '✅ Чек-инов: ' + checkins.length + '\n' +
    '🏋️ Тренировок: ' + workouts.length + '\n' +
    '📊 Новых анализов: ' + analyses.length + '\n' +
    '🎯 Активных целей: ' + goals.length;

  sendMessage(chatId, text, mainMenuKeyboard());
}

// ---------- Personal rules ----------
function promptPersonalRule_(chatId, profileId) {
  if (!profileId) return sendProfilePicker_(chatId);
  setSession(chatId, 'awaiting_personal_rule', { activeProfileId: profileId });
  sendMessage(chatId,
    '🧠 Опишите личное правило в формате:\n<i>если [ключевые слова через запятую], то [рекомендация]</i>\n\n' +
    'Например:\n<i>если гемоглобин, ферритин, то мне лично помогает больше гречки и меньше кофе</i>');
}

function handlePersonalRuleText_(chatId, profileId, text) {
  var m = /если(.*?),?\s*то\s+(.*)/i.exec(text);
  if (!m) {
    sendMessage(chatId, 'Не понял формат. Используйте: <i>если ..., то ...</i>');
    return;
  }
  var keywords = m[1].trim();
  var recommendation = m[2].trim();
  addPersonalRule(profileId, keywords, recommendation);
  clearSession(chatId);
  sendMessage(chatId, '🧠 Запомнил! Буду учитывать это при показателях: ' + escapeHtml_(keywords), mainMenuKeyboard());
}

// ---------- Daily check-in reply ----------
function handleCheckinText_(chatId, profileId, text) {
  addCheckin(profileId, new Date().toISOString(), text);
  var profile = getProfile(profileId);
  clearSession(chatId);
  sendMessage(chatId, '✅ Записал для ' + profile.name + '. Отличная работа сегодня! 💪', mainMenuKeyboard());
}

// ---------- Lab photos ----------
function handlePhoto_(chatId, fileId) {
  var profileId = getActiveProfileId(chatId);
  if (!profileId) return sendProfilePicker_(chatId);
  var profile = getProfile(profileId);
  try {
    var url = saveTelegramFileToDrive(fileId, profile.name);
    addAnalysisEntry(profileId, new Date().toISOString(), 'photo_url', url);
    sendMessage(chatId, '📎 Фото сохранил (' + profile.name + '). Когда удобно — пришлите цифры текстом через «📊 Анализы».', mainMenuKeyboard());
  } catch (err) {
    Logger.log('handlePhoto_ error: ' + err);
    sendMessage(chatId, 'Не получилось сохранить фото 😕. Попробуйте ещё раз.');
  }
}

function escapeHtml_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
