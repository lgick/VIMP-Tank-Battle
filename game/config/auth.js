// regExp строкой
module.exports = {
  elems: {
    authId: 'auth',
    formId: 'auth-form',
    errorId: 'auth-error',
    enterId: 'auth-enter'
  },
  params: [
    {
      name: 'name',
      value: '',
      options: {
        regExp: '^[a-zA-Z]([\\w\\s#]{0,13})[\\w]{1}$',
        storage: 'userName'
      }
    },
    {
      name: 'team',
      value: 'team1',
      options: {
        regExp: 'team1|team2|spectators',
        storage: 'team'
      }
    },
    {
      name: 'model',
      value: 'm1',
      options: {
        regExp: 'm1|m2',
        storage: 'model'
      }
    }
  ]
};
