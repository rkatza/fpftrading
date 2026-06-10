"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setRecommendationStatus } from "@/app/actions";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Select } from "@/components/ui";

const CCYS = ["PEN", "COP", "MXN", "DOP", "BRL"];

export function GeneratePanel() {
  const router = useRouter();
  const [ccy, setCcy] = useState("PEN");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(path: string, body: object, label: string) {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <Select className="w-24" value={ccy} onChange={(e) => setCcy(e.target.value)}>
          {CCYS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Button size="sm" disabled={!!busy} onClick={() => call("/api/ai/brief", { ccy }, "brief")}>
          {busy === "brief" ? "Generating…" : `Macro brief (${ccy})`}
        </Button>
        <Button size="sm" variant="outline" disabled={!!busy} onClick={() => call("/api/ai/recommend", { ccy }, "rec")}>
          {busy === "rec" ? "Generating…" : `Hedge recommendation (${ccy})`}
        </Button>
        <Button size="sm" variant="outline" disabled={!!busy} onClick={() => call("/api/ai/recommend", {}, "recall")}>
          {busy === "recall" ? "Generating…" : "Recommendation (whole book)"}
        </Button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </CardContent>
    </Card>
  );
}

export function RecommendationCard({
  rec,
}: {
  rec: { id: string; title: string; body: string; status: string; createdAt: string; ccy: string | null };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <button className="flex-1 text-left text-sm font-semibold hover:underline" onClick={() => setOpen(!open)}>
            {rec.title}
          </button>
          {rec.ccy && <Badge variant="outline">{rec.ccy}</Badge>}
          <Badge variant={rec.status === "new" ? "warning" : rec.status === "reviewed" ? "success" : "secondary"}>
            {rec.status}
          </Badge>
          <span className="text-xs text-zinc-400">{rec.createdAt.slice(0, 10)}</span>
        </div>
        {open && (
          <>
            <div className="prose prose-sm mt-3 max-w-none whitespace-pre-wrap text-sm dark:prose-invert">{rec.body}</div>
            {rec.status === "new" && (
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    await setRecommendationStatus(rec.id, "reviewed");
                    router.refresh();
                  }}
                >
                  Mark reviewed
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await setRecommendationStatus(rec.id, "dismissed");
                    router.refresh();
                  }}
                >
                  Dismiss
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function BookChat() {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || busy) return;
    const next = [...messages, { role: "user" as const, content: input.trim() }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      setMessages([...next, { role: "assistant", content: res.ok ? data.text : `Error: ${data.error}` }]);
    } catch {
      setMessages([...next, { role: "assistant", content: "Error: request failed." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chat over the book</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
          {messages.length === 0 && (
            <p className="text-xs text-zinc-400">
              Try: “What’s my net COP exposure?” · “What happens to the book if PEN drops 10%?” · “Which hedges fix in
              the next 60 days?”
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                m.role === "user"
                  ? "self-end bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "self-start bg-zinc-100 dark:bg-zinc-800"
              }`}
            >
              {m.content}
            </div>
          ))}
          {busy && <div className="self-start text-xs text-zinc-400">computing…</div>}
        </div>
        <form onSubmit={send} className="flex gap-2">
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about exposures, hedges, scenarios…" />
          <Button type="submit" disabled={busy}>
            Send
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
