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

    this.publisher = new Publisher();

    this._mPublic = model.publisher;

    this._mPublic.on('vote', 'createVote', this);
    this._mPublic.on('clear', 'removeVote', this);
  }

  // создает окно голосования
  VoteView.prototype.createVote = function (data) {
    var vote = this._document.createElement('div')
      , p = this._document.createElement('p')
      , ol = this._document.createElement('ol')
      , li
      , title = data.title
      , list = data.list
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
