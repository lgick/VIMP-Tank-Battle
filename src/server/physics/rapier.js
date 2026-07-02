import RAPIER from '@dimforge/rapier2d-compat';

// Единая точка доступа к Rapier: WASM инициализируется один раз на процесс
// (top-level await), конструкторы физики остаются синхронными.
// Все серверные физ-модули импортируют RAPIER только отсюда —
// это же упрощает мок в юнит-тестах.
await RAPIER.init();

export default RAPIER;
