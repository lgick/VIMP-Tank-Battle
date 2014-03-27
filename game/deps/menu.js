module.exports = {
  title: 'menu',
  value: [
    {
      id: 1,
      title: 'Сменить команду, статус',
      value: [
        {
          id: 1,
          value: 'team1'
        },
        {
          id: 2,
          value: 'team2'
        },
        {
          id: 3,
          value: 'spectator'
        }
      ]
    },
    {
      id: 2,
      title: 'Предложить новую карту',
      value: [
        {
          id: 1,
          value: 'arena'
        },
        {
          id: 2,
          value: 'arena_2.0'
        },
        {
          id: 3,
          value: 'berlin'
        }
      ]
    },
    {
      id: 3,
      title: 'Предложить забанить игрока',
      value: null,
      next: {}
    },
  ]
};
