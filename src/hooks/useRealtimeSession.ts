import { useCallback, useRef, useState } from "react";
import { buildRealtimeSessionConfig } from "../lib/assistantPrompt";
import type { AssistantStatus, LogEntry, ToolResult } from "../types/realtime";

interface RealtimeOptions {
  onStatus(status: AssistantStatus): void;
  addLog(entry: Omit<LogEntry, "id" | "at">): void;
  onMicStream(stream: MediaStream | null): void;
  model?: string;
  voice?: string;
}

function parseJson(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || value.length === 0) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function executeLocalTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const response = await fetch("/api/tools/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, arguments: args })
  });
  return response.json();
}

export function useRealtimeSession({
  onStatus,
  addLog,
  onMicStream,
  model = "gpt-realtime",
  voice = "marin"
}: RealtimeOptions) {
  const [active, setActive] = useState(false);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processedCalls = useRef(new Set<string>());

  const sendEvent = useCallback((event: Record<string, unknown>) => {
    const channel = dataRef.current;
    if (!channel || channel.readyState !== "open") return;
    channel.send(JSON.stringify(event));
  }, []);

  const handleFunctionCall = useCallback(
    async (item: Record<string, unknown>) => {
      const callId = String(item.call_id ?? item.id ?? "");
      const name = String(item.name ?? "");
      if (!callId || !name || processedCalls.current.has(callId)) return;
      processedCalls.current.add(callId);

      onStatus("executing_tool");
      const args = parseJson(item.arguments);
      addLog({ role: "tool", text: `调用 ${name} ${JSON.stringify(args)}` });
      const output = await executeLocalTool(name, args);
      addLog({ role: "tool", text: JSON.stringify(output.result ?? output.error) });

      sendEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify(output)
        }
      });
      sendEvent({ type: "response.create" });
    },
    [addLog, onStatus, sendEvent]
  );

  const handleServerEvent = useCallback(
    (event: Record<string, unknown>) => {
      const type = String(event.type ?? "");

      if (type === "input_audio_buffer.speech_started") onStatus("listening");
      if (type === "response.created") onStatus("thinking");
      if (type === "response.audio.delta" || type === "response.output_audio.delta") {
        onStatus("speaking");
      }
      if (type === "response.done") onStatus("listening");
      if (type === "error") {
        onStatus("error");
        addLog({ role: "system", text: JSON.stringify(event) });
      }

      const item = event.item as Record<string, unknown> | undefined;
      if (item?.type === "function_call") {
        void handleFunctionCall(item);
      }

      const delta = event.delta;
      if (typeof delta === "string" && delta.trim()) {
        addLog({ role: "assistant", text: delta.trim() });
      }
    },
    [addLog, handleFunctionCall, onStatus]
  );

  const start = useCallback(async () => {
    onStatus("connecting");
    processedCalls.current.clear();

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    streamRef.current = stream;
    onMicStream(stream);

    const peer = new RTCPeerConnection();
    peerRef.current = peer;

    for (const track of stream.getTracks()) {
      peer.addTrack(track, stream);
    }

    const audio = new Audio();
    audio.autoplay = true;
    peer.ontrack = (event) => {
      audio.srcObject = event.streams[0];
    };

    const channel = peer.createDataChannel("oai-events");
    dataRef.current = channel;
    channel.onopen = () => {
      sendEvent({
        type: "session.update",
        session: buildRealtimeSessionConfig(model, voice)
      });
      setActive(true);
      onStatus("listening");
      addLog({ role: "system", text: "Realtime 已连接。现在可以直接说话。" });
    };
    channel.onmessage = (message) => {
      try {
        handleServerEvent(JSON.parse(message.data) as Record<string, unknown>);
      } catch {
        addLog({ role: "system", text: String(message.data) });
      }
    };

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    const response = await fetch("/api/realtime/calls", {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: offer.sdp
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail);
    }

    const answerSdp = await response.text();
    await peer.setRemoteDescription({ type: "answer", sdp: answerSdp });
  }, [addLog, handleServerEvent, model, onMicStream, onStatus, sendEvent, voice]);

  const stop = useCallback(() => {
    dataRef.current?.close();
    peerRef.current?.close();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    dataRef.current = null;
    peerRef.current = null;
    streamRef.current = null;
    onMicStream(null);
    setActive(false);
    onStatus("idle");
  }, [onMicStream, onStatus]);

  const sendText = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      addLog({ role: "user", text });
      sendEvent({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text }]
        }
      });
      sendEvent({ type: "response.create" });
      onStatus("thinking");
    },
    [addLog, onStatus, sendEvent]
  );

  return { active, start, stop, sendText };
}
