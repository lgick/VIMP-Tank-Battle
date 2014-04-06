module.exports = [
  {
    vote: 'status',
    title: 'Сменить команду, статус',
    key: 'status',
    value: ['team1', 'team2', 'spectator'],
    next: null
  },
  {
    vote: 'remap',
    title: 'Предложить новую карту',
    key: 'map',
    value: ['arena', 'arena_2.0', 'berlin'],
    next: null
  },
  {
    vote: 'ban',
    title: 'Предложить забанить игрока',
    key: 'user',
    value: 'users',
    next: {
      title: 'Причина бана',
      key: 'reason',
      value: ['ЧИТЕР', 'Лузер', 'Флудер', 'Lol', 'lamer', 'bot', 'HIPSTER', 'венера', 'марс', 'юпитер', 'сатурн', 'плутон', 'нептун', 'уран', 'ЗЕМЛЯ'],
      next: {
        title: 'Время бана (в минутах)',
        key: 'time',
        value: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
        next: null
      }
    }
  }
];
