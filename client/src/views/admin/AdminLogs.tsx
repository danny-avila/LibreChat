import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "~/components/ui/Button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/Dialog";
import DataTable from "~/components/ui/DataTable";
import { ColumnDef } from "@tanstack/react-table";

type RawUser = { _id: string; email?: string; username?: string; name?: string } | string;

type RawLog = {
  _id: string;
  user: RawUser;
  action: "LOGIN" | "LOGOUT" | "MODEL CHANGED" | string;
  timestamp: string;
  details?: any;
  tokenUsage?: {
    beforeModelChange?: { model: string; totalTokens: number; messageCount: number };
    afterModelChange?: { model: string; totalTokens: number; messageCount: number };
    tokenDifference?: number;
  };
};

type RowLog = {
  _id: string;
  userId: string;
  email?: string;
  name?: string;
  action: string;
  timestamp: string;
  details?: any;
  tokenUsage?: RawLog["tokenUsage"];
};

type UserCache = Record<string, { email?: string; name?: string; username?: string }>;

function toRow(log: RawLog & { userInfo?: any }, cache: UserCache): RowLog {
  const userId = typeof log.user === "string" ? log.user : log.user?._id;
  const populated = (log as any).userInfo || (typeof log.user === "object" ? log.user : undefined);
  const cached = userId ? cache[userId] : undefined;

  return {
    _id: log._id,
    userId: userId || "",
    email: populated?.email ?? cached?.email,
    name: populated?.name ?? cached?.name ?? populated?.username ?? cached?.username,
    action: log.action,
    timestamp: log.timestamp,
    details: log.details,
    tokenUsage: log.tokenUsage,
  };
}

export default function AdminLogs() {
  const [rows, setRows] = useState<RowLog[]>([]);
  const [userCache] = useState<UserCache>({});
  const [selected, setSelected] = useState<RowLog | null>(null);
  const [connected, setConnected] = useState(false);
  const [statusMap, setStatusMap] = useState<Record<string, "Active" | "Inactive">>({});
  const esRef = useRef<EventSource | null>(null);

  // Debug: Log rows state changes
  useEffect(() => {
    console.log('[AdminLogs] 📊 Rows state updated:', rows.length, 'rows');
  }, [rows]);

  const getStatus = (row: RowLog) =>
    statusMap[row.userId] || (row.action === "LOGOUT" ? "Inactive" : "Active");

  const applyStatusUpdate = (log: RowLog) => {
    if (!log.userId) return;
    setStatusMap(prev => {
      if (log.action === "LOGIN") return { ...prev, [log.userId]: "Active" };
      if (log.action === "LOGOUT") return { ...prev, [log.userId]: "Inactive" };
      return prev;
    });
  };

  // Test function to manually add a log
  const addTestLog = () => {
    const testLog: RowLog = {
      _id: 'test-' + Date.now(),
      userId: 'test-user',
      email: 'test@example.com',
      name: 'Test User',
      action: 'LOGIN',
      timestamp: new Date().toISOString(),
    };
    setRows(prev => [testLog, ...prev]);
    console.log('[AdminLogs] 🧪 Added test log manually');
  };

  // Connect to backend SSE endpoint
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return console.error("[AdminLogs] ❌ No JWT token found");

    // 1) One-time HTTP load as fallback/initial snapshot
    (async () => {
      try {
        const resp = await fetch(`http://localhost:3080/api/user-activity/logs?all=true`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await resp.json();
        console.log('[AdminLogs] 🧭 Initial HTTP logs response:', json);
        if (json?.success && json?.data?.logs) {
          const normalized = json.data.logs.map((log: any) => toRow(log, userCache));
          setRows(normalized);
          normalized.forEach((log) => applyStatusUpdate(log));
        }
      } catch (e) {
        console.error('[AdminLogs] ❌ Initial HTTP fetch failed:', e);
      }
    })();

    console.log("[AdminLogs] 🔗 Connecting to SSE stream...");
    const es = new EventSource(`http://localhost:3080/api/user-activity/stream?token=${token}`);
    esRef.current = es;

    es.onopen = () => {
      console.log("[AdminLogs] ✅ SSE connection opened");
      setConnected(true);
    };

    // Listen for specific event types
    es.addEventListener('connected', (evt) => {
      console.log('[AdminLogs] ✅ SSE connection established:', evt.data);
    });

    es.addEventListener('activity', (evt) => {
      console.log('[AdminLogs] 📊 Activity event received:', evt.data);
      if (!evt.data) return;
      
      try {
        const msg = JSON.parse(evt.data);
        console.log('[AdminLogs] 📋 Parsed activity message:', msg);
        
        if (msg.success && msg.data && msg.data.logs) {
          const logs = msg.data.logs;
          console.log('[AdminLogs] 📋 Processing logs:', logs);
          
          const normalized = logs.map((log: any) => toRow(log, userCache));
          console.log('[AdminLogs] 🔄 Normalized logs:', normalized);
          
          setRows(prev => {
            const newRows = [...normalized, ...prev];
            const uniqueRows = newRows.filter((row, index, self) => 
              index === self.findIndex(r => r._id === row._id)
            );
            console.log('[AdminLogs] 📈 Updated rows count:', uniqueRows.length);
            return uniqueRows;
          });
          
          normalized.forEach(log => applyStatusUpdate(log));
        } else {
          console.log('[AdminLogs] ⚠️ Activity event missing expected data structure:', msg);
        }
      } catch (e) {
        console.error("[AdminLogs] ❌ Failed to parse activity SSE JSON:", e);
      }
    });

    es.addEventListener('heartbeat', (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        console.log('[AdminLogs] 💓 Heartbeat received:', msg.ping);
      } catch (e) {
        console.error("[AdminLogs] ❌ Failed to parse heartbeat SSE JSON:", e);
      }
    });

    // Fallback for generic message events (in case event listeners don't work)
    es.onmessage = evt => {
      console.log('[AdminLogs] 📨 Generic message received:', evt);
      if (!evt.data) return;
      try {
        const msg = JSON.parse(evt.data);
        console.log('[AdminLogs] 📨 Generic message parsed:', msg);
        
        if (msg.success && msg.data && msg.data.logs) {
          console.log('[AdminLogs] 🔄 Processing activity from generic message');
          const logs = msg.data.logs;
          const normalized = logs.map((log: any) => toRow(log, userCache));
          
          setRows(prev => {
            const newRows = [...normalized, ...prev];
            const uniqueRows = newRows.filter((row, index, self) => 
              index === self.findIndex(r => r._id === row._id)
            );
            console.log('[AdminLogs] 📈 Updated rows from generic message:', uniqueRows.length);
            return uniqueRows;
          });
          
          normalized.forEach(log => applyStatusUpdate(log));
        }
      } catch (e) {
        console.error("[AdminLogs] ❌ Failed to parse generic SSE JSON:", e);
      }
    };

    es.onerror = (error) => {
      console.error("[AdminLogs] ❌ SSE Error:", error);
      setConnected(false);
    };

    return () => {
      console.log("[AdminLogs] 🔌 Closing SSE connection");
      es.close();
    };
  }, []);

  const columns: ColumnDef<RowLog>[] = useMemo(
    () => [
      {
        accessorKey: "timestamp",
        header: "Time",
        cell: ({ row }) => <span className="text-xs">{new Date(row.original.timestamp).toLocaleString()}</span>,
      },
      { accessorKey: "email", header: "Email", cell: ({ row }) => row.original.email ?? "—" },
      { accessorKey: "name", header: "Name", cell: ({ row }) => row.original.name ?? "—" },
      {
        accessorKey: "action",
        header: "Event",
        cell: ({ row }) => {
          const action = row.original.action;
          return (
            <span
              className={[
                "rounded px-2 py-0.5 text-xs",
                action === "LOGIN"
                  ? "bg-green-100 text-green-700"
                  : action === "LOGOUT"
                  ? "bg-red-100 text-red-700"
                  : "bg-slate-100 text-slate-700",
              ].join(" ")}
            >
              {action}
            </span>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const s = getStatus(row.original);
          return (
            <span
              className={[
                "rounded px-2 py-0.5 text-xs",
                s === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-700",
              ].join(" ")}
            >
              {s}
            </span>
          );
        },
      },
      {
        id: "view",
        header: "View",
        cell: ({ row }) => (
          <Button size="sm" variant="outline" onClick={() => setSelected(row.original)}>
            View
          </Button>
        ),
      },
    ],
    [statusMap]
  );

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">System Logs</h2>
        <div className="flex items-center gap-3">
          <div
            className={[
              "rounded px-2 py-0.5 text-xs",
              connected ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700",
            ].join(" ")}
          >
            {connected ? "Live: Connected" : "Live: Disconnected"}
          </div>
          <Button variant="outline" onClick={addTestLog}>
            Add Test Log
          </Button>
          <Button variant="outline" onClick={() => (window.location.href = "/c/new")}>
            Back to Chat
          </Button>
        </div>
      </div>

      <DataTable columns={columns} data={rows.map((r, i) => ({ ...r, id: r._id || i }))} />

      <Dialog open={!!selected} onOpenChange={v => !v && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Log Details</DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="font-medium">Time:</span>{" "}
                  {new Date(selected.timestamp).toLocaleString()}
                </div>
                <div>
                  <span className="font-medium">Event:</span> {selected.action}
                </div>
                <div>
                  <span className="font-medium">Email:</span> {selected.email ?? "—"}
                </div>
                <div>
                  <span className="font-medium">Name:</span> {selected.name ?? "—"}
                </div>
              </div>

              {selected.tokenUsage ? (
                <div className="rounded-md border p-3">
                  <div className="mb-2 text-sm font-semibold">Model Usage</div>
                  <div className="text-xs space-y-1">
                    <div>
                      <span className="font-medium">Before:</span>{" "}
                      {selected.tokenUsage.beforeModelChange?.model ?? "-"} |
                      Tokens: {selected.tokenUsage.beforeModelChange?.totalTokens ?? 0} |
                      Msg: {selected.tokenUsage.beforeModelChange?.messageCount ?? 0}
                    </div>
                    <div>
                      <span className="font-medium">After:</span>{" "}
                      {selected.tokenUsage.afterModelChange?.model ?? "-"} |
                      Tokens: {selected.tokenUsage.afterModelChange?.totalTokens ?? 0} |
                      Msg: {selected.tokenUsage.afterModelChange?.messageCount ?? 0}
                    </div>
                    <div>
                      <span className="font-medium">Difference:</span>{" "}
                      {selected.tokenUsage.tokenDifference ?? 0}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border p-3">
                  <div className="mb-2 text-sm font-semibold">Details</div>
                  <pre className="max-h-64 overflow-auto rounded bg-surface-secondary p-2 text-xs">
                    {JSON.stringify(selected.details ?? {}, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
