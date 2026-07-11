// ===== GOOGLE SHEETS DATA ACCESS LAYER =====
// One spreadsheet (container-bound), one tab per entity. Setup.gs creates the
// tabs and header rows; everything here assumes they already exist.

var SHEETS = {
  CONFIG: 'Config',
  PROFILES: 'Profiles',
  ANALYSES: 'Analyses',
  WORKOUTS: 'Workouts',
  NUTRITION: 'Nutrition',
  GOALS: 'Goals',
  CHECKINS: 'Checkins',
  PERSONAL_RULES: 'PersonalRules',
  SESSIONS: 'Sessions'
};

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Лист "' + name + '" не найден. Сначала запустите setup() из Setup.gs.');
  return sh;
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Read an entire sheet as an array of plain objects keyed by its header row. */
function readAll_(name) {
  var sh = sheet_(name);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  return values.slice(1)
    .filter(function (row) { return row.some(function (c) { return c !== '' && c !== null; }); })
    .map(function (row) {
      var obj = {};
      headers.forEach(function (h, i) { obj[h] = row[i]; });
      return obj;
    });
}

/** Append one row to a sheet, filling columns by header name. */
function append_(name, obj) {
  var sh = sheet_(name);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var row = headers.map(function (h) { return obj.hasOwnProperty(h) ? obj[h] : ''; });
  sh.appendRow(row);
}

/** Overwrite one existing row (matched by id column) with new field values. */
function updateById_(name, id, patch) {
  var sh = sheet_(name);
  var values = sh.getDataRange().getValues();
  var headers = values[0];
  var idCol = headers.indexOf('id');
  for (var r = 1; r < values.length; r++) {
    if (values[r][idCol] === id) {
      headers.forEach(function (h, c) {
        if (patch.hasOwnProperty(h)) sh.getRange(r + 1, c + 1).setValue(patch[h]);
      });
      return true;
    }
  }
  return false;
}

// ---------- Config (key/value) ----------
function getConfig(key) {
  var row = readAll_(SHEETS.CONFIG).filter(function (r) { return r.key === key; })[0];
  return row ? row.value : null;
}
function setConfig(key, value) {
  var sh = sheet_(SHEETS.CONFIG);
  var values = sh.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    if (values[r][0] === key) { sh.getRange(r + 1, 2).setValue(value); return; }
  }
  sh.appendRow([key, value]);
}

// ---------- Profiles ----------
function getProfiles() {
  return readAll_(SHEETS.PROFILES);
}
function getProfile(id) {
  return getProfiles().filter(function (p) { return p.id === id; })[0] || null;
}

// ---------- Analyses ----------
// One row per indicator reading: { id, profileId, date, indicatorKey, value }
function addAnalysisEntry(profileId, dateIso, indicatorKey, value) {
  append_(SHEETS.ANALYSES, { id: genId(), profileId: profileId, date: dateIso, indicatorKey: indicatorKey, value: value });
}

/** Latest value per indicator for a profile, as a flat { indicatorKey: value } map (for Rules.gs). */
function getLatestAnalysisValues(profileId) {
  var rows = readAll_(SHEETS.ANALYSES).filter(function (r) { return r.profileId === profileId; });
  rows.sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
  var latest = {};
  rows.forEach(function (r) { latest[r.indicatorKey] = r.value; });
  return latest;
}

function getAnalysesSince(profileId, sinceDate) {
  return readAll_(SHEETS.ANALYSES).filter(function (r) {
    return r.profileId === profileId && new Date(r.date) >= sinceDate;
  });
}

// ---------- Workouts ----------
function addWorkout(profileId, dateIso, type, duration, exercises) {
  append_(SHEETS.WORKOUTS, { id: genId(), profileId: profileId, date: dateIso, type: type, duration: duration, exercises: exercises });
}
function getWorkoutsSince(profileId, sinceDate) {
  return readAll_(SHEETS.WORKOUTS).filter(function (r) {
    return r.profileId === profileId && new Date(r.date) >= sinceDate;
  });
}

// ---------- Nutrition ----------
function addNutritionEntry(profileId, dateIso, foodName, grams) {
  append_(SHEETS.NUTRITION, { id: genId(), profileId: profileId, date: dateIso, foodName: foodName, grams: grams });
}
function getNutritionForDay(profileId, dateIso) {
  var day = dateIso.slice(0, 10);
  return readAll_(SHEETS.NUTRITION).filter(function (r) {
    return r.profileId === profileId && String(r.date).slice(0, 10) === day;
  });
}

// ---------- Goals ----------
function addGoal(profileId, title, metric, current, target, deadline) {
  append_(SHEETS.GOALS, { id: genId(), profileId: profileId, title: title, metric: metric, current: current, target: target, deadline: deadline });
}
function getGoals(profileId) {
  return readAll_(SHEETS.GOALS).filter(function (r) { return r.profileId === profileId; });
}
function updateGoalCurrent(goalId, current) {
  updateById_(SHEETS.GOALS, goalId, { current: current });
}

// ---------- Checkins ----------
function addCheckin(profileId, dateIso, text) {
  append_(SHEETS.CHECKINS, { id: genId(), profileId: profileId, date: dateIso, text: text });
}
function getCheckinsSince(profileId, sinceDate) {
  return readAll_(SHEETS.CHECKINS).filter(function (r) {
    return r.profileId === profileId && new Date(r.date) >= sinceDate;
  });
}

// ---------- Personal rules (the "teach the bot" table) ----------
function addPersonalRule(profileId, triggerKeywords, recommendationText) {
  append_(SHEETS.PERSONAL_RULES, {
    id: genId(), profileId: profileId, triggerKeywords: triggerKeywords,
    recommendationText: recommendationText, createdAt: new Date().toISOString()
  });
}
function getPersonalRules(profileId) {
  return readAll_(SHEETS.PERSONAL_RULES).filter(function (r) { return r.profileId === profileId; });
}

// ---------- Sessions (per-chat conversation state) ----------
function getSession(chatId) {
  var sh = sheet_(SHEETS.SESSIONS);
  var values = sh.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][0]) === String(chatId)) {
      var tempData = {};
      try { tempData = JSON.parse(values[r][2] || '{}'); } catch (e) {}
      return { chatId: chatId, step: values[r][1] || 'idle', tempData: tempData, row: r + 1 };
    }
  }
  return { chatId: chatId, step: 'idle', tempData: {}, row: null };
}

function setSession(chatId, step, tempData) {
  var sh = sheet_(SHEETS.SESSIONS);
  var existing = getSession(chatId);
  var json = JSON.stringify(tempData || {});
  if (existing.row) {
    sh.getRange(existing.row, 2, 1, 2).setValues([[step, json]]);
  } else {
    sh.appendRow([chatId, step, json]);
  }
}

/** Reset the conversation step but keep which family profile is active. */
function clearSession(chatId) {
  var existing = getSession(chatId);
  setSession(chatId, 'idle', { activeProfileId: existing.tempData.activeProfileId });
}

function getActiveProfileId(chatId) {
  return getSession(chatId).tempData.activeProfileId || null;
}

function setActiveProfileId(chatId, profileId) {
  var existing = getSession(chatId);
  var tempData = existing.tempData;
  tempData.activeProfileId = profileId;
  setSession(chatId, existing.step, tempData);
}
