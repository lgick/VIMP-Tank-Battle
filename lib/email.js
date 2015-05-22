var nodemailer = require('nodemailer');
var config = require('./config');

var sender = config.get('server:invite:sender');
var subject = config.get('server:invite:subject');
var html = config.get('server:invite:html');
var transport = config.get('server:invite:transport');

var transporter = nodemailer.createTransport(transport);

// заменяет в строке шаблонные данные
function replaceTpl(str) {
  return str.replace(/{\w+}/g, function(match, escape) {
    match = match.replace(/{|}/g, '');
    return config.get('server:' + match);
  });
}

sender = replaceTpl(sender);
subject = replaceTpl(subject);
html = replaceTpl(html);

exports.invite = function (email, cb) {
  transporter.sendMail({
    from: sender,
    to: email,
    subject: subject,
    html: html
  }, function (err, info) {
    cb(err, info);
  });
};
