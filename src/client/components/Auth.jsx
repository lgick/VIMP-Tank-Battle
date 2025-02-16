import React from 'react';

const Auth = () => {
  return (
    <div id="auth">
      <div id="auth-form">
        <h2>VIMP Tank Battle</h2>
        <div id="auth-name">
          <span>Name:</span>
          <input
            id="auth-name-input"
            type="text"
            name="name"
            maxLength="15"
            placeholder="Vanya"
          />
        </div>
        <div id="auth-team">
          <span>Team:</span>
          <br />
          <label>
            <input type="radio" name="team" value="team1" />
            team1
          </label>
          <br />
          <label>
            <input type="radio" name="team" value="team2" />
            team2
          </label>
          <br />
          <label>
            <input type="radio" name="team" value="spectators" />
            spectators
          </label>
        </div>
        <div id="auth-tank">
          <span>Tank:</span>
          <br />
          <label>
            <input type="radio" name="model" value="m1" />
            tank
          </label>
          <br />
          <label>
            <input type="radio" name="model" value="m2" />
            tank2
          </label>
        </div>
        <div id="auth-error"></div>
        <input id="auth-enter" type="button" autoFocus value="Enter" />
        <div className="auth-inform">
          <h4>Управление</h4>
          <p>
            <b>W,A,S,D</b> - перемещение танка
          </p>
          <p>
            <b>K</b> - поворот пушки влево
          </p>
          <p>
            <b>L</b> - поворот пушки вправо
          </p>
          <p>
            <b>U</b> - пушка по центру
          </p>
          <p>
            <b>J</b> - огонь
          </p>
          <p>
            <b>N</b> - следующее оружие
          </p>
          <p className="last">
            <b>P</b> - предыдущее оружие
          </p>
          <p>
            <b>C</b> - чат/командная строка
          </p>
          <p>
            <b>M</b> - управление игрой
          </p>
          <p className="last">
            <b>TAB</b> - статистика игры
          </p>
          <p>
            <b>escape</b> - сброс
          </p>
          <p>
            <b>enter</b> - ввод
          </p>
        </div>
        <div className="auth-inform">
          <h4>Команды</h4>
          <p>
            <b>/invite &lt;email&gt;</b> - сообщение с приглашением на почту
          </p>
          <p>
            <b>/name &lt;name&gt;</b> - смена ника
          </p>
          <p>
            <b>/mapname</b> - название карты
          </p>
        </div>
        <div id="auth-link">
          <p>
            <a href="https://github.com/lgick/VIMP-Tank-Battle">GitHub</a>
          </p>
          <p>&copy; VIMP</p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
