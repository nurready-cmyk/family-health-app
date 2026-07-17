#!/bin/bash
# Двойной клик по этому файлу запускает Health OS бота через launchd, если он
# ещё не загружен. launchd сам следит за ботом и перезапускает его при
# падении — этот файл нужен только после полной перезагрузки Mac (launchd
# не подхватывает задание автоматически без прав в ~/Library/LaunchAgents).

PLIST="/Users/nurland/Documents/БИЗНЕС/Архив/HealthApp/health_os_bot/com.healthos.bot.plist"
UID_GUI="gui/$(id -u)"

if launchctl print "$UID_GUI/com.healthos.bot" > /dev/null 2>&1; then
  echo "Бот уже под управлением launchd — ничего делать не нужно."
else
  launchctl bootstrap "$UID_GUI" "$PLIST"
  sleep 2
  if launchctl print "$UID_GUI/com.healthos.bot" > /dev/null 2>&1; then
    echo "✅ Бот запущен и теперь сам перезапустится при падении."
  else
    echo "⚠️ Не удалось запустить — смотрите bot.log в папке health_os_bot."
  fi
fi

read -p "Нажмите Enter, чтобы закрыть окно..."
