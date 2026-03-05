# Data-Oriented архитектура с ECS-принципами

### Сейчас:

- `Tank` хранит `_engineLoad`.
- `Tank` хранит `body`.
- `Tank` возвращает `getData()`.

### Нужно:

- `TankSystem` изменяет `PhysicsBody`.
- `PhysicsSyncSystem` копирует данные в `WorldState`.
- `NetworkSerializer` читает `WorldState`.

> **Важно:** Данные должны храниться централизованно. `Tank` не должен быть источником истины.

---

## Правильная серверная архитектура

```text
Game
 ├─ WorldState (чистые данные)
 ├─ PhysicsWorld (planck)
 ├─ PlayerSystem
 ├─ WeaponSystem
 ├─ DamageSystem
 ├─ ContactSystem
 └─ NetworkSerializer
```

### WorldState — главный объект

```javascript
class WorldState {
  constructor(maxPlayers) {
    this.posX = new Float32Array(maxPlayers);
    this.posY = new Float32Array(maxPlayers);
    this.angle = new Float32Array(maxPlayers);
    this.gunAngle = new Float32Array(maxPlayers);
    this.velX = new Float32Array(maxPlayers);
    this.velY = new Float32Array(maxPlayers);
    this.engineLoad = new Float32Array(maxPlayers);
    this.health = new Uint8Array(maxPlayers);
    this.teamId = new Uint8Array(maxPlayers);
    this.active = new Uint8Array(maxPlayers);
  }
}
```

---

## Как теперь выглядит тик

```javascript
update(dt) {
  PlayerInputSystem
  PlayerMovementSystem
  WeaponSystem
  PhysicsWorld.step
  SyncPhysicsToStateSystem
  DamageSystem
}
```

### Как синхронизировать Planck с WorldState

После `physics step`:

```javascript
for each player {
  const body = physicsBody;
  worldState.posX[i] = body.getPosition().x;
  worldState.posY[i] = body.getPosition().y;
  worldState.angle[i] = body.getAngle();
  worldState.velX[i] = body.getLinearVelocity().x;
  worldState.velY[i] = body.getLinearVelocity().y;
}
```

_Теперь `NetworkSerializer` читает только `worldState`._

---

## Что делать с событиями

**Не:** `weaponManager.getEvents()`

**А:** `EventBuffer.push({type, id, data})` _(И потом сериализовать `EventBuffer`)_

---

## Как на сервере работать с данными:

- **Классы** = поведение.
- **TypedArrays** = состояние.
- **Системы** = изменяют состояние.
- **NetworkSerializer** = читает состояние.
