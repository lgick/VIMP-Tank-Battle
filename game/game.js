var config = require('../config');

var timeUpdate = config.get('basic:timeUpdate');
var maxPlayers = config.get('game:maxPlayers');

var users = {};

exports.start = function () {
  setInterval(function () {
    var data;
    var id;

    for (id in users) {
      if (users.hasOwnProperty(id)) {
        users[id].emit('shot', data);
      }
    }
  }, timeUpdate);
};

exports.add = function (id, socket) {
  users[id] = socket;
};
