define(['Publisher'], function (Publisher) {
  // Singleton VoteView
  var voteView;

  function VoteView(model, data) {
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
  VoteView.prototype.createVote = function (data) {
    var title = data.title
      , list = data.list
      , back = data.back
      , more = data.more
      , vote = this._document.createElement('div')
      , p = this._document.createElement('p')
      , ol = this._document.createElement('ol')
      , li
      , navContainer = this._document.createElement('div')
      , backElem = this._document.createElement('p')
      , moreElem = this._document.createElement('p')
      , exitElem = this._document.createElement('p')
      , i = 0
      , len = list.length;

    vote.setAttribute('id', this._voteID);

    p.setAttribute('class', this._titleClass);
    p.innerHTML = title;

    ol.setAttribute('class', this._listClass);

    for (; i < len; i += 1) {
      li = this._document.createElement('li');
      li.innerHTML = list[i];
      ol.appendChild(li);
    }

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
  };

  // удаляет окно голосования
  VoteView.prototype.removeVote = function () {
    var vote = this._document.getElementById(this._voteID);

    if (vote) {
      vote.parentElement.removeChild(vote);
    }
  };

  return VoteView;
});
