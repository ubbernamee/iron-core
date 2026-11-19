# IRON CORE // Midnight Obsidian OS (Vite + TypeScript + IndexedDB)

## Локальный запуск и проверка
```bash
npm install
npm test      # Запуск unit-тестов парсера и математики
npm run dev   # Локальный сервер разработки
npm run build # Проверка типов TypeScript и сборка в /dist
```

## Автодеплой на GitHub Pages
1. Загрузи содержимое этой папки в свой GitHub-репозиторий.
2. В настройках репозитория открой **Settings → Pages → Build and deployment → Source** и выбери **GitHub Actions**.
3. При каждом `git push` в ветку `main` автоматически прогонятся тесты Vitest, соберётся production-бандл Vite + Workbox PWA и обновится сайт.
