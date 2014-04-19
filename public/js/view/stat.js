define(['Publisher'], function (Publisher) {
  // Singleton StatView
  var statView;

  function StatView(model, data) {
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
  }

  // открывает статистику
  StatView.prototype.open = function () {
    this._stat.style.display = 'block';
  };

  // закрывает статистику
  StatView.prototype.close = function () {
    this._stat.style.display = 'none';
  };

  // обновляет <thead>
  StatView.prototype.updateTableHead = function (data) {
    var table = this._document.getElementById(data.tableID)
      , cells = table.tHead.rows[data.rowNumber].cells
      , cellsData = data.cellsData
      , i = 0
      , len = cells.length
    ;

    for (; i < len; i += 1) {
      cells[i].innerHTML = cellsData[i];
    }
  };

  // обновляет <tbody>
  StatView.prototype.updateTableBody = function (data) {
    var table = this._document.getElementById(data.tableID)
      , tbody = table.tBodies[data.bodyNumber]
      , row = tbody.rows.namedItem('stat_' + data.id)
      , cellsData = data.cellsData
      , sortData = data.sortData
      , cells
      , cell
      , i
      , len
    ;

    // сортирует
    function sorting(rowIndex) {
      var row = tbody.rows[rowIndex]
        , prevRow = tbody.rows[rowIndex - 1]
        , nextRow = tbody.rows[rowIndex + 1]
        , value
        , prevValue
        , nextValue
        , i
        , len
        , number
        , type       // (true: 3, 2, 1, 0; false: 0, 1, 2, 3)
      ;

      // если есть предыдущая строка
      if (prevRow) {
        for (i = 0, len = sortData.length; i < len; i += 1) {
          number = sortData[i][0];
          type = sortData[i][1];

          value = ~~(row.cells[number].innerHTML);
          prevValue = ~~(prevRow.cells[number].innerHTML);

          // если type == true, значит сортировка по убыванию
          // (значение предыдущего больше последующего,
          // значение следующего меньше предыдущего)
          if (type) {
            // если предыдущее значение меньше текущего,
            // двигаем текущую строку перед предыдущей
            if (prevValue < value) {
              tbody.insertBefore(row, prevRow);
              sorting(rowIndex - 1);
              break;
            }

            if (prevValue > value) {
              break;
            }

          // иначе, сортировка по возростанию
          // (значение предыдущего меньше последующего,
          // значение следующего больше предыдущего)
          } else {
            // если предыдущее значение больше текущего,
            // двигаем текущую строку перед предыдущей
            if (prevValue > value) {
              tbody.insertBefore(row, prevRow);
              sorting(rowIndex - 1);
              break;
            }

            if (prevValue < value) {
              break;
            }
          }
        }
      }

      // если есть следующая строкв
      if (nextRow) {
        for (i = 0, len = sortData.length; i < len; i += 1) {
          number = sortData[i][0];
          type = sortData[i][1];

          value = ~~(row.cells[number].innerHTML);
          nextValue = ~~(nextRow.cells[number].innerHTML);

          // если type == true, значит сортировка по убыванию
          // (значение предыдущего больше последующего,
          // значение следующего меньше предыдущего)
          if (type) {
            // если предыдущее значение меньше текущего,
            // двигаем текущую строку перед предыдущей
            if (nextValue > value) {
              tbody.insertBefore(nextRow, row);
              sorting(rowIndex + 1);
              break;
            }

            if (nextValue < value) {
              break;
            }

          // иначе, сортировка по возростанию
          // (значение предыдущего меньше последующего,
          // значение следующего больше предыдущего)
          } else {
            // если предыдущее значение больше текущего,
            // двигаем текущую строку перед предыдущей
            if (nextValue < value) {
              tbody.insertBefore(nextRow, row);
              sorting(rowIndex + 1);
              break;
            }

            if (nextValue > value) {
              break;
            }
          }
        }
      }
    }

    // если строка отсутствует
    if (row === null) {
      // если есть данные для создания строки, создать ее
      if (cellsData !== null) {
        row = tbody.insertRow(-1);
        row.setAttribute('id', 'stat_' + data.id);

        for (i = 0, len = cellsData.length; i < len; i += 1) {
          cell = row.insertCell(i);
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

      // иначе, обновить строку
      } else {
        cells = row.cells;

        for (i = 0, len = cells.length; i < len; i += 1) {
          cells[i].innerHTML = cellsData[i];
        }

        if (sortData) {
          sorting(row.sectionRowIndex);
        }
      }
    }
  };

  return StatView;
});
