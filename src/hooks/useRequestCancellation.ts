import { useCallback } from 'react';
import { abortRegisteredLocalRequest } from '@/lib/requestCancellation';
import { isLocalApiEnabled, localApiRequestJson } from '@/lib/localApi';
import { supabase } from '@/lib/supabase';

export function useRequestCancellation() {
  const cancelRequest = useCallback(async (messageId: string) => {
    if (isLocalApiEnabled) {
      try {
        await localApiRequestJson<void, { messageId: string }>(
          '/api/v1/chat/cancel',
          {
            method: 'POST',
            body: { messageId },
          },
        );
      } finally {
        abortRegisteredLocalRequest(messageId);
      }
      return;
    }

    const channelName = `cancel-request-${messageId}`;

    // Create a temporary channel to broadcast the cancellation
    const channel = supabase.channel(channelName);

    try {
      // Subscribe to the channel first
      channel.subscribe();

      // Broadcast the cancellation signal
      await channel.send({
        type: 'broadcast',
        event: 'cancel',
        payload: { messageId, timestamp: Date.now() },
      });

      console.log(`Sent cancellation signal for message ${messageId}`);
    } catch (error) {
      console.error('Failed to send cancellation signal:', error);
    } finally {
      // Clean up the channel
      supabase.removeChannel(channel);
    }
  }, []);

  return { cancelRequest };
}
