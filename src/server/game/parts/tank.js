import BaseUser from './baseUser.js';
import { BoxShape, Vec2 } from 'planck';

class Tank extends BaseUser {
  constructor(data) {
    super(data);

    this._modelData = data.modelData;

    this._maxGunAngle = this._modelData.maxGunAngle;
    this._gunAngleStep = this._modelData.gunAngleStep;

    this._bulletData = null;

    this._body = data.world.createBody({
      type: 'dynamic',
      position: new Vec2(
        this._modelData.position[0],
        this._modelData.position[1],
      ),
      angle: this._modelData.angle * (Math.PI / 180),
      angularDamping: 1,
      linearDamping: 0.8,
      allowSleep: false,
    });

    // поворот пушки
    this._body.gunRotation = this._modelData.gunRotation || 0;

    this._body.createFixture(
      new BoxShape(this._modelData.width / 2, this._modelData.height / 2),
      this._modelData.density,
    );
  }

  updateData() {
    if (this.currentKeys === null) {
      return;
    }

    if (this.currentKeys & this.keysData.forward) {
      let f = this._body.getWorldVector(new Vec2(200.0, 0.0));
      let p = this._body.getWorldPoint(new Vec2(-400.0, 0.0));
      this._body.applyLinearImpulse(f, p, true);
    }

    if (this.currentKeys & this.keysData.back) {
      let f = this._body.getWorldVector(new Vec2(-100.0, 0.0));
      let p = this._body.getWorldPoint(new Vec2(200.0, 0.0));
      this._body.applyLinearImpulse(f, p, true);
    }

    if (this.currentKeys & this.keysData.left) {
      this._body.setAngle(this._body.getAngle() - 0.03);
    }

    if (this.currentKeys & this.keysData.right) {
      this._body.setAngle(this._body.getAngle() + 0.03);
    }

    if (this.currentKeys & this.keysData.gCenter) {
      this._body.gunRotation = 0;
    }

    if (this.currentKeys & this.keysData.gLeft) {
      if (this._body.gunRotation > -this._maxGunAngle) {
        this._body.gunRotation -= this._gunAngleStep;
      }
    }

    if (this.currentKeys & this.keysData.gRight) {
      if (this._body.gunRotation < this._maxGunAngle) {
        this._body.gunRotation += this._gunAngleStep;
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
      } else {
        console.log(this.bulletConstructorName);
      }
    }

    if (this.currentKeys & this.keysData.nextBullet) {
      this.turnUserBullet();
    }

    if (this.currentKeys & this.keysData.prevBullet) {
      this.turnUserBullet(true);
    }

    this.currentKeys = null;
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
