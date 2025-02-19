import Publisher from '../../../server/lib/publisher.js';

// Singleton ChatView

let chatView;

export default class ChatView {
  constructor(model, data) {
    if (chatView) {
      return chatView;
    }

    chatView = this;

    this._window = data.window;
    this._document = this._window.document;

    this._chat = data.chat;
    this._cmd = data.cmd;

    this.publisher = new Publisher();

    this._mPublic = model.publisher;

    this._mPublic.on('open', 'openCmd', this);
    this._mPublic.on('close', 'closeCmd', this);
    this._mPublic.on('newLine', 'createLine', this);
    this._mPublic.on('oldLine', 'removeLine', this);
    this._mPublic.on('newTimer', 'createTimer', this);
    this._mPublic.on('oldTimer', 'removeTimer', this);
  }

  // открывает командную строку
  openCmd() {
    this._cmd.value = '';
    this._cmd.style.display = 'block';
    this._cmd.focus();
  }

  // закрывает командную строку
  closeCmd(success) {
    if (success) {
      this.publisher.emit('message', this._cmd.value);
    }

    this._cmd.style.display = 'none';
    this._cmd.value = '';
  }

  // добавляет сообщение в чат-лист
  createLine(data) {
    const line = this._document.createElement('div');
    const id = data.id;
    const message = data.message;
    const text = message[0];
    const name = message[1] || 'System';
    const type = typeof message[2] === 'number' ? message[2] : '';

    line.id = `line_${id}`;
    line.className = `line${type}`;
    line.setAttribute('data-name', `${name}: `);
    line.innerHTML = text;

    this._chat.appendChild(line);
  }

  // удаляет сообщение в чат-листе
  removeLine(id) {
    const line = this._document.getElementById(`line_${id}`);

    line.style.opacity = 0;

    this._window.setTimeout(() => {
      this._chat.removeChild(line);
    }, 2000);
  }

  // устанавливает таймер
  createTimer(data) {
    const messageId = data.id;
    const time = data.time;
    const timerId = this._window.setTimeout(() => {
      this.publisher.emit('oldTimer');
    }, time);

    this.publisher.emit('newTimer', { messageId, timerId });
  }

  // снимает таймер
  removeTimer(timer) {
    this._window.clearTimeout(timer);
  }
}
