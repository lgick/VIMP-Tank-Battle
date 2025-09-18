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
        validator: 'isValidName',
        storage: 'userName',
      },
    },
    {
      name: 'model',
      value: 'm1',
      options: {
        validator: 'isValidModel',
        storage: 'model',
      },
    },
  ],
};
