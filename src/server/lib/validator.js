import config from './config.js';

export default data => {
  const errors = [];
  const { params } = config.get('auth');

  for (const { name, options } of params) {
    if (!(name in data)) {
      return [{ name: 'Authorization', error: 'property error' }];
    }

    const value = data[name];

    if (typeof value !== 'string') {
      return [{ name: 'Authorization', error: 'type error' }];
    }

    if (options?.regExp) {
      const regExp = new RegExp(options.regExp);
      if (!regExp.test(value)) {
        errors.push({ name, error: 'not valid' });
      }
    }
  }

  return errors.length ? errors : undefined;
};
