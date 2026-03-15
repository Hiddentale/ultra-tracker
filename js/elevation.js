function drawElevationProfile(canvas, route, currentDistAlongRoute) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const padding = { top: 4, bottom: 16, left: 0, right: 0 };
  const plotW = w - padding.left - padding.right;
  const plotH = h - padding.top - padding.bottom;

  if (route.length < 2 || plotW <= 0 || plotH <= 0) return;

  const totalDist = route[route.length - 1].cumDist;
  const elevations = route.map(p => p.ele).filter(e => e !== null);
  if (elevations.length === 0) return;

  const minEle = Math.min(...elevations);
  const maxEle = Math.max(...elevations);
  const eleRange = maxEle - minEle || 1;

  function toX(cumDist) {
    return padding.left + (cumDist / totalDist) * plotW;
  }

  function toY(ele) {
    return padding.top + plotH - ((ele - minEle) / eleRange) * plotH;
  }

  ctx.clearRect(0, 0, w, h);

  // Find the x position of the runner
  const runnerX = toX(currentDistAlongRoute || 0);

  // Draw completed fill
  if (currentDistAlongRoute > 0) {
    ctx.beginPath();
    ctx.moveTo(padding.left, toY(route[0].ele || minEle));
    for (const p of route) {
      if (p.cumDist > currentDistAlongRoute) break;
      ctx.lineTo(toX(p.cumDist), toY(p.ele || minEle));
    }
    ctx.lineTo(runnerX, h - padding.bottom);
    ctx.lineTo(padding.left, h - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = "rgba(61, 220, 132, 0.15)";
    ctx.fill();
  }

  // Draw remaining fill
  ctx.beginPath();
  let started = false;
  for (const p of route) {
    if (p.cumDist < (currentDistAlongRoute || 0)) continue;
    const x = toX(p.cumDist);
    const y = toY(p.ele || minEle);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.lineTo(toX(totalDist), h - padding.bottom);
  ctx.lineTo(runnerX, h - padding.bottom);
  ctx.closePath();
  ctx.fillStyle = "rgba(148, 163, 184, 0.08)";
  ctx.fill();

  // Draw elevation line
  ctx.beginPath();
  ctx.moveTo(toX(route[0].cumDist), toY(route[0].ele || minEle));
  for (let i = 1; i < route.length; i++) {
    ctx.lineTo(toX(route[i].cumDist), toY(route[i].ele || minEle));
  }
  ctx.strokeStyle = "#3a3d44";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Draw completed portion in green
  if (currentDistAlongRoute > 0) {
    ctx.beginPath();
    ctx.moveTo(toX(route[0].cumDist), toY(route[0].ele || minEle));
    for (const p of route) {
      if (p.cumDist > currentDistAlongRoute) break;
      ctx.lineTo(toX(p.cumDist), toY(p.ele || minEle));
    }
    ctx.strokeStyle = "#3ddc84";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Draw runner position marker
  if (currentDistAlongRoute != null && currentDistAlongRoute > 0) {
    // Find elevation at runner position
    let runnerEle = minEle;
    for (let i = 0; i < route.length - 1; i++) {
      if (route[i].cumDist <= currentDistAlongRoute
          && route[i + 1].cumDist >= currentDistAlongRoute) {
        const t = (currentDistAlongRoute - route[i].cumDist)
          / (route[i + 1].cumDist - route[i].cumDist);
        runnerEle = (route[i].ele || minEle) + t * ((route[i + 1].ele || minEle) - (route[i].ele || minEle));
        break;
      }
    }

    // Vertical line
    ctx.beginPath();
    ctx.moveTo(runnerX, padding.top);
    ctx.lineTo(runnerX, h - padding.bottom);
    ctx.strokeStyle = "rgba(232, 98, 44, 0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Dot
    ctx.beginPath();
    ctx.arc(runnerX, toY(runnerEle), 4, 0, Math.PI * 2);
    ctx.fillStyle = "#e8622c";
    ctx.fill();
    ctx.strokeStyle = "#1a1d22";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Axis labels
  ctx.fillStyle = "#5c5952";
  ctx.font = "10px 'DM Sans', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`${Math.round(minEle)}m`, padding.left + 2, h - 2);
  ctx.textAlign = "right";
  ctx.fillText(`${Math.round(totalDist / 1000)} km`, w - padding.right - 2, h - 2);
  ctx.textAlign = "left";
  ctx.fillText(`${Math.round(maxEle)}m`, padding.left + 2, padding.top + 10);
}
