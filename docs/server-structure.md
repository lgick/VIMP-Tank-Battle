# Server Directory Structure

Разделяем сервер на **Hot Path** (Бинарники, Физика, ECS - 60 раз в сек) и **Cold Path** (JSON,
Мета-логика - редко).

```text
server/
├── index.js                 # Главный файл запуска (express/ws)
├── config/                  # Конфиги (твои game.js, wsports.js, weapons.js)
│
├── src/
│   ├── core/                # Оркестрация
│   │   ├── VIMP.js          # Главный связующий фасад игры
│   │   ├── TimerManager.js  # Игровой цикл и таймауты
│   │   └── waiting.js       # Очереди на вход
│   │
│   ├── ecs/                 # 🔥 ЯДРО ИГРЫ (Hot Path)
│   │   ├── components.js    # Data-Oriented массивы (TransformX, Velocity...)
│   │   ├── RapierSetup.js   # Инициализация WASM физики
│   │   └── systems/         # Логика (MovementSystem.js, WeaponSystem.js)
│   │
│   ├── network/             # 🌐 СЕТЬ
│   │   ├── SocketManager.js # Обёртка над WS
│   │   ├── SnapshotPacker.js# Сборщик ArrayBuffer (Заменяет SnapshotManager)
│   │   ├── RTTManager.js    # Пинги (Пинг/Понг можно паковать в микро-бинарник)
│   │   └── OpCodes.js       # Замена wsports.js (константы типов пакетов)
│   │
│   ├── meta/                # 🧊 МЕТА-ИГРА (Cold/Warm Path)
│   │   ├── Chat.js          # -> Отправляет JSON
│   │   ├── Stat.js          # -> Отправляет JSON
│   │   ├── Vote.js          # -> Отправляет JSON
│   │   └── Panel.js         # -> Отправляет микро-ArrayBuffer (патроны, хп)
│   │
│   ├── player/              # ПОЛЬЗОВАТЕЛИ
│   │   └── UserManager.js   # Управление сессиями (gameId -> ws)
│   │
│   └── lib/                 # Утилиты
│       ├── BinaryGenId.js
│       ├── security.js
│       └── validators.js
```
