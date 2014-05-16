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
      value: '0',
      options: {
        regExp: '0|1|2',
        storage: null
      }
    }
  ]
};
