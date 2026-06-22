import { describe, it, expect, beforeEach, vi } from 'vitest';
import Publisher from '../../src/lib/Publisher.js';

// StatView — синглтон, перезагружаем модуль для изоляции
let StatView;

const elems = { stat: 'stat' };

// happy-dom 20 не реализует HTMLTableSectionElement.rows; StatView активно
// использует tHead.rows / tbody.rows / namedItem. Полифиллим живой геттер,
// вычисляющий строки из дочерних <tr> (insertRow/insertCell/cells работают).
const addRowsPolyfill = el => {
  Object.defineProperty(el, 'rows', {
    configurable: true,
    get() {
      const trs = [...this.children].filter(c => c.tagName === 'TR');
      trs.namedItem = id => trs.find(tr => tr.id === id) || null;
      return trs;
    },
  });
};

const seedDom = () => {
  document.body.innerHTML = `
    <div id="stat">
      <table id="table1">
        <thead><tr><th></th><th></th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  `;
  document
    .querySelectorAll('#table1 thead, #table1 tbody')
    .forEach(addRowsPolyfill);
};

const makeModel = () => ({ publisher: new Publisher() });

beforeEach(async () => {
  vi.resetModules();
  seedDom();
  StatView = (await import('../../src/client/components/view/Stat.js')).default;
});

describe('StatView: открытие/закрытие', () => {
  it('open/close переключают display', () => {
    const view = new StatView(makeModel(), elems);

    view.open();
    expect(document.getElementById('stat').style.display).toBe('block');

    view.close();
    expect(document.getElementById('stat').style.display).toBe('none');
  });
});

describe('StatView.updateTableHead', () => {
  it('заполняет ячейки заголовка', () => {
    const view = new StatView(makeModel(), elems);

    view.updateTableHead({
      tableId: 'table1',
      rowNumber: 0,
      cellsData: ['Имя', 'Очки'],
    });

    const cells = document.querySelector('#table1 thead tr').cells;
    expect(cells[0].textContent).toBe('Имя');
    expect(cells[1].textContent).toBe('Очки');
  });
});

describe('StatView.clearBodies', () => {
  it('очищает содержимое всех tbody', () => {
    const view = new StatView(makeModel(), elems);
    view.updateTableBody({
      tableId: 'table1',
      bodyNumber: 0,
      id: 'p1',
      cellsData: ['Bob', '10'],
      sortData: null,
    });

    view.clearBodies(['table1']);

    expect(document.querySelector('#table1 tbody').textContent).toBe('');
  });
});

describe('StatView.updateTableBody', () => {
  it('создаёт строку при отсутствии и наличии данных', () => {
    const view = new StatView(makeModel(), elems);

    view.updateTableBody({
      tableId: 'table1',
      bodyNumber: 0,
      id: 'p1',
      cellsData: ['Bob', '10'],
      sortData: null,
    });

    const row = document.getElementById('stat_p1');
    expect(row).not.toBeNull();
    expect(row.cells[0].textContent).toBe('Bob');
    expect(row.cells[1].textContent).toBe('10');
  });

  it('обновляет ячейки существующей строки', () => {
    const view = new StatView(makeModel(), elems);
    const base = { tableId: 'table1', bodyNumber: 0, id: 'p1', sortData: null };

    view.updateTableBody({ ...base, cellsData: ['Bob', '10'] });
    view.updateTableBody({ ...base, cellsData: ['Bob', '25'] });

    expect(document.getElementById('stat_p1').cells[1].textContent).toBe('25');
  });

  it('удаляет строку при cellsData === null', () => {
    const view = new StatView(makeModel(), elems);
    const base = { tableId: 'table1', bodyNumber: 0, id: 'p1', sortData: null };

    view.updateTableBody({ ...base, cellsData: ['Bob', '10'] });
    view.updateTableBody({ ...base, cellsData: null });

    expect(document.getElementById('stat_p1')).toBeNull();
  });

  it('сортирует строки по убыванию указанной колонки', () => {
    const view = new StatView(makeModel(), elems);
    const base = { tableId: 'table1', bodyNumber: 0, sortData: [[1, true]] };

    // сначала игрок с меньшим счётом, затем с большим
    view.updateTableBody({ ...base, id: 'low', cellsData: ['Low', '10'] });
    view.updateTableBody({ ...base, id: 'high', cellsData: ['High', '20'] });

    const rows = document.querySelectorAll('#table1 tbody tr');
    // строка с большим счётом должна оказаться первой
    expect(rows[0].id).toBe('stat_high');
    expect(rows[1].id).toBe('stat_low');
  });
});

describe('StatView: события модели', () => {
  it('open/close/tHead/tBody/clearBodies проксируются', () => {
    const model = makeModel();
    new StatView(model, elems);

    model.publisher.emit('open');
    expect(document.getElementById('stat').style.display).toBe('block');

    model.publisher.emit('tBody', {
      tableId: 'table1',
      bodyNumber: 0,
      id: 'p9',
      cellsData: ['Z', '1'],
      sortData: null,
    });
    expect(document.getElementById('stat_p9')).not.toBeNull();
  });
});
