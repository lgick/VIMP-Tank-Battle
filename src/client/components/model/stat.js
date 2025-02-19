import Publisher from '../../../server/lib/publisher.js';

// Singleton StatModel

let statModel;

export default class StatModel {
  constructor(data) {
    if (statModel) {
      return statModel;
    }

    statModel = this;

    this._heads = data.heads;
    this._bodies = data.bodies;
    this._sortList = data.sortList;
    this.publisher = new Publisher();
  }

  // открывает статистику
  open() {
    this.publisher.emit('open');
    this.publisher.emit('mode', { name: 'stat', status: 'opened' });
  }

  // закрывает статистику
  close() {
    this.publisher.emit('close');
    this.publisher.emit('mode', { name: 'stat', status: 'closed' });
  }

  // обновляет данные статистики
  update(data) {
    const tBodiesData = data[0];
    const tHeadData = data[1];

    // если есть данные для <tbody>
    if (tBodiesData) {
      for (let i = 0, len = tBodiesData.length; i < len; i += 1) {
        tableID = this._bodies[tBodiesData[i][1]];

        if (tableID) {
          this.publisher.emit('tBody', {
            id: tBodiesData[i][0],
            tableID: tableID,
            cellsData: tBodiesData[i][2],
            sortData: this._sortList[tableID],
            bodyNumber: tBodiesData[i][3] || 0,
          });
        }
      }
    }

    // если есть данные для <thead>
    if (tHeadData) {
      for (let i = 0, len = tHeadData.length; i < len; i += 1) {
        tableID = this._heads[tHeadData[i][0]];

        if (tableID) {
          this.publisher.emit('tHead', {
            tableID: tableID,
            cellsData: tHeadData[i][1],
            rowNumber: tHeadData[i][2] || 0,
          });
        }
      }
    }
  }
}
