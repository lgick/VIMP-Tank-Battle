var Ship = require('./shipModel');
var userModel;

function UserModel(params) {
  if (userModel) {
    return userModel;
  }

  userModel = this;

  this._data = {};
  this.publisher = new Publisher();
}

// наделяет конструкторы дополнительными методами
UserModel._add = function (name, object) {
  var addons = UserModel.prototype._addons
    , i;

  for (i in addons) {
    if (addons.hasOwnProperty(i)) {
      object.prototype[i] = addons[i];
    }
  }

  UserModel[name] = object;
};

// общие методы, которые наследуют конструкторы
UserModel.prototype._addons = {
  getModel: function () {
    console.log(this.model);
  },
  getColorA: function () {
    console.log(this.colorA);
  },
  getName: function () {
    console.log(this.name);
  }
};

// добавляет пользователя
UserModel.prototype.add = function (data) {
  var name = data.name
    , model = data.model;

  this._data[name] = UserModel[model](data);
};

// обновляет пользователя
UserModel.prototype.update = function (data) {
  var name = data.name
    , model = data.model;

  UserModel[model].update(this._data[name], data);
};

// удаляет пользователя
UserModel.prototype.remove = function (name) {
  delete this._data[name];
};

// удаляет всех пользователей
UserModel.prototype.clear = function () {
  this._data = {};
};

// конструкторы
UserModel._add('Ship', Ship);

exports.UserModel = UserModel;
