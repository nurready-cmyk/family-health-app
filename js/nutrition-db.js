// ===== NUTRITION DATABASE (~50 products) =====
// Each product: { name, group, per100g: { calories, protein, fat, carbs }, vitamins: { key: amount } }
// Vitamins/minerals as % of daily value per 100g (approximate)

const NutritionDB = [
  // GRAINS
  { name: 'Гречка варёная', group: 'Крупы', per100g: { calories: 132, protein: 4.5, fat: 1.1, carbs: 25 },
    vitamins: { B1: 6, B2: 5, B6: 8, iron: 12, magnesium: 18, zinc: 7 } },
  { name: 'Овсянка варёная', group: 'Крупы', per100g: { calories: 88, protein: 3.2, fat: 1.7, carbs: 15 },
    vitamins: { B1: 10, B5: 5, iron: 8, magnesium: 10, zinc: 8 } },
  { name: 'Рис бурый варёный', group: 'Крупы', per100g: { calories: 112, protein: 2.6, fat: 0.9, carbs: 23 },
    vitamins: { B1: 7, B3: 10, magnesium: 11, phosphorus: 8 } },
  { name: 'Рис белый варёный', group: 'Крупы', per100g: { calories: 130, protein: 2.7, fat: 0.3, carbs: 28 },
    vitamins: { B1: 3, B3: 5 } },
  { name: 'Перловка варёная', group: 'Крупы', per100g: { calories: 123, protein: 2.3, fat: 0.4, carbs: 28 },
    vitamins: { B1: 8, B3: 7, phosphorus: 10, selenium: 12 } },

  // MEAT
  { name: 'Говядина тушёная', group: 'Мясо', per100g: { calories: 214, protein: 28, fat: 11, carbs: 0 },
    vitamins: { B12: 68, B6: 22, zinc: 38, iron: 22, selenium: 25 } },
  { name: 'Куриная грудка варёная', group: 'Мясо', per100g: { calories: 165, protein: 31, fat: 3.6, carbs: 0 },
    vitamins: { B3: 60, B6: 50, B12: 6, phosphorus: 22 } },
  { name: 'Индейка запечённая', group: 'Мясо', per100g: { calories: 189, protein: 29, fat: 8, carbs: 0 },
    vitamins: { B3: 55, B6: 40, B12: 8, selenium: 30, zinc: 18 } },
  { name: 'Печень говяжья', group: 'Мясо', per100g: { calories: 175, protein: 25, fat: 7, carbs: 4 },
    vitamins: { B12: 988, B2: 180, B9: 55, iron: 55, copper: 600, vitaminA: 250 } },
  { name: 'Свинина нежирная', group: 'Мясо', per100g: { calories: 242, protein: 27, fat: 14, carbs: 0 },
    vitamins: { B1: 55, B6: 25, B12: 8, zinc: 22 } },

  // FISH & SEAFOOD
  { name: 'Лосось запечённый', group: 'Рыба', per100g: { calories: 208, protein: 25, fat: 12, carbs: 0 },
    vitamins: { vitaminD: 88, B12: 80, B3: 50, omega3: 100, selenium: 55 } },
  { name: 'Скумбрия запечённая', group: 'Рыба', per100g: { calories: 262, protein: 24, fat: 18, carbs: 0 },
    vitamins: { vitaminD: 75, B12: 90, omega3: 85, selenium: 40 } },
  { name: 'Тунец консервированный', group: 'Рыба', per100g: { calories: 128, protein: 26, fat: 1, carbs: 0 },
    vitamins: { B12: 60, B3: 55, selenium: 80, omega3: 20 } },
  { name: 'Сардины консервированные', group: 'Рыба', per100g: { calories: 208, protein: 25, fat: 11, carbs: 0 },
    vitamins: { vitaminD: 45, B12: 50, calcium: 35, omega3: 60 } },
  { name: 'Треска варёная', group: 'Рыба', per100g: { calories: 105, protein: 23, fat: 0.9, carbs: 0 },
    vitamins: { B12: 20, B6: 30, selenium: 30, phosphorus: 22 } },
  { name: 'Мидии варёные', group: 'Рыба', per100g: { calories: 172, protein: 24, fat: 4.5, carbs: 7 },
    vitamins: { B12: 400, iron: 60, selenium: 50, zinc: 30 } },

  // DAIRY & EGGS
  { name: 'Яйцо куриное', group: 'Яйца/Молочка', per100g: { calories: 155, protein: 13, fat: 11, carbs: 1.1 },
    vitamins: { vitaminD: 15, B2: 20, B12: 20, vitaminA: 12, selenium: 25 } },
  { name: 'Творог 5%', group: 'Яйца/Молочка', per100g: { calories: 121, protein: 16, fat: 5, carbs: 2.7 },
    vitamins: { B12: 15, calcium: 14, phosphorus: 20 } },
  { name: 'Кефир 2%', group: 'Яйца/Молочка', per100g: { calories: 53, protein: 3.4, fat: 2, carbs: 4.7 },
    vitamins: { B12: 8, calcium: 12, B2: 10 } },
  { name: 'Молоко 2.5%', group: 'Яйца/Молочка', per100g: { calories: 52, protein: 2.9, fat: 2.5, carbs: 4.7 },
    vitamins: { vitaminD: 5, calcium: 12, B2: 10, B12: 8 } },
  { name: 'Сыр твёрдый', group: 'Яйца/Молочка', per100g: { calories: 402, protein: 25, fat: 33, carbs: 1.3 },
    vitamins: { calcium: 72, B12: 14, vitaminA: 18, phosphorus: 50 } },
  { name: 'Греческий йогурт', group: 'Яйца/Молочка', per100g: { calories: 97, protein: 9, fat: 5, carbs: 3.6 },
    vitamins: { calcium: 11, B12: 12, B2: 12 } },

  // VEGETABLES
  { name: 'Шпинат свежий', group: 'Овощи', per100g: { calories: 23, protein: 2.9, fat: 0.4, carbs: 3.6 },
    vitamins: { vitaminK: 460, vitaminA: 105, B9: 49, iron: 15, magnesium: 20 } },
  { name: 'Брокколи варёная', group: 'Овощи', per100g: { calories: 35, protein: 2.4, fat: 0.4, carbs: 7 },
    vitamins: { vitaminC: 110, vitaminK: 115, B9: 15, calcium: 5 } },
  { name: 'Морковь свежая', group: 'Овощи', per100g: { calories: 41, protein: 0.9, fat: 0.2, carbs: 10 },
    vitamins: { vitaminA: 200, vitaminK: 13, B6: 8 } },
  { name: 'Свёкла варёная', group: 'Овощи', per100g: { calories: 44, protein: 1.7, fat: 0.2, carbs: 10 },
    vitamins: { B9: 20, manganese: 25, copper: 7, iron: 5 } },
  { name: 'Помидор свежий', group: 'Овощи', per100g: { calories: 18, protein: 0.9, fat: 0.2, carbs: 3.9 },
    vitamins: { vitaminC: 28, vitaminK: 10, vitaminA: 13 } },
  { name: 'Перец болгарский красный', group: 'Овощи', per100g: { calories: 31, protein: 1, fat: 0.3, carbs: 6 },
    vitamins: { vitaminC: 213, vitaminA: 93, B6: 18 } },
  { name: 'Чеснок', group: 'Овощи', per100g: { calories: 149, protein: 6.4, fat: 0.5, carbs: 33 },
    vitamins: { B6: 95, vitaminC: 31, selenium: 8, manganese: 80 } },
  { name: 'Авокадо', group: 'Овощи', per100g: { calories: 160, protein: 2, fat: 15, carbs: 9 },
    vitamins: { B5: 28, B6: 18, B9: 20, vitaminK: 26, potassium: 15 } },

  // FRUITS
  { name: 'Яблоко', group: 'Фрукты', per100g: { calories: 52, protein: 0.3, fat: 0.2, carbs: 14 },
    vitamins: { vitaminC: 8, B9: 1, potassium: 4 } },
  { name: 'Банан', group: 'Фрукты', per100g: { calories: 89, protein: 1.1, fat: 0.3, carbs: 23 },
    vitamins: { B6: 20, vitaminC: 15, potassium: 10, magnesium: 8 } },
  { name: 'Апельсин', group: 'Фрукты', per100g: { calories: 47, protein: 0.9, fat: 0.1, carbs: 12 },
    vitamins: { vitaminC: 88, B9: 10, potassium: 5 } },
  { name: 'Черника свежая', group: 'Фрукты', per100g: { calories: 57, protein: 0.7, fat: 0.3, carbs: 14 },
    vitamins: { vitaminC: 16, vitaminK: 24, manganese: 17 } },
  { name: 'Гранат', group: 'Фрукты', per100g: { calories: 83, protein: 1.7, fat: 1.2, carbs: 19 },
    vitamins: { vitaminC: 17, B9: 16, vitaminK: 16, potassium: 6 } },

  // LEGUMES
  { name: 'Чечевица варёная', group: 'Бобовые', per100g: { calories: 116, protein: 9, fat: 0.4, carbs: 20 },
    vitamins: { B9: 45, iron: 18, B1: 18, zinc: 12, manganese: 25 } },
  { name: 'Фасоль варёная', group: 'Бобовые', per100g: { calories: 127, protein: 8.7, fat: 0.5, carbs: 23 },
    vitamins: { B9: 33, B1: 14, iron: 16, zinc: 8, manganese: 20 } },
  { name: 'Нут варёный', group: 'Бобовые', per100g: { calories: 164, protein: 8.9, fat: 2.6, carbs: 27 },
    vitamins: { B9: 17, iron: 13, B6: 10, manganese: 42 } },

  // NUTS & SEEDS
  { name: 'Грецкий орех', group: 'Орехи/Семена', per100g: { calories: 654, protein: 15, fat: 65, carbs: 14 },
    vitamins: { omega3: 55, B6: 27, magnesium: 40, copper: 50 } },
  { name: 'Миндаль', group: 'Орехи/Семена', per100g: { calories: 579, protein: 21, fat: 50, carbs: 22 },
    vitamins: { vitaminE: 168, magnesium: 64, calcium: 26, iron: 20 } },
  { name: 'Тыквенные семечки', group: 'Орехи/Семена', per100g: { calories: 559, protein: 30, fat: 49, carbs: 11 },
    vitamins: { zinc: 70, magnesium: 92, iron: 50, copper: 55 } },
  { name: 'Кунжут', group: 'Орехи/Семена', per100g: { calories: 573, protein: 17, fat: 50, carbs: 23 },
    vitamins: { calcium: 97, iron: 52, magnesium: 90, zinc: 43 } },
  { name: 'Льняное семя', group: 'Орехи/Семена', per100g: { calories: 534, protein: 18, fat: 42, carbs: 29 },
    vitamins: { omega3: 90, B1: 115, magnesium: 90, selenium: 10 } },
  { name: 'Бразильский орех', group: 'Орехи/Семена', per100g: { calories: 659, protein: 14, fat: 67, carbs: 12 },
    vitamins: { selenium: 2739, magnesium: 94, vitaminE: 38 } },

  // OILS & OTHER
  { name: 'Оливковое масло', group: 'Масла', per100g: { calories: 884, protein: 0, fat: 100, carbs: 0 },
    vitamins: { vitaminE: 72, vitaminK: 75 } },
  { name: 'Куркума (специя)', group: 'Специи', per100g: { calories: 354, protein: 7.8, fat: 9.9, carbs: 65 },
    vitamins: { iron: 55, manganese: 345, vitaminC: 26 } },
  { name: 'Имбирь свежий', group: 'Специи', per100g: { calories: 80, protein: 1.8, fat: 0.8, carbs: 18 },
    vitamins: { B6: 10, magnesium: 10, potassium: 7 } },
  { name: 'Тёмный шоколад 85%', group: 'Прочее', per100g: { calories: 598, protein: 8, fat: 43, carbs: 46 },
    vitamins: { iron: 55, magnesium: 58, copper: 89, manganese: 188 } },
  { name: 'Зелёный чай', group: 'Напитки', per100g: { calories: 1, protein: 0, fat: 0, carbs: 0.2 },
    vitamins: { vitaminC: 5 } }
];

// Daily reference values used for % calculations
const DailyValues = {
  vitaminA: 900, vitaminC: 90, vitaminD: 20, vitaminE: 15, vitaminK: 120,
  B1: 1.2, B2: 1.3, B3: 16, B5: 5, B6: 1.7, B9: 400, B12: 2.4,
  calcium: 1000, iron: 18, magnesium: 420, zinc: 11, selenium: 55,
  phosphorus: 700, potassium: 3500, copper: 900, manganese: 2.3,
  omega3: 2500
};

// Vitamin display names
const VitaminNames = {
  vitaminA: 'Витамин A', vitaminC: 'Витамин C', vitaminD: 'Витамин D',
  vitaminE: 'Витамин E', vitaminK: 'Витамин K', B1: 'B1 (Тиамин)',
  B2: 'B2 (Рибофлавин)', B3: 'B3 (Ниацин)', B5: 'B5 (Пантотен.)',
  B6: 'B6 (Пиридоксин)', B9: 'B9 (Фолиевая)', B12: 'B12 (Кобаламин)',
  calcium: 'Кальций', iron: 'Железо', magnesium: 'Магний',
  zinc: 'Цинк', selenium: 'Селен', phosphorus: 'Фосфор',
  potassium: 'Калий', copper: 'Медь', manganese: 'Марганец', omega3: 'Омега-3'
};

/**
 * Search products by name
 */
function searchFood(query) {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return NutritionDB.filter(f => f.name.toLowerCase().includes(q));
}

/**
 * Calculate nutrients for a list of entries: [{foodName, grams}]
 */
function calculateDayNutrients(entries) {
  const totals = { calories: 0, protein: 0, fat: 0, carbs: 0 };
  const vitamins = {};

  entries.forEach(entry => {
    const food = NutritionDB.find(f => f.name === entry.foodName);
    if (!food) return;
    const ratio = (entry.grams || 100) / 100;
    totals.calories += food.per100g.calories * ratio;
    totals.protein += food.per100g.protein * ratio;
    totals.fat += food.per100g.fat * ratio;
    totals.carbs += food.per100g.carbs * ratio;
    Object.entries(food.vitamins).forEach(([k, v]) => {
      vitamins[k] = (vitamins[k] || 0) + v * ratio;
    });
  });

  return { totals, vitamins };
}
