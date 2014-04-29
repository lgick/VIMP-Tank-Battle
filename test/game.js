var config = require('../config');

var timeUpdate = config.get('basic:timeUpdate');
var maxPlayers = config.get('game:maxPlayers');

var users = {};

// tests
var testB = require('./testB');
var gameB = testB.gameB();
var panel = testB.panel();
var stat = testB.stat();
var chat = testB.chat();
var vote = testB.vote();

exports.start = function () {
  var g = null;
  var p = null;
  var s = null;
  var c = null;
  var v = null;

  setInterval(function () {
    p = panel();
    s = stat();
    c = chat();
    v = vote();
  }, 3000);

  setInterval(function () {
    var id;

    var g = gameB();

    for (id in users) {
      if (users.hasOwnProperty(id)) {
        users[id].emit('shot', [g[0], g[1], p, s, c, v]);
      }
    }

    p = s = c = v = null;
  }, timeUpdate);
};

exports.add = function (id, socket) {
  users[id] = socket;
};
