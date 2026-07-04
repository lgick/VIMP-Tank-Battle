# VIMP Tank Battle

Многопользовательская 2D онлайн реалтайм игра: командные танковые бои по раундам.

![game video](./.github/assets/video/game.gif?raw=true)

- **Сервер**: Node.js + Express + `ws`, авторитетная физика на Rapier 2D (~120 Гц), бинарные снапшоты 30 пакетов/сек.
- **Клиент**: PixiJS, snapshot-интерполяция, client-side prediction, процедурные текстуры, пространственный звук (Howler).
- **Игра**: две команды, hitscan-пули и бомбы, боты, голосования, чат, статистика.

## Быстрый старт

```bash
git clone https://github.com/lgick/VIMP-Tank-Battle.git
cd VIMP-Tank-Battle
npm install
npm run dev
```

Для разработки нужны локальные HTTPS-сертификаты (mkcert) — см. [docs/getting-started.md](docs/getting-started.md).

## Документация

Полная документация — в [docs/](docs/README.md):

- [Локальная настройка](docs/getting-started.md)
- [Архитектура](docs/architecture.md)
- [Игровой процесс](docs/gameplay.md)
- [Серверные модули](docs/server.md) · [Клиентские модули](docs/client.md)
- [Сетевой протокол (WebSocket)](docs/network.md)
- [Конфигурация](docs/configuration.md)
- [Расширение игры (карты, оружие, звуки)](docs/extending.md)
- [Развертывание серверов](docs/deployment.md)

## Интерфейс

![interface](./.github/assets/images/face.png?raw=true)

## ❤️ Supporting the Project

If you find this project useful and want to support its development, starring the project on GitHub
is a great way to show your appreciation!

Donations are also welcome via Bitcoin. Every contribution helps sustain the project and is greatly
appreciated.

| Currency | Address                                      | QR Code                                                                                                                                            |
| :------- | :------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BTC**  | `bc1q0fnakv2jean57p3rjqzhq826jklygpj6gc7evu` | <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=bc1q0fnakv2jean57p3rjqzhq826jklygpj6gc7evu" alt="BTC QR Code" width="120"> |
