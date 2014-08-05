function User(name, team) {
  this.data = [0, 0, 0, 0];

  this.bullet = null;

  this.name = name;
  this.team = team;

  this.panel = [100, 200, 0];

  this.stat = [this.name, '', 0, 0];

  this.messageList = [];

  this.vote = null;

  this.userChanged = false;
  this.panelChanged = true;
  this.statChanged = false;
  this.chatChanged = false;
  this.voteChanged = false;

  this.removeGameModel = false;

  this._keys = null;

  this._layer = 2;

  this._acceleration = 0;
  this._maxForward = 20;
  this._maxBack = 10;
  this._step = 0.5;

  this._maxGunAngle = 90;
  this._gunAngleStep = this._maxGunAngle / 3;
}

// преобразует данные из base36
User.prototype.parseKeys = function () {
  var cmd = parseInt(this.keys, 36).toString(2);
};

// назначает данные
User.prototype.setData = function (data) {
  this.data[0] = data[0];
  this.data[1] = data[1];
  this.data[2] = data[2];
  this.data[3] = 0;
};

// обновляет данные
User.prototype.updateData = function () {
  var rad = +(this.data[2] * (Math.PI / 180)).toFixed(10);
  var vX = Math.round(Math.cos(rad) * this._acceleration);
  var vY = Math.round(Math.sin(rad) * this._acceleration);
  var radBullet;

  if (this._keys === null) {
    if (this._acceleration > 0) {
      this._acceleration -= this._step;
    } else if (this._acceleration < 0) {
      this._acceleration += this._step;
    }

  } else {
    var keys = this._keys.split('');

    // forward
    if (keys[0] === '1') {
      if (this._acceleration < this._maxForward) {
        this._acceleration += this._step * 4;
      }
    } else

    // back
    if (keys[1] === '1') {
      if (this._acceleration > -this._maxBack) {
        this._acceleration -= this._step * 2;
      }
    } else {
      if (this._acceleration > 0) {
        this._acceleration -= this._step;
      } else if (this._acceleration < 0) {
        this._acceleration += this._step;
      }
    }

    // left
    if (keys[2] === '1') {
      this.data[2] = this.data[2] - 4;
      if (this.data[2] < 0) {
        this.data[2] = 356;
      }
    }

    // right
    if (keys[3] === '1') {
      this.data[2] = this.data[2] + 4;
      if (this.data[2] > 360) {
        this.data[2] = 4;
      }
    }

    // gCenter
    if (keys[4] === '1') {
      this.data[3] = 0;
    }

    // gLeft
    if (keys[5] === '1') {
      if (this.data[3] > -this._maxGunAngle) {
        this.data[3] = this.data[3] - this._gunAngleStep;
      }
    }

    // gRight
    if (keys[6] === '1') {
      if (this.data[3] < this._maxGunAngle) {
        this.data[3] = this.data[3] + this._gunAngleStep;
      }
    }

    // fire
    if (keys[7] === '1') {
      radBullet = +((this.data[3] + this.data[2]) * (Math.PI / 180)).toFixed(2);

      this.bullet = [
        Math.round(Math.cos(radBullet) * 20) + this.data[0],
        Math.round(Math.sin(radBullet) * 20) + this.data[1],
        Math.round(Math.cos(radBullet) * 20) + vX,
        Math.round(Math.sin(radBullet) * 20) + vY,
        this._layer,
        2
      ];
    }

    //TODO: для spectators
    // // next player
    // if (keys[8] === '1') {
    // }
    //
    // // prev player
    // if (keys[9] === '1') {
    // }
  }

  this.data[0] = vX + this.data[0];
  this.data[1] = vY + this.data[1];

  this._keys = null;
};

// обновляет клавиши
User.prototype.updateKeys = function (keys) {
  this._keys = keys;
};

// добавляет сообщение
User.prototype.addMessage = function (text) {
  this.messageList.push([text]);
  this.chatChanged = true;
};

// добавляет данные для голосования
User.prototype.addVoteData = function (data) {
  this.vote = [null, data];
  this.voteChanged = true;
};

// меняет команду
User.prototype.changeTeam = function (team) {
  this.team = team;
};

module.exports = User;
