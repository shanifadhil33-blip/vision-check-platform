import {
  REALTIME_SUBSCRIBE_STATES,
  type RealtimeChannel,
} from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/db/client";

const NUDGE_EVENT = "nudge";

export type SessionChannel = {
  sendNudge: (kind: string) => Promise<boolean>;
  leave: () => void;
};

/**
 * Public broadcast channel named by session id. Nudge only — never act on payload.
 * Send only after subscribe reports SUBSCRIBED.
 */
export function joinSessionChannel(
  sessionId: string,
  onNudge: () => void,
): SessionChannel {
  const supabase = getSupabaseBrowserClient();
  let subscribed = false;
  let left = false;

  const channel: RealtimeChannel = supabase.channel(sessionId, {
    config: {
      private: false,
      broadcast: { self: false, ack: false },
    },
  });

  channel.on("broadcast", { event: NUDGE_EVENT }, () => {
    if (!left) {
      onNudge();
    }
  });

  channel.subscribe((status) => {
    if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
      subscribed = true;
    }
  });

  return {
    async sendNudge(kind: string): Promise<boolean> {
      if (left || !subscribed) {
        return false;
      }
      const result = await channel.send({
        type: "broadcast",
        event: NUDGE_EVENT,
        payload: { kind },
      });
      return result === "ok";
    },
    leave(): void {
      left = true;
      subscribed = false;
      void supabase.removeChannel(channel);
    },
  };
}

export type SessionChannelWithBroadcasts = SessionChannel & {
  /** Sends one broadcast event. False when not subscribed yet, left, or the send failed. */
  sendBroadcast: (event: string, payload: { [key: string]: unknown }) => Promise<boolean>;
};

/**
 * Movement detection only. The same public channel and nudge as
 * joinSessionChannel, plus listeners for the named broadcast events,
 * registered before subscribe, and a sender for them. Payloads reach
 * onBroadcast unchecked; the caller parses them.
 */
export function joinSessionChannelWithBroadcasts(
  sessionId: string,
  onNudge: () => void,
  events: readonly string[],
  onBroadcast: (event: string, payload: unknown) => void,
): SessionChannelWithBroadcasts {
  const supabase = getSupabaseBrowserClient();
  let subscribed = false;
  let left = false;

  const channel: RealtimeChannel = supabase.channel(sessionId, {
    config: {
      private: false,
      broadcast: { self: false, ack: false },
    },
  });

  channel.on("broadcast", { event: NUDGE_EVENT }, () => {
    if (!left) {
      onNudge();
    }
  });

  for (const event of events) {
    channel.on("broadcast", { event }, (message: { payload?: unknown }) => {
      if (!left) {
        onBroadcast(event, message.payload);
      }
    });
  }

  channel.subscribe((status) => {
    if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
      subscribed = true;
    }
  });

  async function send(event: string, payload: { [key: string]: unknown }): Promise<boolean> {
    if (left || !subscribed) {
      return false;
    }
    try {
      const result = await channel.send({ type: "broadcast", event, payload });
      return result === "ok";
    } catch {
      return false;
    }
  }

  return {
    sendNudge(kind: string): Promise<boolean> {
      return send(NUDGE_EVENT, { kind });
    },
    sendBroadcast: send,
    leave(): void {
      left = true;
      subscribed = false;
      void supabase.removeChannel(channel);
    },
  };
}
