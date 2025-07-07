import Publisher from '../../../lib/Publisher.js';

// Singleton VoteView

let voteView;

export default class VoteView {
  constructor(model, data) {
    if (voteView) {
      return voteView;
    }

    voteView = this;

    this._voteId = data.elems.voteId || 'vote';
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
    const vote = document.createElement('div');
    const p = document.createElement('p');
    const ol = document.createElement('ol');
    const navContainer = document.createElement('div');
    const backElem = document.createElement('p');
    const moreElem = document.createElement('p');
    const exitElem = document.createElement('p');
    let timerId = null;

    vote.setAttribute('id', this._voteId);

    p.setAttribute('class', this._titleClass);
    p.innerHTML = title;

    ol.setAttribute('class', this._listClass);

    list.forEach(item => {
      const li = document.createElement('li');
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

    document.body.appendChild(vote);

    if (time !== null) {
      timerId = setTimeout(() => {
        vote.parentElement.removeChild(vote);
        this.publisher.emit('timer', null);
        this.publisher.emit('clear');
      }, time);
    }

    this.publisher.emit('timer', timerId);
  }

  // удаляет окно голосования
  removeVote(timerId) {
    const vote = document.getElementById(this._voteId);

    if (timerId) {
      clearTimeout(timerId);
    }

    if (vote) {
      vote.parentElement.removeChild(vote);
    }
  }
}
