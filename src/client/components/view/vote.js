import Publisher from '../../../server/lib/publisher.js';

// Singleton VoteView

let voteView;

export default class VoteView {
  constructor(model, data) {
    if (voteView) {
      return voteView;
    }

    voteView = this;

    this._window = data.window;
    this._document = this._window.document;

    this._voteID = data.elems.voteID || 'vote';
    this._titleClass = data.elems.titleClass || 'vote-title';
    this._listClass = data.elems.listClass || 'vote-list';
    this._navClass = data.elems.navClass || 'vote-nav';
    this._navActiveClass = data.elems.navActiveClass || 'active';

    this.publisher = new Publisher();

    this._mPublic = model.publisher;

    this._mPublic.on('vote', 'createVote', this);
    this._mPublic.on('clear', 'removeVote', this);
  }

  // создает окно голосования
  createVote(data) {
    const { title, list, back, more, time } = data;
    const vote = this._document.createElement('div');
    const p = this._document.createElement('p');
    const ol = this._document.createElement('ol');
    const navContainer = this._document.createElement('div');
    const backElem = this._document.createElement('p');
    const moreElem = this._document.createElement('p');
    const exitElem = this._document.createElement('p');
    let timerID = null;

    vote.setAttribute('id', this._voteID);

    if (data.centerPosition === true) {
      vote.setAttribute('class', 'center');
    }

    p.setAttribute('class', this._titleClass);
    p.innerHTML = title;

    ol.setAttribute('class', this._listClass);

    list.forEach(item => {
      const li = this._document.createElement('li');
      li.innerHTML = item;
      ol.appendChild(li);
    });

    vote.appendChild(p);
    vote.appendChild(ol);

    navContainer.setAttribute('class', this._navClass);

    if (back) {
      backElem.setAttribute('class', this._navActiveClass);
    }

    if (more) {
      moreElem.setAttribute('class', this._navActiveClass);
    }

    exitElem.setAttribute('class', this._navActiveClass);

    backElem.innerHTML = '8. Back';
    moreElem.innerHTML = '9. More';
    exitElem.innerHTML = '0. Exit';

    navContainer.appendChild(backElem);
    navContainer.appendChild(moreElem);
    navContainer.appendChild(exitElem);

    vote.appendChild(navContainer);

    this._document.body.appendChild(vote);

    if (time !== null) {
      timerID = this._window.setTimeout(() => {
        vote.parentElement.removeChild(vote);
        this.publisher.emit('timer', null);
        this.publisher.emit('clear');
      }, time);
    }

    this.publisher.emit('timer', timerID);
  }

  // удаляет окно голосования
  removeVote(timerID) {
    const vote = this._document.getElementById(this._voteID);

    if (timerID) {
      this._window.clearTimeout(timerID);
    }

    if (vote) {
      vote.parentElement.removeChild(vote);
    }
  }
}
