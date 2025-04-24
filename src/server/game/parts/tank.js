import BaseModel from './baseModel.js';
import { BoxShape, Vec2 } from 'planck';

class Tank extends BaseModel {
  constructor(data) {
    super(data);

    this._modelData = data.modelData;

    this._speed = 0; // текущая пройденная скорость (м/с)
    this._maxSpeed = 1000; // максималка вперёд (м/с)
    this._maxReverse = -500; // максималка назад (м/с)
    this._accel = 50; // ускорение при газе (м/с²)
    this._brakeDecel = 500; // торможение при «тормозе» (м/с²)
    this._coastDecel = 500; // естественное замедление, когда нет ввода (м/с²)
    this._turnSpeed = 2.0; // угловая скорость (рад/с)

    this._maxGunAngle = 1.4; // максимальное значение угла пушки
    this._gunAngleStep = 0.05; // шаг поворота пушки
    this._lastGunRotationTime = 0; // время последнего обновления поворота
    this._gunRotationInterval = 10; // интервал в миллисекундах обновления поворота

    this._bulletData = null;

    this._body = data.world.createBody({
      type: 'dynamic',
      position: new Vec2(
        this._modelData.position[0],
        this._modelData.position[1],
      ),
      angle: this._modelData.angle * (Math.PI / 180),
      fixedRotation: true,
      angularDamping: 1.0,
      linearDamping: 0.1,
      allowSleep: false,
    });

    this._body.gunRotation = 0;

    this._body.createFixture(
      new BoxShape(this._modelData.width / 2, this._modelData.height / 2),
      {
        density: 3, // меньшая масса → быстрее разгон
        friction: 0,
        restitution: 0.0,
      },
    );

    this._centeringGun = false; // флаг плавной центровки пушки
    this._gunCenterSpeed = 5.0; // скорость «усадки» (больше — быстрее центрируется)
  }

  // линейная интерполяция между x и y, коэффициент a ∈ [0,1]
  lerp(x, y, a) {
    return x * (1 - a) + y * a;
  }

  updateData(dt) {
    const forward = Boolean(this.currentKeys & this.keysData.forward);
    const back = Boolean(this.currentKeys & this.keysData.back);
    const left = Boolean(this.currentKeys & this.keysData.left);
    const right = Boolean(this.currentKeys & this.keysData.right);

    // если движение вперед
    if (forward) {
      this._speed += this._accel * dt * 10;
      // иначе если движение назад
    } else if (back) {
      this._speed -= this._brakeDecel * dt * 100;
      // иначе плавное затухание при отсутствии команд движения
    } else {
      if (this._speed > 0) {
        this._speed = Math.max(0, this._speed - this._coastDecel * dt);
      } else if (this._speed < 0) {
        this._speed = Math.min(0, this._speed + this._coastDecel * dt);
      }
    }

    // ограничение скорости
    this._speed = Math.min(
      this._maxSpeed,
      Math.max(this._maxReverse, this._speed),
    );

    console.log(this._speed);

    // 2. Повороты корпуса
    // При движении назад разворот руля инвертируется
    const turnDir = this._speed < 0 ? -1 : 1;
    const angVel = this._turnSpeed * dt * turnDir;

    if (left) {
      this._body.setAngle(this._body.getAngle() - angVel);
    }

    if (right) {
      this._body.setAngle(this._body.getAngle() + angVel);
    }

    // 3. Обновляем линейную скорость тела по направлению корпуса
    const angle = this._body.getAngle();
    const vx = Math.cos(angle) * this._speed;
    const vy = Math.sin(angle) * this._speed;
    this._body.setLinearVelocity(new Vec2(vx, vy));

    if (this.currentKeys & this.keysData.gCenter) {
      this._centeringGun = true; // запуск плавной центровки
    }

    //  если центрируем, плавно подводим gunRotation к 0
    if (this._centeringGun) {
      // интерполируем текущий угол к нулю
      this._body.gunRotation = this.lerp(
        this._body.gunRotation,
        0,
        Math.min(1, this._gunCenterSpeed * dt),
      );

      // когда угол почти нулевой — счищаем остатки и флаг
      if (Math.abs(this._body.gunRotation) < 0.01) {
        this._body.gunRotation = 0;
        this._centeringGun = false; // останавливаем центровку
      }
    }

    if (this.currentKeys & this.keysData.gLeft) {
      const now = Date.now();

      if (
        now - this._lastGunRotationTime > this._gunRotationInterval &&
        this._body.gunRotation > -this._maxGunAngle
      ) {
        this._body.gunRotation -= this._gunAngleStep;
        this._lastGunRotationTime = now;
      }
    }

    if (this.currentKeys & this.keysData.gRight) {
      const now = Date.now();

      if (
        now - this._lastGunRotationTime > this._gunRotationInterval &&
        this._body.gunRotation < this._maxGunAngle
      ) {
        this._body.gunRotation += this._gunAngleStep;
        this._lastGunRotationTime = now;
      }
    }

    if (this.currentKeys & this.keysData.fire) {
      if (this.bulletConstructorName === 'bomb') {
        const extraOffset = 20;
        const localBombOffset = new Vec2(
          -this._modelData.width / 2 - extraOffset,
          0,
        );

        this._bulletData = {
          position: this._body.getWorldPoint(localBombOffset),
          angle: this._body.getAngle(),
        };
      } else if (this.bulletConstructorName === 'bullet') {
        // суммарный угол выстрела: угол корпуса + угол поворота пушки
        const totalAngle = this._body.getAngle() + this._body.gunRotation;
        // расстояние от центра танка до точки появления пули (настраивается)
        const bulletOffset = this._modelData.width / 2 + 10;
        // вычисляем мировые координаты точки появления пули
        const bulletX =
          this._body.getPosition().x + Math.cos(totalAngle) * bulletOffset;
        const bulletY =
          this._body.getPosition().y + Math.sin(totalAngle) * bulletOffset;
        // задаем скорость пули (примерная величина, можно корректировать)
        const bulletSpeed = 100;
        // вычисляем вектор скорости пули
        const bulletVelocity = new Vec2(
          Math.cos(totalAngle) * bulletSpeed,
          Math.sin(totalAngle) * bulletSpeed,
        );
        this._bulletData = {
          position: new Vec2(bulletX, bulletY),
          angle: totalAngle,
          velocity: bulletVelocity,
        };
      }
    }

    if (this.currentKeys & this.keysData.nextBullet) {
      this.turnUserBullet();
    }

    if (this.currentKeys & this.keysData.prevBullet) {
      this.turnUserBullet(true);
    }

    this.currentKeys = null;
    //const vel = this._body.getLinearVelocity();
    //console.log(`|v| = ${vel.length().toFixed(2)} m/s`);
  }

  getBody() {
    return this._body;
  }

  getData() {
    if (this.fullUserData === true) {
      this.fullUserData = false;

      return this.getFullData();
    }

    const pos = this._body.getPosition();
    const angleDeg = this._body.getAngle();

    return [pos.x, pos.y, angleDeg, this._body.gunRotation];
  }

  getFullData() {
    const pos = this._body.getPosition();
    const angleDeg = this._body.getAngle();

    return [
      pos.x,
      pos.y,
      angleDeg,
      this._body.gunRotation,
      this.teamID,
      this.name,
      this._modelData.width,
      this._modelData.height,
    ];
  }

  getBulletData() {
    const bulletData = this._bulletData;
    this._bulletData = null;

    return bulletData;
  }
}

export default Tank;
