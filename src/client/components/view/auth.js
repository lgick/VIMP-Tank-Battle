import Publisher from '../../../lib/publisher.js';

// Singleton AuthView

let authView;

export default class AuthView {
  constructor(model, data) {
    if (authView) {
      return authView;
    }

    authView = this;

    this._mPublic = model.publisher;

    this._window = data.window;
    this._localStorage = this._window.localStorage;

    this._auth = data.auth;
    this._form = data.form;
    this._error = data.error;
    this._enter = data.enter;

    this.publisher = new Publisher();

    // действие с инпутами
    this._form.onchange = e => {
      const tg = e.target;

      if (tg.tagName === 'INPUT') {
        this.publisher.emit('input', {
          name: tg.name,
          value: tg.value,
        });
      }
    };

    // форма заполнена
    this._enter.onclick = () => {
      authView.publisher.emit('enter');
    };

    this._mPublic.on('form', 'renderData', this);
    this._mPublic.on('error', 'renderError', this);
    this._mPublic.on('ok', 'hideAuth', this);
  }

  // показывает форму
  showAuth() {
    this._auth.style.display = 'block';
  }

  // скрывает форму
  hideAuth(data) {
    if (data) {
      data.forEach(item => {
        this._localStorage[item.name] = item.value;
      });
    }

    this._auth.style.display = 'none';
  }

  // обновляет форму
  renderData(data) {
    const { name, value } = data;
    const inputs = this._form.querySelectorAll('input');

    this._error.innerHTML = '';

    // делает активным нужный инпут
    inputs.forEach(input => {
      if (input.type === 'text' && input.name === name) {
        input.value = value;
      }

      if (input.type === 'radio' && input.name === name) {
        input.checked = input.value === value ? true : false;
      }
    });
  }

  // отображает ошибки
  renderError(data) {
    let message = '';

    data.forEach(item => {
      const name = item.name.toUpperCase();
      const err = item.error;

      if (err) {
        message += `${name}: ${err}<br>`;
      } else {
        message += `${name} is not correctly!<br>`;
      }
    });

    this._error.innerHTML = message;
  }
}
