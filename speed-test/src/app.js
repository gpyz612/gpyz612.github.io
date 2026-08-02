const nodes = [
  { id: "cloudflare", code: "CF", name: "Cloudflare Pages", origin: "https://ww3.2024612.xyz" },
  { id: "netlify", code: "NT", name: "Netlify", origin: "https://ww2.2024612.xyz" },
  { id: "vercel", code: "VC", name: "Vercel", origin: "https://ww1.2024612.xyz" }
];

const modes = {
  quick: { bytes: 1024 * 1024, label: "快速测试将下载约 3 MB 数据，不会上传文件。" },
  standard: { bytes: 4 * 1024 * 1024, label: "标准测试将下载约 12 MB 数据，不会上传文件。" }
};

const elements = {
  button: document.querySelector("#startTest"),
  mode: document.querySelector("#testMode"),
  note: document.querySelector("#testNote"),
  state: document.querySelector("#connectionState span:last-child"),
  summary: document.querySelector("#summaryText"),
  grid: document.querySelector("#resultGrid"),
  template: document.querySelector("#resultCardTemplate")
};

const cards = new Map();

for (const node of nodes) {
  const card = elements.template.content.firstElementChild.cloneNode(true);
  card.dataset.node = node.id;
  card.querySelector(".provider-code").textContent = node.code;
  card.querySelector("h3").textContent = node.name;
  elements.grid.append(card);
  cards.set(node.id, card);
}

elements.mode.addEventListener("change", () => {
  elements.note.textContent = modes[elements.mode.value].label;
});

elements.button.addEventListener("click", runTest);

async function runTest() {
  const mode = modes[elements.mode.value];
  const results = [];

  setGlobalState("testing", "正在测量");
  elements.button.disabled = true;
  elements.button.querySelector("span").textContent = "测速中…";
  elements.mode.disabled = true;
  elements.summary.textContent = "先测量线路响应，再依次下载测试文件，避免线路之间抢占带宽。";
  resetCards();

  const latencyResults = await Promise.all(nodes.map(measureLatency));
  for (const result of latencyResults) updateLatencyCard(result);

  for (const node of nodes) {
    const latency = latencyResults.find((item) => item.id === node.id);
    if (!latency?.available) {
      results.push({ ...latency, speed: 0 });
      markError(node.id, latency?.error || "线路不可用");
      continue;
    }

    try {
      setRouteState(node.id, "active");
      setCardState(node.id, "running", "下载中");
      const speed = await measureDownload(node, mode.bytes, (progress) => updateProgress(node.id, progress));
      const result = { ...latency, speed };
      results.push(result);
      updateCompletedCard(result);
      setRouteState(node.id, "complete");
    } catch (error) {
      results.push({ ...latency, speed: 0, error: friendlyError(error) });
      markError(node.id, friendlyError(error));
    }
  }

  finishTest(results);
}

async function measureLatency(node) {
  const samples = [];
  let lastError = null;
  setCardState(node.id, "running", "测延迟");
  setRouteState(node.id, "active");

  for (let index = 0; index < 5; index += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const started = performance.now();

    try {
      const response = await fetch(`${node.origin}/probe.txt?t=${Date.now()}-${index}`, {
        cache: "no-store",
        mode: "cors",
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await response.text();
      samples.push(performance.now() - started);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }

  if (!samples.length) {
    setRouteState(node.id, "error");
    return { id: node.id, name: node.name, available: false, success: 0, error: friendlyError(lastError) };
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const latency = sorted[Math.floor(sorted.length / 2)];
  const changes = samples.slice(1).map((value, index) => Math.abs(value - samples[index]));
  const jitter = changes.length ? changes.reduce((sum, value) => sum + value, 0) / changes.length : 0;
  setRouteState(node.id, "complete");

  return {
    id: node.id,
    name: node.name,
    available: true,
    latency,
    jitter,
    success: (samples.length / 5) * 100
  };
}

async function measureDownload(node, byteTarget, onProgress) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  const started = performance.now();
  let received = 0;

  try {
    const response = await fetch(`${node.origin}/__speed/payload.bin?v=1`, {
      cache: "reload",
      mode: "cors",
      signal: controller.signal
    });
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

    const reader = response.body.getReader();
    while (received < byteTarget) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      onProgress(Math.min(received / byteTarget, 1));
    }
    if (received >= byteTarget) await reader.cancel();
  } finally {
    clearTimeout(timeout);
  }

  if (!received) throw new Error("未收到测速数据");
  const seconds = (performance.now() - started) / 1000;
  return (Math.min(received, byteTarget) * 8) / seconds / 1_000_000;
}

function updateLatencyCard(result) {
  const card = cards.get(result.id);
  if (!result.available) {
    markError(result.id, result.error);
    return;
  }
  card.querySelector(".latency-value").textContent = `${formatNumber(result.latency, 0)} ms`;
  card.querySelector(".jitter-value").textContent = `${formatNumber(result.jitter, 0)} ms`;
  card.querySelector(".success-value").textContent = `${formatNumber(result.success, 0)}%`;
  card.querySelector(".card-message").textContent = "延迟完成，等待下载测试";
}

function updateCompletedCard(result) {
  const card = cards.get(result.id);
  setCardState(result.id, "done", "已完成");
  card.querySelector(".speed-value").textContent = formatNumber(result.speed, result.speed < 10 ? 1 : 0);
  card.querySelector(".card-message").textContent = describeResult(result);
  updateProgress(result.id, 1);
}

function updateProgress(id, progress) {
  cards.get(id).querySelector(".progress-track span").style.width = `${Math.round(progress * 100)}%`;
}

function finishTest(results) {
  const valid = results.filter((result) => result.available && result.speed > 0);
  const winner = [...valid].sort((a, b) => score(b) - score(a))[0];

  if (winner) {
    cards.get(winner.id).classList.add("is-winner");
    elements.summary.textContent = `${winner.name} 在本次测试中综合表现最好：${formatNumber(winner.speed, 1)} Mbps，延迟 ${formatNumber(winner.latency, 0)} ms。`;
    setGlobalState("complete", "测试完成");
  } else {
    elements.summary.textContent = "三条线路均未完成测试。请检查网络、跨域响应头或稍后重试。";
    setGlobalState("complete", "测试未完成");
  }

  elements.button.disabled = false;
  elements.button.querySelector("span").textContent = "重新测速";
  elements.mode.disabled = false;
}

function score(result) {
  return result.speed * 0.65 + Math.max(0, 220 - result.latency) * 0.3 + result.success * 0.05;
}

function describeResult(result) {
  if (result.latency < 60 && result.speed >= 50) return "响应快，适合作为当前首选线路";
  if (result.latency < 120) return "连接稳定，日常访问表现良好";
  return "可以访问，但响应距离感较明显";
}

function friendlyError(error) {
  if (error?.name === "AbortError") return "请求超时，请稍后重试";
  if (String(error?.message).includes("HTTP")) return `测速资源异常（${error.message}）`;
  return "无法读取测速资源，请检查 CORS 配置";
}

function resetCards() {
  for (const [id, card] of cards) {
    card.className = "result-card";
    card.querySelector(".status-badge").textContent = "等待中";
    card.querySelector(".speed-value").textContent = "—";
    card.querySelector(".latency-value").textContent = "—";
    card.querySelector(".jitter-value").textContent = "—";
    card.querySelector(".success-value").textContent = "—";
    card.querySelector(".card-message").textContent = "准备连接";
    updateProgress(id, 0);
    setRouteState(id, "");
  }
}

function setCardState(id, state, label) {
  const card = cards.get(id);
  card.classList.remove("is-running", "is-done", "is-error");
  if (state) card.classList.add(`is-${state}`);
  card.querySelector(".status-badge").textContent = label;
}

function setRouteState(id, state) {
  const route = document.querySelector(`[data-route="${id}"]`);
  route.classList.remove("is-active", "is-complete", "is-error");
  if (state) route.classList.add(`is-${state}`);
}

function markError(id, message) {
  setCardState(id, "error", "失败");
  setRouteState(id, "error");
  cards.get(id).querySelector(".card-message").textContent = message;
}

function setGlobalState(state, label) {
  document.body.classList.remove("is-testing", "is-complete");
  document.body.classList.add(`is-${state}`);
  elements.state.textContent = label;
}

function formatNumber(value, digits) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
}
