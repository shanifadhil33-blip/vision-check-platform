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
