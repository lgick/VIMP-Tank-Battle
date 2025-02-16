import React from 'react';

const Stat = () => {
  return (
    <div id="stat">
      <div className="stat-head">
        <span>names</span>
        <span>status</span>
        <span>score</span>
        <span>deaths</span>
      </div>
      <div className="stat-tables">
        <table id="team1">
          <thead>
            <tr>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
          </thead>
          <tbody />
        </table>
        <table id="team2">
          <thead>
            <tr>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
          </thead>
          <tbody />
        </table>
        <table id="spectators">
          <thead>
            <tr>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
          </thead>
          <tbody />
        </table>
      </div>
    </div>
  );
};

export default Stat;
