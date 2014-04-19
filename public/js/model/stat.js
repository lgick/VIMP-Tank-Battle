define(['Publisher'], function (Publisher) {
  // Singleton StatModel
  var statModel;

  function StatModel(data) {
    if (statModel) {
      return statModel;
    }

    statModel = this;

    this._tables = data.tables;
    this._sortList = data.sortList;

    this.publisher = new Publisher();
  }

  // открывает статистику
  StatModel.prototype.open = function () {
    this.publisher.emit('open');

    this.publisher.emit('mode', {
      name: 'stat',
      status: 'opened'
    });
  };

  // закрывает статистику
  StatModel.prototype.close = function () {
    this.publisher.emit('close');

    this.publisher.emit('mode', {
      name: 'stat',
      status: 'closed'
    });
  };

  // обновляет данные статистики
  StatModel.prototype.update = function (data) {
    var tBodiesData = data[0]
      , tHeadData = data[1]
      , tableID
      , i
      , len;

    // если есть данные для <tbody>
    if (tBodiesData) {
      for (i = 0, len = tBodiesData.length; i < len; i += 1) {
        tableID = this._tables[tBodiesData[i][1]];

        this.publisher.emit('tBody', {
          id: tBodiesData[i][0],
          tableID: tableID,
          cellsData: tBodiesData[i][2],
          sortData: this._sortList[tableID],
          bodyNumber: tBodiesData[i][3] || 0
        });
      }
    }

    // если есть данные для <thead>
    if (tHeadData) {
      for (i = 0, len = tHeadData.length; i < len; i += 1) {
        tableID = this._tables[tHeadData[i][0]];

        this.publisher.emit('tHead', {
          tableID: tableID,
          cellsData: tHeadData[i][1],
          rowNumber: tHeadData[i][2] || 0
        });
      }
    }
  };

  return StatModel;
});
