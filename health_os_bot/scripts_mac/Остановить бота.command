#!/bin/bash
# Двойной клик полностью останавливает Health OS бота — снимает его с
# управления launchd, поэтому он не перезапустится сам собой. Чтобы включить
# обратно — двойной клик на «Запустить бота.command».

UID_GUI="gui/$(id -u)"

if launchctl print "$UID_GUI/com.healthos.bot" > /dev/null 2>&1; then
  launchctl bootout "$UID_GUI/com.healthos.bot"
  sleep 1
  echo "✅ Бот остановлен."
else
  echo "Бот и так не был запущен."
fi

read -p "Нажмите Enter, чтобы закрыть окно..."
