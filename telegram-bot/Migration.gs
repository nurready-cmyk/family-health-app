// ===== ONE-TIME MIGRATION FROM THE PWA (localStorage) =====
// profiles.html gets a "📮 Отправить в Google Sheets" button that assembles
// each profile's data using the same shape as the existing exportProfile()
// function (js is already there — see profiles.html) and POSTs it here once,
// so old data isn't lost when the family switches to the bot + Sheets.
//
// Body shape:
// {
//   action: 'migrate',
//   secret: '<MIGRATION_SECRET>',
//   data: {
//     profile1: { profile, analyses, workouts, nutrition, goals, checkins },
//     profile2: { ... }
//   }
// }
// (analyses[].values, workouts[], nutrition[].foods, goals[], checkins[].items
//  all match the exact shapes saved by analyses.html / workouts.html / nutrition.html / goals.html / index.html.)

function handleMigrationRequest(body) {
  var expectedSecret = PropertiesService.getScriptProperties().getProperty('MIGRATION_SECRET');
  if (!expectedSecret || body.secret !== expectedSecret) {
    return jsonOutput_({ ok: false, error: 'bad secret' });
  }

  var data = body.data;
  if (!data || typeof data !== 'object') {
    return jsonOutput_({ ok: false, error: 'bad data' });
  }

  var counts = { profiles: 0, analyses: 0, workouts: 0, nutrition: 0, goals: 0, checkins: 0 };

  Object.keys(data).forEach(function (profileId) {
    var bundle = data[profileId] || {};

    if (bundle.profile) { migrateProfile_(profileId, bundle.profile); counts.profiles++; }
    counts.analyses += migrateAnalyses_(profileId, bundle.analyses || []);
    counts.workouts += migrateWorkouts_(profileId, bundle.workouts || []);
    counts.nutrition += migrateNutrition_(profileId, bundle.nutrition || []);
    counts.goals += migrateGoals_(profileId, bundle.goals || []);
    counts.checkins += migrateCheckins_(profileId, bundle.checkins || []);
  });

  return jsonOutput_({ ok: true, counts: counts });
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// { id, name, gender, birthYear, weight, height }
function migrateProfile_(profileId, profile) {
  var existing = getProfile(profileId);
  var patch = { name: profile.name, gender: profile.gender, birthYear: profile.birthYear };
  if (existing) updateById_(SHEETS.PROFILES, profileId, patch);
  else append_(SHEETS.PROFILES, Object.assign({ id: profileId }, patch));
}

// [{ id, date, type, values: {indicatorKey: value}, notes, fileRef }]
function migrateAnalyses_(profileId, list) {
  var n = 0;
  list.forEach(function (a) {
    Object.keys(a.values || {}).forEach(function (k) {
      addAnalysisEntry(profileId, a.date, k, a.values[k]);
      n++;
    });
  });
  return n;
}

// [{ id, date, type, duration, intensity, notes }]
function migrateWorkouts_(profileId, list) {
  list.forEach(function (w) {
    var exercises = [w.intensity ? 'интенсивность: ' + w.intensity : '', w.notes || ''].filter(Boolean).join('; ');
    addWorkout(profileId, w.date, w.type, w.duration, exercises);
  });
  return list.length;
}

// [{ id, date, time, type, foods: [{foodName, grams}], notes }]
function migrateNutrition_(profileId, list) {
  var n = 0;
  list.forEach(function (meal) {
    (meal.foods || []).forEach(function (f) {
      addNutritionEntry(profileId, meal.date, f.foodName, f.grams);
      n++;
    });
    if ((!meal.foods || !meal.foods.length) && meal.notes) {
      addNutritionEntry(profileId, meal.date, meal.notes, '');
      n++;
    }
  });
  return n;
}

// [{ id, name, indicator, current, target, deadline, desc, createdAt }]
function migrateGoals_(profileId, list) {
  list.forEach(function (g) {
    addGoal(profileId, g.name, g.indicator, g.current, g.target, g.deadline);
  });
  return list.length;
}

// [{ id, date, items: [...], score }]
function migrateCheckins_(profileId, list) {
  list.forEach(function (c) {
    var text = (c.items && c.items.length ? c.items.join(', ') : '') + (c.score != null ? ' (счёт: ' + c.score + ')' : '');
    addCheckin(profileId, c.date, text.trim());
  });
  return list.length;
}
