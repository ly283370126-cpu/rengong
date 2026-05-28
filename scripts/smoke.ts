const base = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:8787";

async function main() {
  const health = await fetch(`${base}/api/health`);
  if (!health.ok) throw new Error(`health failed: ${health.status}`);
  const status = await health.json();

  const date = await fetch(`${base}/api/tools/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "get_current_date", arguments: {} })
  });
  if (!date.ok) throw new Error(`tool failed: ${date.status}`);
  const payload = await date.json();

  console.log(
    JSON.stringify(
      {
        ok: true,
        openaiConfigured: status.openaiConfigured,
        realtimeModel: status.realtimeModel,
        dateTool: payload.ok
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
