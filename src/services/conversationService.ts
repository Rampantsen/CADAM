import { useAuth } from '@/contexts/AuthContext';
import { Conversation, Content, Message } from '@shared/types';
import {
  generateLocalConversationTitle,
  isLocalApiEnabled,
  localApiRequestJson,
} from '@/lib/localApi';
import { supabase } from '@/lib/supabase';
import { HistoryConversation } from '@/types/misc';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';

const defaultConversation: Conversation = {
  id: '',
  title: '',
  current_message_leaf_id: null,
  user_id: '',
  created_at: '',
  updated_at: '',
  privacy: 'private',
  type: 'parametric',
  settings: null,
};

type ConversationUpdatePayload = Partial<
  Pick<
    Conversation,
    | 'title'
    | 'type'
    | 'privacy'
    | 'settings'
    | 'current_message_leaf_id'
  >
>;

function toHistoryConversation(
  conversation: Conversation,
  firstMessage: Content = { text: '' },
  messageCount = 0,
): HistoryConversation {
  return {
    ...conversation,
    created_at: conversation.created_at || new Date().toISOString(),
    updated_at:
      conversation.updated_at ||
      conversation.created_at ||
      new Date().toISOString(),
    first_message: {
      text: firstMessage.text ?? '',
      images: firstMessage.images ?? [],
    },
    message_count: messageCount,
  };
}

export async function listConversations(
  userId: string,
): Promise<Conversation[]> {
  if (isLocalApiEnabled) {
    return localApiRequestJson<Conversation[]>('/api/v1/conversations');
  }

  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .order('updated_at', { ascending: false })
    .eq('user_id', userId);

  if (error) throw error;

  return data as Conversation[];
}

export async function listRecentConversations(
  userId: string,
  limit = 10,
): Promise<Conversation[]> {
  if (isLocalApiEnabled) {
    const conversations = await listConversations(userId);
    return conversations.slice(0, limit);
  }

  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .order('updated_at', { ascending: false })
    .eq('user_id', userId)
    .limit(limit);

  if (error) throw error;

  return data as Conversation[];
}

export async function listHistoryConversations(
  userId: string,
): Promise<HistoryConversation[]> {
  if (isLocalApiEnabled) {
    const conversations = await listConversations(userId);

    return Promise.all(
      conversations.map(async (conversation) => {
        const messages = await localApiRequestJson<Message[]>(
          `/api/v1/conversations/${conversation.id}/messages`,
        );
        const firstMessage = messages[0]?.content ?? { text: '' };

        return toHistoryConversation(
          conversation,
          firstMessage,
          messages.length,
        );
      }),
    );
  }

  const { data: conversationsData, error: conversationsError } = await supabase
    .from('conversations')
    .select(`*, first_message:messages(content), messagesCount:messages(count)`)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1, { referencedTable: 'first_message' });

  if (conversationsError) throw conversationsError;

  return conversationsData.map((conv) => {
    const rawContent = conv.first_message?.[0]?.content;
    const firstMessageContent =
      typeof rawContent === 'object' && rawContent !== null
        ? (rawContent as Content)
        : { text: '' };
    const messageCount = conv.messagesCount?.[0]?.count ?? 0;

    return toHistoryConversation(
      conv as Conversation,
      firstMessageContent,
      messageCount,
    );
  });
}

export async function updateConversationFields(
  conversationId: string,
  payload: ConversationUpdatePayload,
) {
  if (isLocalApiEnabled) {
    return localApiRequestJson<Conversation, ConversationUpdatePayload>(
      `/api/v1/conversations/${conversationId}`,
      {
        method: 'PATCH',
        body: payload,
      },
    );
  }

  const { data, error } = await supabase
    .from('conversations')
    .update(payload)
    .eq('id', conversationId)
    .select()
    .single();

  if (error) throw error;

  return data as Conversation;
}

export async function deleteConversationById(
  conversationId: string,
  userId: string,
) {
  if (isLocalApiEnabled) {
    await localApiRequestJson<void>(
      `/api/v1/conversations/${conversationId}`,
      {
        method: 'DELETE',
      },
    );
    return;
  }

  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', conversationId);

  if (error) throw error;

  supabase.storage
    .from('images')
    .list(`${userId}/${conversationId}`)
    .then(({ data: list }) => {
      if (list) {
        const filesToRemove = list.map(
          (file) => `${userId}/${conversationId}/${file.name}`,
        );
        supabase.storage.from('images').remove(filesToRemove);
      }
    });
}

export function useConversation() {
  const { id: conversationId } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: conversation, isLoading: isConversationLoading } =
    useQuery<Conversation>({
      queryKey: ['conversation', conversationId],
      enabled: !!conversationId,
      refetchOnMount: false,
      queryFn: async () => {
        if (!conversationId) {
          throw new Error('Conversation ID is required');
        }
        if (!user?.id) {
          throw new Error('User must be authenticated');
        }

        if (isLocalApiEnabled) {
          return localApiRequestJson<Conversation>(
            `/api/v1/conversations/${conversationId}`,
          );
        }

        const { data, error } = await supabase
          .from('conversations')
          .select('*')
          .eq('id', conversationId)
          .eq('user_id', user.id)
          .limit(1)
          .single()
          .overrideTypes<Conversation>();

        if (error) {
          throw error;
        }
        return data as Conversation;
      },
    });

  const { mutate: updateConversation, mutateAsync: updateConversationAsync } =
    useMutation({
      mutationFn: async (conversation: Conversation) => {
        if (isLocalApiEnabled) {
          return localApiRequestJson<Conversation, Partial<Conversation>>(
            `/api/v1/conversations/${conversation.id}`,
            {
              method: 'PATCH',
              body: {
                title: conversation.title,
                type: conversation.type,
                privacy: conversation.privacy,
                settings: conversation.settings,
                current_message_leaf_id: conversation.current_message_leaf_id,
              },
            },
          );
        }

        const { data, error } = await supabase
          .from('conversations')
          .update(conversation)
          .eq('id', conversation.id)
          .select()
          .single();

        if (error) {
          throw error;
        }

        return data;
      },
      onMutate: async (conversation) => {
        // Cancel any outgoing refetches
        await queryClient.cancelQueries({
          queryKey: ['conversation', conversation.id],
        });

        // Snapshot the previous value
        const oldConversation = queryClient.getQueryData<Conversation>([
          'conversation',
          conversation.id,
        ]);

        // Optimistically update to the new value
        queryClient.setQueryData(
          ['conversation', conversation.id],
          conversation,
        );

        // Return a context object with the snapshotted value
        return { oldConversation };
      },
      onSuccess: (data) => {
        // Update the cache with the server response
        queryClient.setQueryData(['conversation', conversationId], data);

        // Only invalidate the conversations list, not the individual conversation
        // This prevents unnecessary refetch of the conversation we just updated
        queryClient.invalidateQueries({
          queryKey: ['conversations'],
        });
      },
      onError: (_error, conversation, context) => {
        // If the mutation fails, use the context returned from onMutate to roll back
        queryClient.setQueryData(
          ['conversation', conversation.id],
          context?.oldConversation,
        );
      },
    });

  return {
    conversation: conversation ?? defaultConversation,
    isConversationLoading,
    updateConversation,
    updateConversationAsync,
  };
}

export async function generateConversationTitle(
  conversationId: string,
  content: Content,
): Promise<string> {
  if (isLocalApiEnabled) {
    const data = await generateLocalConversationTitle({
      conversationId,
      content,
    });
    return data.title || 'New Conversation';
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('No active session');
  }

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/title-generator`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        content,
        conversationId,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to generate title: ${response.statusText}`);
  }

  const data = await response.json();
  return data.title || 'New Conversation';
}
