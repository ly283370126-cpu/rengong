import "dotenv/config";

const masked = (value?: string) => {
  if (!value) return "missing";
  if (value.length <= 12) return "present";
  return `${value.slice(0, 7)}...${value.slice(-4)}`;
};

async function checkOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    return { configured: false, ok: false, status: null, message: "OPENAI_API_KEY missing" };
  }

  const response = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
  });

  let message = response.statusText;
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    message = payload?.error?.message ?? message;
  }

  return {
    configured: true,
    ok: response.ok,
    status: response.status,
    key: masked(process.env.OPENAI_API_KEY),
    message
  };
}

const result = await checkOpenAI();
console.log(JSON.stringify(result, null, 2));
if (result.configured && !result.ok) process.exitCode = 1;
