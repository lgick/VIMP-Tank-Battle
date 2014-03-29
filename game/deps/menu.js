module.exports = [
  {
    title: 'Сменить команду, статус',
    value: ['team1', 'team2', 'spectator'],
    next: null
  },
  {
    title: 'Предложить новую карту',
    value: ['arena', 'arena_2.0', 'berlin'],
    next: null
  },
  {
    title: 'Предложить забанить игрока',
    value: 'users',
    next: {
      title: 'Причина бана',
      value: ['Читер', 'Лузер', 'Флудер'],
      next: {
        title: 'Время бана (в минутах)',
        value: [5, 10, 30, 100, 300, 500, 1000],
        next: null
      }
    }
  }
];
