// ===== STORAGE MODULE =====
const Storage = {
  // Active profile
  getActiveProfile() {
    return localStorage.getItem('activeProfile') || 'profile1';
  },
  setActiveProfile(id) {
    localStorage.setItem('activeProfile', id);
  },

  // Profiles
  getProfile(id) {
    const data = localStorage.getItem(`profile_${id}`);
    if (data) return JSON.parse(data);
    // Default profiles
    if (id === 'profile1') return { id: 'profile1', name: 'Я', gender: 'male', birthYear: 1990 };
    if (id === 'profile2') return { id: 'profile2', name: 'Супруга', gender: 'female', birthYear: 1992 };
    return null;
  },
  saveProfile(id, data) {
    localStorage.setItem(`profile_${id}`, JSON.stringify({ ...data, id }));
  },

  // Analyses
  getAnalyses(profileId) {
    const data = localStorage.getItem(`analyses_${profileId}`);
    return data ? JSON.parse(data) : [];
  },
  saveAnalysis(profileId, analysis) {
    const list = this.getAnalyses(profileId);
    const idx = list.findIndex(a => a.id === analysis.id);
    if (idx >= 0) list[idx] = analysis;
    else list.unshift({ ...analysis, id: analysis.id || Date.now().toString() });
    localStorage.setItem(`analyses_${profileId}`, JSON.stringify(list));
  },
  deleteAnalysis(profileId, analysisId) {
    const list = this.getAnalyses(profileId).filter(a => a.id !== analysisId);
    localStorage.setItem(`analyses_${profileId}`, JSON.stringify(list));
  },

  // Workouts
  getWorkouts(profileId) {
    const data = localStorage.getItem(`workouts_${profileId}`);
    return data ? JSON.parse(data) : [];
  },
  saveWorkout(profileId, workout) {
    const list = this.getWorkouts(profileId);
    const idx = list.findIndex(w => w.id === workout.id);
    if (idx >= 0) list[idx] = workout;
    else list.unshift({ ...workout, id: workout.id || Date.now().toString() });
    localStorage.setItem(`workouts_${profileId}`, JSON.stringify(list));
  },
  deleteWorkout(profileId, workoutId) {
    const list = this.getWorkouts(profileId).filter(w => w.id !== workoutId);
    localStorage.setItem(`workouts_${profileId}`, JSON.stringify(list));
  },

  // Nutrition
  getNutrition(profileId) {
    const data = localStorage.getItem(`nutrition_${profileId}`);
    return data ? JSON.parse(data) : [];
  },
  saveNutrition(profileId, entry) {
    const list = this.getNutrition(profileId);
    const idx = list.findIndex(n => n.id === entry.id);
    if (idx >= 0) list[idx] = entry;
    else list.unshift({ ...entry, id: entry.id || Date.now().toString() });
    localStorage.setItem(`nutrition_${profileId}`, JSON.stringify(list));
  },
  deleteNutrition(profileId, entryId) {
    const list = this.getNutrition(profileId).filter(n => n.id !== entryId);
    localStorage.setItem(`nutrition_${profileId}`, JSON.stringify(list));
  },

  // Goals
  getGoals(profileId) {
    const data = localStorage.getItem(`goals_${profileId}`);
    return data ? JSON.parse(data) : [];
  },
  saveGoal(profileId, goal) {
    const list = this.getGoals(profileId);
    const idx = list.findIndex(g => g.id === goal.id);
    if (idx >= 0) list[idx] = goal;
    else list.unshift({ ...goal, id: goal.id || Date.now().toString() });
    localStorage.setItem(`goals_${profileId}`, JSON.stringify(list));
  },
  deleteGoal(profileId, goalId) {
    const list = this.getGoals(profileId).filter(g => g.id !== goalId);
    localStorage.setItem(`goals_${profileId}`, JSON.stringify(list));
  },

  // Energy Log
  getEnergyLog(profileId) {
    const data = localStorage.getItem(`energy_${profileId}`);
    return data ? JSON.parse(data) : [];
  },
  saveEnergyEntry(profileId, entry) {
    const log = this.getEnergyLog(profileId);
    const today = new Date().toDateString();
    const idx = log.findIndex(e => new Date(e.date).toDateString() === today);
    const newEntry = { ...entry, id: Date.now().toString() };
    if (idx >= 0) log[idx] = newEntry;
    else log.unshift(newEntry);
    localStorage.setItem(`energy_${profileId}`, JSON.stringify(log));
  },

  // Checkins
  getCheckins(profileId) {
    const data = localStorage.getItem(`checkins_${profileId}`);
    return data ? JSON.parse(data) : [];
  },
  saveCheckin(profileId, checkin) {
    const list = this.getCheckins(profileId);
    const today = new Date().toDateString();
    const idx = list.findIndex(c => new Date(c.date).toDateString() === today);
    if (idx >= 0) list[idx] = { ...checkin, date: new Date().toISOString() };
    else list.unshift({ ...checkin, id: Date.now().toString(), date: new Date().toISOString() });
    localStorage.setItem(`checkins_${profileId}`, JSON.stringify(list));
  },

  // Export / Import
  exportAllData() {
    const allData = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      allData[key] = localStorage.getItem(key);
    }
    return JSON.stringify(allData, null, 2);
  },
  importAllData(json) {
    try {
      const data = JSON.parse(json);
      Object.keys(data).forEach(key => {
        localStorage.setItem(key, data[key]);
      });
      return true;
    } catch(e) {
      return false;
    }
  },
  clearProfileData(profileId) {
    const keys = ['analyses', 'workouts', 'nutrition', 'goals', 'energy', 'checkins'];
    keys.forEach(k => localStorage.removeItem(`${k}_${profileId}`));
  }
};
