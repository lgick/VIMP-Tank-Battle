import Publisher from '../../../lib/Publisher.js';

// Singleton PanelView

let panelView;

export default class PanelView {
  constructor(model, data) {
    if (panelView) {
      return panelView;
    }

    panelView = this;

    this._panel = data.panel;
    this._healthBarWrapper = null; // контейнер
    this._healthBlocks = []; // блоки здоровья
    this._totalHealthBlocks = 30; // количество блоков здоровья
    this._healthBlockColors = []; // цвета блоков здоровья
    this._emptyBlockColor = '#888'; // цвет пустых блоков

    this.publisher = new Publisher();

    this._mPublic = model.publisher;
    this._mPublic.on('data', 'update', this);

    this.initHealthBar();
  }

  // инициализирует полосу здоровья
  initHealthBar() {
    const healthContainer = document.getElementById(this._panel.health);

    healthContainer.innerHTML = '';

    const wrapper = document.createElement('div');

    wrapper.className = 'panel-health-wrapper';

    this._healthBarWrapper = wrapper; // сохранение ссылки на обертку

    for (let i = 0, len = this._totalHealthBlocks; i < len; i += 1) {
      const block = document.createElement('div');

      block.className = 'panel-health-block';
      block.style.backgroundColor = this._emptyBlockColor;

      wrapper.appendChild(block);

      this._healthBlocks.push(block);
      this._healthBlockColors.push(this.getHealthBlockColor(i));
    }

    healthContainer.appendChild(wrapper);
  }

  // вычисляет цвет для каждого блока здоровья на основе его индекса
  getHealthBlockColor(index) {
    const progress = index / (this._totalHealthBlocks - 1);

    const colors = [
      { p: 0, c: { r: 255, g: 50, b: 50 } }, // red
      { p: 0.25, c: { r: 255, g: 165, b: 0 } }, // orange
      { p: 0.5, c: { r: 255, g: 255, b: 0 } }, // yellow
      { p: 0.75, c: { r: 50, g: 205, b: 50 } }, // green
      { p: 1, c: { r: 0, g: 220, b: 220 } }, // cyan
    ];

    let start, end;

    for (let i = 1, len = colors.length; i < len; i += 1) {
      if (progress <= colors[i].p) {
        start = colors[i - 1];
        end = colors[i];
        break;
      }
    }

    const localProgress = (progress - start.p) / (end.p - start.p);
    const r = Math.round(
      start.c.r * (1 - localProgress) + end.c.r * localProgress,
    );
    const g = Math.round(
      start.c.g * (1 - localProgress) + end.c.g * localProgress,
    );
    const b = Math.round(
      start.c.b * (1 - localProgress) + end.c.b * localProgress,
    );

    return `rgb(${r}, ${g}, ${b})`;
  }

  // обновляет пользовательскую панель
  update(data) {
    const elem = document.getElementById(this._panel[data.name]);

    if (!elem) {
      return;
    }

    if (data.value === '') {
      elem.style.display = 'none';
    } else {
      // логика для здоровья
      if (data.name === 'health') {
        const health = parseInt(data.value, 10);
        const blocksToShow = Math.ceil(
          (health / 100) * this._totalHealthBlocks,
        );

        this._healthBlocks.forEach((block, index) => {
          if (index < blocksToShow) {
            block.className = 'panel-health-block';
            block.style.backgroundColor = this._healthBlockColors[index];
          } else {
            block.className = 'panel-health-block-empty';
            block.style.backgroundColor = this._emptyBlockColor;
          }
        });

        // мигание для последнего неполного блока
        const exactBlocks = (health / 100) * this._totalHealthBlocks;

        if (health > 0 && exactBlocks % 1 !== 0) {
          this._healthBlocks[blocksToShow - 1].classList.add(
            'panel-health-blink',
          );
        }

        elem.style.display = 'table-cell';
      } else {
        elem.innerHTML = data.value;
        elem.style.display = 'table-cell';
      }
    }
  }
}
