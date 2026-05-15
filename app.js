async function loadSnapshot() {
  const response = await fetch("https://forexsnow-ai-production.up.railway.app/api/snapshot");
  const data = await response.json();

  const top = data.topPick;

  document.getElementById("topPick").innerHTML = `
    <h2>Top Setup: ${top.pair}</h2>
    <p class="badge ${top.bias.toLowerCase()}">${top.bias}</p>
    <p><strong>Confidence:</strong> ${top.confidence}%</p>
    <p><strong>Entry:</strong> ${top.entry}</p>
    <p><strong>Take Profit:</strong> ${top.takeProfit}</p>
    <p><strong>Stop Loss:</strong> ${top.stopLoss}</p>
    <p class="small">${top.reason}</p>
    <p class="small">Updated: ${new Date(data.updatedAt).toLocaleTimeString()}</p>
  `;

  document.getElementById("rankings").innerHTML = data.rankings.map(item => `
    <tr>
      <td>#${item.rank}</td>
      <td>${item.pair}</td>
      <td><span class="badge ${item.bias.toLowerCase()}">${item.bias}</span></td>
      <td>${item.confidence}%</td>
      <td>${item.entry}</td>
      <td>${item.takeProfit}</td>
      <td>${item.stopLoss}</td>
    </tr>
  `).join("");
}

loadSnapshot();

setInterval(loadSnapshot, 10000);
