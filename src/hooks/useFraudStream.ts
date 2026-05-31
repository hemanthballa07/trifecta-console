"use client";

import { useEffect, useRef, useState } from "react";
import type { FraudEvent } from "@/types";
import { FLUXA_BASE } from "@/lib/api";

const MAX_EVENTS = 200;

export type StreamStatus = "connecting" | "live" | "error" | "closed";

export function useFraudStream(limit = 50) {
  const [events, setEvents] = useState<FraudEvent[]>([]);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const url = `${FLUXA_BASE}/fraud-events?limit=${limit}`;

    function connect() {
      const es = new EventSource(url);
      esRef.current = es;
      setStatus("connecting");

      es.onopen = () => setStatus("live");

      es.onmessage = (e) => {
        try {
          const fe = JSON.parse(e.data) as FraudEvent;
          setEvents((prev) => {
            if (prev.some((p) => p.flag_id === fe.flag_id)) return prev;
            const next = [fe, ...prev];
            return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next;
          });
        } catch {
          // malformed SSE data — skip
        }
      };

      es.onerror = () => {
        setStatus("error");
        es.close();
        setTimeout(connect, 5000);
      };

      return es;
    }

    const es = connect();
    return () => {
      es.close();
      esRef.current = null;
    };
  }, [limit]);

  return { events, status };
}
