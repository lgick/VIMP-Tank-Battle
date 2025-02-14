import nodemailer from 'nodemailer';
import config from './config.js';

let sender = config.get('server:invite:sender');
let subject = config.get('server:invite:subject');
let html = config.get('server:invite:html');
let transport = config.get('server:invite:transport');

// заменяет в строке шаблонные данные
function replaceTpl(str) {
  return str.replace(/{\w+}/g, function (match, escape) {
    match = match.replace(/{|}/g, '');
    return config.get('server:' + match);
  });
}

sender = replaceTpl(sender);
subject = replaceTpl(subject);
html = replaceTpl(html);

export default {
  invite: (email, cb) => {
    const transporter = nodemailer.createTransport(transport);

    transporter.sendMail(
      {
        from: sender,
        to: email,
        subject: subject,
        html: html,
      },
      function (err, info) {
        cb(err, info);
      },
    );
  },
};
