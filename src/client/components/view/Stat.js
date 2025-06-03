import Publisher from '../../../lib/Publisher.js';

// Singleton StatView

let statView;

export default class StatView {
  constructor(model, data) {
    if (statView) {
      return statView;
    }

    statView = this;

    this._window = data.window;
    this._document = this._window.document;

    this._stat = data.stat;

    this.publisher = new Publisher();

    this._mPublic = model.publisher;

    this._mPublic.on('open', 'open', this);
    this._mPublic.on('close', 'close', this);
    this._mPublic.on('tHead', 'updateTableHead', this);
    this._mPublic.on('tBody', 'updateTableBody', this);
    this._mPublic.on('clearBodies', 'clearBodies', this);
  }

  // открывает статистику
  open() {
    this._stat.style.display = 'block';
  }

  // закрывает статистику
  close() {
    this._stat.style.display = 'none';
  }

  // очищает таблицы <tbody>
  clearBodies(bodiesList) {
    for (let i = 0, len = bodiesList.length; i < len; i += 1) {
      const table = this._document.getElementById(bodiesList[i]);
      const tBodies = table.tBodies;

      for (let i2 = 0, len2 = tBodies.length; i2 < len2; i2 += 1) {
        tBodies[i2].innerHTML = '';
      }
    }
  }

  // обновляет <thead>
  updateTableHead(data) {
    const table = this._document.getElementById(data.tableID);
    const cells = table.tHead.rows[data.rowNumber].cells;
    const cellsData = data.cellsData;

    for (let i = 0, len = cells.length; i < len; i += 1) {
      cells[i].innerHTML = cellsData[i];
    }
  }

  // обновляет <tbody>
  updateTableBody(data) {
    const table = this._document.getElementById(data.tableID);
    const tbody = table.tBodies[data.bodyNumber];
    let row = tbody.rows.namedItem(`stat_${data.id}`);
    const { cellsData, sortData } = data;

    // сортирует
    const sorting = rowIndex => {
      let row = tbody.rows[rowIndex];
      let prevRow = tbody.rows[rowIndex - 1];
      let nextRow = tbody.rows[rowIndex + 1];

      // если есть предыдущая строка
      if (prevRow) {
        for (let i = 0, len = sortData.length; i < len; i += 1) {
          const number = sortData[i][0];
          const type = sortData[i][1];
          const value = ~~row.cells[number].innerHTML;
          const prevValue = ~~prevRow.cells[number].innerHTML;

          // если type == true, значит сортировка по убыванию
          if (type) {
            // если предыдущее значение меньше текущего
            if (prevValue < value) {
              tbody.insertBefore(row, prevRow);
              sorting(rowIndex - 1);
              return;
            }

            if (prevValue > value) {
              break;
            }

            // иначе сортировка по возрастанию
          } else {
            // если предыдущее значение больше текущего
            if (prevValue > value) {
              tbody.insertBefore(row, prevRow);
              sorting(rowIndex - 1);
              return;
            }

            if (prevValue < value) {
              break;
            }
          }
        }
      }

      // если есть следующая строка
      if (nextRow) {
        for (let i = 0, len = sortData.length; i < len; i += 1) {
          const number = sortData[i][0];
          const type = sortData[i][1];
          const value = ~~row.cells[number].innerHTML;
          const nextValue = ~~nextRow.cells[number].innerHTML;

          // если type == true, значит сортировка по убыванию
          if (type) {
            // если следующее значение больше текущего
            if (nextValue > value) {
              tbody.insertBefore(nextRow, row);
              sorting(rowIndex + 1);
              return;
            }

            if (nextValue < value) {
              break;
            }

            // иначе сортировка по возрастанию
          } else {
            // если следующее значение меньше текущего
            if (nextValue < value) {
              tbody.insertBefore(nextRow, row);
              sorting(rowIndex + 1);
              return;
            }

            if (nextValue > value) {
              break;
            }
          }
        }
      }
    };

    // если строка отсутствует
    if (row === null) {
      // если есть данные для создания строки, создать ее
      if (cellsData !== null) {
        row = tbody.insertRow(-1);
        row.setAttribute('id', `stat_${data.id}`);

        for (let i = 0, len = cellsData.length; i < len; i += 1) {
          const cell = row.insertCell(i);
          cell.innerHTML = cellsData[i];
        }

        if (sortData) {
          sorting(row.sectionRowIndex);
        }
      }

      // иначе, если строка присутствует
    } else {
      // если данные строки === null, удалить строку
      if (cellsData === null) {
        row.parentNode.removeChild(row);

        // иначе обновить строку
      } else {
        const cells = row.cells;

        for (let i = 0, len = cells.length; i < len; i += 1) {
          cells[i].innerHTML = cellsData[i];
        }

        if (sortData) {
          sorting(row.sectionRowIndex);
        }
      }
    }
  }
}
