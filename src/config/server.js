import VIMP from '../server/modules/VIMP.js';

export default {
  name: 'VIMP Tank Battle',
  protocol: 'https:',
  domain: 'localhost',
  port: 3000,

  // для локальной разработки сертификаты mkcert:
  // brew install mkcert
  // brew install nss
  // mkcert -install
  // mkdir .certs && cd .certs
  // mkcert -key-file key.pem -cert-file cert.pem localhost 127.0.0.1 ::1
  //
  // для продакшена сертификаты от Let's Encrypt
  httpsOptions: {
    key: './.certs/key.pem', // ключ
    cert: './.certs/cert.pem', // сертификат
  },

  oneConnection: true,
  maxPlayers: 10,
  VIMP,
};
