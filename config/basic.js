module.exports = {
  name: 'VIMP game framework config',
  port: 3000,
  multipleConnections: false,
  timeUpdate: 50,

  mongoose: {
    uri: 'mongodb://localhost/stat',
    options: {
      server: {
        socketOptions: {
          keepAlive: 1
        }
      }
    }
  },

  session: {
    secret: 'KillerIsJim',
    key: 'sid',
    cookie: {
      path: '/',
      httpOnly: true,
      maxAge: null
    }
  },

  map: {
    width: 2000,
    height: 2000
  }
};
