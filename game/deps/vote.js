module.exports = [
  {
    title: 'Сменить команду, статус',
    key: 'team',
    value: ['team1', 'team2', 'spectator'],
    next: null
  },
  {
    title: 'Предложить новую карту',
    key: 'map',
    value: ['arena', 'arena_2.0', 'berlin'],
    next: null
  },
  {
    title: 'Предложить забанить игрока',
    key: 'ban',
    value: 'users',
    next: {
      title: 'Причина бана',
      key: 'reason',
      value: ['Читер', 'Лузер', 'Флудер', 'Lol', 'lamer', 'bot', 'hipster'],
      next: {
        title: 'Время бана (в минутах)',
        key: 'time',
        value: [5, 10, 30, 100, 300, 500, 1000, 2000, 5000, 10000],
        next: null
      }
    }
  }
];
