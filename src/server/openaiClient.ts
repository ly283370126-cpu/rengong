import { ProxyAgent, setGlobalDispatcher } from "undici";
import type { Dispatcher } from "undici";

type ProxyEnvName = "HTTPS_PROXY" | "HTTP_PROXY" | "ALL_PROXY";
type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

export type OpenAINetworkStatus = {
  proxyConfigured: boolean;
  proxyEnv: ProxyEnvName | null;
};

type ProxySelection = {
  envName: ProxyEnvName;
  url: string;
};

const openaiProtocol = "https:";
let activeProxyAgent: { proxyUrl: string; agent: Dispatcher } | null = null;

function proxyEnvValue(name: ProxyEnvName) {
  const direct = process.env[name]?.trim();
  const lower = process.env[name.toLowerCase()]?.trim();
  return direct || lower || undefined;
}

function selectProxy(protocol: string): ProxySelection | null {
  const envOrder: ProxyEnvName[] =
    protocol === "http:" ? ["HTTP_PROXY", "ALL_PROXY"] : ["HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY"];

  for (const envName of envOrder) {
    const url = proxyEnvValue(envName);
    if (url) return { envName, url };
  }

  return null;
}

function requestProtocol(input: FetchInput) {
  try {
    if (typeof input === "string") return new URL(input).protocol;
    if (input instanceof URL) return input.protocol;
    return new URL(input.url).protocol;
  } catch {
    return openaiProtocol;
  }
}

function activateProxy(proxyUrl: string) {
  if (activeProxyAgent?.proxyUrl === proxyUrl) return;

  const previousAgent = activeProxyAgent?.agent;
  const agent = new ProxyAgent(proxyUrl);
  activeProxyAgent = { proxyUrl, agent };
  setGlobalDispatcher(agent);
  void previousAgent?.close().catch(() => undefined);
}

export async function openaiFetch(input: FetchInput, init?: FetchInit): Promise<Response> {
  const proxy = selectProxy(requestProtocol(input));
  if (proxy) activateProxy(proxy.url);
  return fetch(input, init);
}

export function openaiNetworkStatus(): OpenAINetworkStatus {
  const proxy = selectProxy(openaiProtocol);

  return {
    proxyConfigured: Boolean(proxy),
    proxyEnv: proxy?.envName ?? null
  };
}
