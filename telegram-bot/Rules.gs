// ===== RULES-BASED RECOMMENDATION ENGINE =====
// Ported from js/rules.js (PWA) — identical trigger logic, depends on checkNorm() from Norms.gs.
var Rules = [
  { id: 'hb_low', check: function (a, g) { return a.hemoglobin != null && checkNorm('hemoglobin', +a.hemoglobin, g) && checkNorm('hemoglobin', +a.hemoglobin, g).status === 'low'; },
    severity: 'danger', title: '🩸 Низкий гемоглобин', problem: 'Гемоглобин ниже нормы — возможна анемия',
    eat: ['Говядина, телятина (2-3 раза в неделю)', 'Гречка, чечевица, шпинат', 'Яблоки, гранат, курага', 'Печень говяжья'],
    avoid: ['Чай и кофе сразу после еды (блокируют железо)', 'Молочные продукты вместе с железосодержащей пищей'],
    workout: 'Умеренное кардио (ходьба 30 мин). Избегать высокоинтенсивных тренировок до нормализации.',
    supplements: 'Рассмотреть препараты железа с витамином C (после консультации с врачом)' },
  { id: 'hb_high', check: function (a, g) { return a.hemoglobin != null && checkNorm('hemoglobin', +a.hemoglobin, g) && checkNorm('hemoglobin', +a.hemoglobin, g).status === 'high'; },
    severity: 'warning', title: '🩸 Высокий гемоглобин', problem: 'Гемоглобин выше нормы — возможно обезвоживание или другие причины',
    eat: ['Больше воды (2-2.5 л в день)', 'Зелёные овощи, цитрусовые'],
    avoid: ['Избыток красного мяса', 'Препараты железа без назначения'],
    workout: 'Умеренные тренировки, хорошее увлажнение во время нагрузок',
    supplements: 'Проконсультируйтесь с врачом' },
  { id: 'glucose_high', check: function (a, g) { return a.glucose != null && checkNorm('glucose', +a.glucose, g) && checkNorm('glucose', +a.glucose, g).status === 'high'; },
    severity: 'danger', title: '🍬 Высокая глюкоза', problem: 'Уровень сахара выше нормы — риск преддиабета',
    eat: ['Овощи (брокколи, огурцы, кабачки)', 'Цельнозерновые крупы (овсянка, гречка)', 'Бобовые (фасоль, чечевица)', 'Рыба, курица без кожи'],
    avoid: ['Белый хлеб, выпечка, сладкое', 'Сладкие напитки и соки', 'Белый рис и картофель в больших количествах'],
    workout: 'Ходьба 30 мин после еды. Силовые тренировки 3x в неделю улучшают чувствительность к инсулину.',
    supplements: 'Хром, магний (после консультации)' },
  { id: 'glucose_low', check: function (a, g) { return a.glucose != null && checkNorm('glucose', +a.glucose, g) && checkNorm('glucose', +a.glucose, g).status === 'low'; },
    severity: 'warning', title: '🍬 Низкая глюкоза', problem: 'Уровень сахара ниже нормы — гипогликемия',
    eat: ['Дробное питание (5-6 раз в день)', 'Медленные углеводы: гречка, овсянка', 'Орехи, сыр в качестве перекусов'],
    avoid: ['Длительные перерывы между едой', 'Алкоголь натощак'],
    workout: 'Всегда иметь перекус перед тренировкой. Избегать длительных тренировок без питания.',
    supplements: 'Питание — главный инструмент' },
  { id: 'cholesterol_high', check: function (a, g) { return a.cholesterol != null && checkNorm('cholesterol', +a.cholesterol, g) && checkNorm('cholesterol', +a.cholesterol, g).status === 'high'; },
    severity: 'danger', title: '🫀 Высокий холестерин', problem: 'Общий холестерин выше нормы — риск для сердца',
    eat: ['Жирная рыба (лосось, скумбрия) — омега-3', 'Авокадо, орехи (горсть в день)', 'Овощи и фрукты богатые клетчаткой', 'Овсянка (бета-глюкан снижает холестерин)'],
    avoid: ['Жареное, фастфуд', 'Транс-жиры (маргарин, покупная выпечка)', 'Жирное мясо, колбасы, сосиски'],
    workout: 'Кардио 3-4 раза в неделю (30-45 мин) — бег, велосипед, плавание',
    supplements: 'Омега-3 (рыбий жир), Ниацин (витамин B3) — после консультации' },
  { id: 'ldl_high', check: function (a, g) { return a.ldl != null && checkNorm('ldl', +a.ldl, g) && checkNorm('ldl', +a.ldl, g).status === 'high'; },
    severity: 'danger', title: '🫀 Высокий ЛПНП', problem: '"Плохой" холестерин повышен — риск атеросклероза',
    eat: ['Клетчатка: овсянка, яблоки, бобовые', 'Растительные стеролы (обогащённые продукты)', 'Оливковое масло первого отжима'],
    avoid: ['Насыщенные жиры (жирное мясо, сливочное масло)', 'Транс-жиры'],
    workout: 'Регулярные аэробные нагрузки умеренной интенсивности',
    supplements: 'Омега-3, растительные стеролы' },
  { id: 'vitd_low', check: function (a, g) { return a.vitaminD != null && checkNorm('vitaminD', +a.vitaminD, g) && checkNorm('vitaminD', +a.vitaminD, g).status === 'low'; },
    severity: 'warning', title: '☀️ Низкий витамин D', problem: 'Дефицит витамина D — влияет на иммунитет и кости',
    eat: ['Жирная рыба (лосось, тунец, скумбрия)', 'Яичные желтки', 'Обогащённые молочные продукты', 'Грибы (шиитаке, вешенки)'],
    avoid: ['Ограничьте кофеин (снижает усвоение кальция и D)'],
    workout: 'Прогулки на солнце 20-30 мин в день (без SPF-крема) — лучший источник витамина D',
    supplements: 'Витамин D3 1000-2000 МЕ в день (обязательно проконсультируйтесь с врачом)' },
  { id: 'ferritin_low', check: function (a, g) { return a.ferritin != null && checkNorm('ferritin', +a.ferritin, g) && checkNorm('ferritin', +a.ferritin, g).status === 'low'; },
    severity: 'warning', title: '🔋 Низкий ферритин', problem: 'Запасы железа в организме истощены — скрытая анемия',
    eat: ['Красное мясо, печень', 'Бобовые с витамином C (помогает усвоению)', 'Тёмно-зелёные овощи (шпинат, брокколи)', 'Тыквенные семечки, кунжут'],
    avoid: ['Чай, кофе, кальций рядом с богатой железом едой'],
    workout: 'Снизить интенсивность тренировок до нормализации ферритина. Мягкая йога, стретчинг.',
    supplements: 'Препараты железа с витамином C — после консультации с врачом' },
  { id: 'alt_high', check: function (a, g) { return a.alt != null && checkNorm('alt', +a.alt, g) && checkNorm('alt', +a.alt, g).status === 'high'; },
    severity: 'danger', title: '🫁 Повышенный АЛТ', problem: 'Фермент печени повышен — возможна нагрузка на печень',
    eat: ['Тыква, свёкла, морковь', 'Куркума (противовоспалительный эффект)', 'Зелёный чай (антиоксиданты)', 'Лёгкая пища: варёное, тушёное'],
    avoid: ['Алкоголь полностью исключить', 'Жареное, жирное, острое', 'Лекарства без назначения врача'],
    workout: 'Только лёгкие нагрузки: ходьба, йога. Никаких силовых тренировок.',
    supplements: 'Проконсультируйтесь с гастроэнтерологом' },
  { id: 'tsh_low', check: function (a, g) { return a.tsh != null && checkNorm('tsh', +a.tsh, g) && checkNorm('tsh', +a.tsh, g).status === 'low'; },
    severity: 'warning', title: '🦋 Пониженный ТТГ', problem: 'ТТГ ниже нормы — возможен гипертиреоз',
    eat: ['Капуста (брокколи, цветная — помогает при гипертиреозе)', 'Продукты с селеном: бразильский орех, рыба'],
    avoid: ['Йодосодержащие добавки без назначения', 'Морская капуста в больших количествах'],
    workout: 'Умеренные нагрузки. Избегать перегрева.',
    supplements: 'Обязательно к эндокринологу!' },
  { id: 'tsh_high', check: function (a, g) { return a.tsh != null && checkNorm('tsh', +a.tsh, g) && checkNorm('tsh', +a.tsh, g).status === 'high'; },
    severity: 'warning', title: '🦋 Повышенный ТТГ', problem: 'ТТГ выше нормы — возможен гипотиреоз',
    eat: ['Морепродукты (йод)', 'Яйца, мясо (тирозин)', 'Орехи, семена (селен и цинк)'],
    avoid: ['Сырая капуста в больших количествах (зобогенные вещества)', 'Избыток сои'],
    workout: 'Умеренные тренировки. Избегать переохлаждения.',
    supplements: 'Йод, Селен — после консультации с эндокринологом' },
  { id: 'vitb12_low', check: function (a, g) { return a.vitaminB12 != null && checkNorm('vitaminB12', +a.vitaminB12, g) && checkNorm('vitaminB12', +a.vitaminB12, g).status === 'low'; },
    severity: 'warning', title: '💊 Низкий витамин B12', problem: 'Дефицит B12 — влияет на нервную систему и кровь',
    eat: ['Говядина, субпродукты', 'Яйца, творог, сыр', 'Морепродукты (мидии, устрицы)', 'Лосось, тунец'],
    avoid: ['Длительное вегетарианство без добавок'],
    workout: 'Умеренные тренировки. При усталости — снизить интенсивность.',
    supplements: 'Витамин B12 (метилкобаламин) 1000 мкг/день' },
  { id: 'pressure_high', check: function (a, g) { return (a.systolic != null && +a.systolic > 130) || (a.diastolic != null && +a.diastolic > 85); },
    severity: 'danger', title: '❤️ Повышенное давление', problem: 'Давление выше нормы — риск для сердца и сосудов',
    eat: ['Калий: бананы, авокадо, картофель (запечённый)', 'Магний: тёмный шоколад, орехи, шпинат', 'Ягоды (особенно черника)', 'Свёкла, чеснок'],
    avoid: ['Соль (не более 5г в день)', 'Кофе и крепкий чай', 'Алкоголь', 'Полуфабрикаты, консервы'],
    workout: 'Ходьба 30-45 мин ежедневно. Избегать задержки дыхания при силовых.',
    supplements: 'Магний, Коэнзим Q10 — после консультации с кардиологом' },
  { id: 'wbc_low', check: function (a, g) { return a.wbc != null && checkNorm('wbc', +a.wbc, g) && checkNorm('wbc', +a.wbc, g).status === 'low'; },
    severity: 'danger', title: '🛡️ Низкие лейкоциты', problem: 'Иммунная защита снижена — риск инфекций',
    eat: ['Чеснок, имбирь, куркума', 'Цитрусовые (витамин C)', 'Цинк: тыквенные семечки, говядина', 'Пробиотики: йогурт, кефир'],
    avoid: ['Переохлаждение', 'Контакты с больными'],
    workout: 'Только лёгкие прогулки. Никаких интенсивных тренировок!',
    supplements: 'Витамин C, Цинк, пробиотики — проконсультируйтесь с врачом' },
  { id: 'wbc_high', check: function (a, g) { return a.wbc != null && checkNorm('wbc', +a.wbc, g) && checkNorm('wbc', +a.wbc, g).status === 'high'; },
    severity: 'warning', title: '🛡️ Высокие лейкоциты', problem: 'Лейкоциты повышены — возможно воспаление или инфекция',
    eat: ['Противовоспалительная диета: куркума, имбирь', 'Омега-3, антиоксиданты (ягоды, овощи)'],
    avoid: ['Алкоголь, курение'],
    workout: 'Отдых до выяснения причины. Проконсультируйтесь с врачом.',
    supplements: 'Обратитесь к врачу для выяснения причины' }
];

/**
 * Get active general recommendations based on latest analysis values.
 * @param {Object} analysisValues - flat key:value from latest analysis
 * @param {string} gender - 'male' | 'female'
 * @returns {Array} array of active recommendation objects
 */
function getActiveRecommendations(analysisValues, gender) {
  if (!analysisValues) return [];
  return Rules.filter(function (rule) {
    try { return rule.check(analysisValues, gender); } catch (e) { return false; }
  });
}

/**
 * Personal, user-taught rules: checked FIRST, before the general Rules above.
 * A PersonalRules row matches when any of its keyword tokens appears in the
 * label of a currently out-of-norm indicator, or literally in the raw analysis
 * text the family member typed.
 *
 * @param {string} profileId
 * @param {Array<string>} triggeredIndicatorKeys - keys from analysisValues that are out of norm right now
 * @returns {Array<{recommendationText: string}>}
 */
function getPersonalRecommendations(profileId, triggeredIndicatorKeys) {
  var rows = getPersonalRules(profileId); // from Sheets.gs
  if (!rows.length) return [];
  var triggeredLabels = triggeredIndicatorKeys
    .map(function (k) { return Norms[k] ? Norms[k].label.toLowerCase() : k.toLowerCase(); });

  return rows.filter(function (row) {
    var keywords = row.triggerKeywords.toLowerCase().split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    return keywords.some(function (kw) {
      return triggeredLabels.some(function (label) { return label.indexOf(kw) !== -1 || kw.indexOf(label) !== -1; });
    });
  });
}
