//var config = require('../config');

var timeUpdate = 1000 / 30;
var maxPlayers = 16;
var team = ['team1', 'team2', 'spectators'];

var users = {};

// tests
var testB = require('./testB');
var gameB = testB.gameB();
var panel = testB.panel();
var stat = testB.stat();
var chat = testB.chat();
var vote = testB.vote();

exports.init = function () {
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
  }, 10000);

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

exports.add = function (data, id, socket) {
  users[id] = socket;
};
