async function loadSnapshot() {

  const response = await fetch("/api/snapshot");
  const data = await response.json();

  const top = data.topPick;

  document.getElementById("topPick").innerHTML = `
    <h2>Top Setup: ${top.pair}</h2>

    <p class="badge ${top.bias.toLowerCase()}">
      ${top.bias}
    </p>

    <p><strong>Confidence:</strong> ${top.confidence}%</p>

    <p><strong>Entry:</strong> ${top.entry}</p>

    <p><strong>Take Profit:</strong> ${top.takeProfit}</p>

    <p><strong>Stop Loss:</strong> ${top.stopLoss}</p>

    <p>${top.reason}</p>
  `;

  const rankings = document.getElementById("rankings");

  rankings.innerHTML = data.rankings.map(item => `
    <div class="card">
      <h3>#${item.rank} ${item.pair}</h3>

      <p class="badge ${item.bias.toLowerCase()}">
        ${item.bias}
      </p>

      <p>Confidence: ${item.confidence}%</p>

      <p>Entry: ${item.entry}</p>

      <p>TP: ${item.takeProfit}</p>

      <p>SL: ${item.stopLoss}</p>
    </div>
  `).join("");

}

loadSnapshot();

setInterval(loadSnapshot, 10000);
