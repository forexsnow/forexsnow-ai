async function loadSnapshot() {

  const response = await fetch("/api/snapshot");
  const data = await response.json();

  const top = data.topPick;

  document.getElementById("topPick").innerHTML = `
    <h2>Top Setup: ${top.pair}</h2>

    <div class="badge ${top.bias.toLowerCase()}">
      ${top.bias}
    </div>

    <p><strong>Confidence:</strong> ${top.confidence}%</p>

    <p><strong>Entry:</strong> ${top.entry}</p>

    <p><strong>Take Profit:</strong> ${top.takeProfit}</p>

    <p><strong>Stop Loss:</strong> ${top.stopLoss}</p>

    <p class="small">
      Updated: ${new Date(data.updatedAt).toLocaleTimeString()}
    </p>
  `;

  const rankings = document.getElementById("rankings");

  rankings.innerHTML = "";

  data.rankings.forEach(item => {

    rankings.innerHTML += `
      <div class="card">

        <h3>
          #${item.rank} ${item.pair}
        </h3>

        <div class="badge ${item.bias.toLowerCase()}">
          ${item.bias}
        </div>

        <p><strong>Confidence:</strong> ${item.confidence}%</p>

        <p><strong>Entry:</strong> ${item.entry}</p>

        <p><strong>TP:</strong> ${item.takeProfit}</p>

        <p><strong>SL:</strong> ${item.stopLoss}</p>

        <p class="small">
          ${item.reason}
        </p>

      </div>
    `;
  });

}

loadSnapshot();

setInterval(loadSnapshot, 10000);
