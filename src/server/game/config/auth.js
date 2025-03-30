// regExp строкой
export default {
  elems: {
    authId: 'auth',
    formId: 'auth-form',
    errorId: 'auth-error',
    enterId: 'auth-enter',
  },
  params: [
    {
      name: 'name',
      value: '',
      options: {
        regExp: '^[a-zA-Z]([\\w\\s#]{0,13})[\\w]{1}$',
        storage: 'userName',
      },
    },
    {
      name: 'model',
      value: 'm1',
      options: {
        regExp: 'm1',
        storage: 'model',
      },
    },
  ],
};
