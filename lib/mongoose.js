var mongoose = require('mongoose');
var config = require('../config');

var uri = config.get('basic:mongoose:uri');
var options = config.get('basic:mongoose:options');

mongoose.connect(uri, options);

module.exports = mongoose;
