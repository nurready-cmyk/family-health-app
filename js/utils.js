// ===== UTILITIES =====

const MONTHS_RU = ['января','февраля','марта','апреля','мая','июня',
  'июля','августа','сентября','октября','ноября','декабря'];
const MONTHS_SHORT = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
const DAYS_RU = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];

/**
 * Format date to Russian string: "22 июня 2026"
 */
function formatDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d)) return '—';
  return `${d.getDate()} ${MONTHS_RU[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Format date as dd.mm.yyyy
 */
function formatDateShort(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d)) return '—';
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}

/**
 * Today's date as YYYY-MM-DD (for input[type=date] default)
 */
function todayISO() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Calculate health index 0-100 based on analysis values
 */
function calculateHealthIndex(analysisValues, gender) {
  if (!analysisValues) return 0;
  const keys = Object.keys(Norms);
  let totalScore = 0;
  let count = 0;
  keys.forEach(key => {
    const val = analysisValues[key];
    if (val === undefined || val === null || val === '') return;
    const result = checkNorm(key, +val, gender);
    if (!result) return;
    count++;
    if (result.status === 'normal') totalScore += 100;
    else {
      const norm = Norms[key];
      const range = gender === 'female' ? norm.female : norm.male;
      const [min, max] = range;
      const spread = max - min || 1;
      if (result.status === 'low') {
        const deviation = Math.abs(+val - min) / spread;
        totalScore += Math.max(0, 100 - deviation * 150);
      } else {
        const deviation = Math.abs(+val - max) / spread;
        totalScore += Math.max(0, 100 - deviation * 150);
      }
    }
  });
  return count === 0 ? 0 : Math.round(totalScore / count);
}

/**
 * Get color class for health index value
 */
function getHealthIndexColor(index) {
  if (index >= 80) return 'success';
  if (index >= 60) return 'warning';
  return 'danger';
}

/**
 * Get emoji for health index
 */
function getHealthIndexEmoji(index) {
  if (index >= 80) return '💪';
  if (index >= 60) return '😊';
  if (index >= 40) return '😐';
  return '😟';
}

/**
 * Get health status label
 */
function getHealthStatusLabel(index) {
  if (index >= 85) return 'Отлично';
  if (index >= 70) return 'Хорошо';
  if (index >= 55) return 'Удовлетворительно';
  if (index >= 40) return 'Требует внимания';
  return 'Нужна консультация врача';
}

/**
 * Calculate trend from array of numeric values
 * @returns { trend: 'rising'|'falling'|'stable', change: number }
 */
function calculateTrend(values) {
  const nums = values.filter(v => v !== null && v !== undefined && !isNaN(+v)).map(Number);
  if (nums.length < 2) return { trend: 'stable', change: 0 };
  const first = nums[0];
  const last = nums[nums.length - 1];
  const change = ((last - first) / Math.abs(first || 1)) * 100;
  if (Math.abs(change) < 3) return { trend: 'stable', change: 0 };
  return { trend: change > 0 ? 'rising' : 'falling', change: Math.round(change) };
}

/**
 * Get trend label in Russian
 */
function getTrendLabel(trend) {
  if (trend === 'rising') return '↑ Растёт';
  if (trend === 'falling') return '↓ Снижается';
  return '→ Стабильно';
}

/**
 * Calculate energy points from activities
 */
function calculateEnergyPoints(activities) {
  let points = 0;
  activities.forEach(a => {
    const mins = a.duration || 0;
    switch(a.type) {
      case 'strength': points += mins * 1.2; break;
      case 'cardio': points += mins * 1.0; break;
      case 'yoga': points += mins * 0.8; break;
      case 'stretch': points += mins * 0.5; break;
      default: points += mins * 0.7;
    }
  });
  return Math.round(points);
}

/**
 * Get achievements/badges based on user data
 */
function getBadges(userData) {
  const { workouts = [], analyses = [], goals = [], checkins = [] } = userData;
  const badges = [];

  if (workouts.length >= 1) badges.push({ icon: '🏃', name: 'Первая тренировка' });
  if (workouts.length >= 7) badges.push({ icon: '🏅', name: '7 тренировок' });
  if (workouts.length >= 30) badges.push({ icon: '🥇', name: '30 тренировок' });

  if (analyses.length >= 1) badges.push({ icon: '🩺', name: 'Первый анализ' });
  if (analyses.length >= 3) badges.push({ icon: '📊', name: 'Отслеживаю здоровье' });

  if (goals.length >= 1) badges.push({ icon: '🎯', name: 'Поставил цель' });
  const completedGoals = goals.filter(g => {
    if (!g.current || !g.target) return false;
    return Math.abs(+g.current - +g.target) / Math.abs(+g.target || 1) < 0.05;
  });
  if (completedGoals.length >= 1) badges.push({ icon: '🏆', name: 'Цель достигнута!' });

  if (checkins.length >= 7) badges.push({ icon: '📅', name: 'Неделя чек-инов' });
  if (checkins.length >= 30) badges.push({ icon: '🌟', name: 'Месяц чек-инов' });

  // Check workout streak
  const workoutDates = workouts.map(w => new Date(w.date).toDateString());
  const uniqueDates = [...new Set(workoutDates)].sort();
  let maxStreak = 0, streak = 1;
  for (let i = 1; i < uniqueDates.length; i++) {
    const d1 = new Date(uniqueDates[i-1]);
    const d2 = new Date(uniqueDates[i]);
    const diff = (d2 - d1) / 86400000;
    if (diff <= 2) streak++;
    else streak = 1;
    maxStreak = Math.max(maxStreak, streak);
  }
  if (maxStreak >= 5) badges.push({ icon: '🔥', name: '5 дней подряд!' });
  if (maxStreak >= 14) badges.push({ icon: '⚡', name: '2 недели подряд!' });

  return badges;
}

/**
 * Format duration in minutes to "1 ч 30 мин"
 */
function formatDuration(mins) {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

/**
 * Days ago label
 */
function daysAgo(date) {
  const d = date instanceof Date ? date : new Date(date);
  const diff = Math.floor((Date.now() - d) / 86400000);
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'вчера';
  if (diff < 7) return `${diff} дня назад`;
  if (diff < 14) return 'неделю назад';
  return formatDate(d);
}

/**
 * Show toast notification
 */
function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%);
    background: ${type === 'success' ? '#43D39E' : type === 'error' ? '#FF4757' : '#FFB830'};
    color: white; padding: 12px 24px; border-radius: 25px;
    font-weight: 700; font-size: 0.9rem; z-index: 999;
    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
    animation: fadeInUp 0.3s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

/**
 * Get current active profile info
 */
function getActiveProfileInfo() {
  const id = Storage.getActiveProfile();
  return Storage.getProfile(id);
}

/**
 * Filter data by period
 */
function filterByPeriod(items, period, dateField = 'date') {
  const now = Date.now();
  const ms = {
    '3m': 90 * 86400000,
    '6m': 180 * 86400000,
    '1y': 365 * 86400000,
    'all': Infinity
  };
  const limit = ms[period] || Infinity;
  return items.filter(item => {
    const d = new Date(item[dateField]);
    return (now - d.getTime()) <= limit;
  });
}

/**
 * Setup bottom nav active state
 */
function setupNav(activePage) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.remove('active');
    if (el.dataset.page === activePage) el.classList.add('active');
  });
}

/**
 * Setup profile switcher
 */
function setupProfileSwitcher(onSwitch) {
  const btns = document.querySelectorAll('.profile-btn');
  const activeId = Storage.getActiveProfile();
  btns.forEach(btn => {
    if (btn.dataset.profile === activeId) btn.classList.add('active');
    else btn.classList.remove('active');

    btn.addEventListener('click', () => {
      Storage.setActiveProfile(btn.dataset.profile);
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (onSwitch) onSwitch(btn.dataset.profile);
    });
  });
}

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  });
}
