import { useConversation } from '@/contexts/ConversationContext';
import {
  downloadLocalConversationFile,
  isLocalApiEnabled,
  listLocalConversationFiles,
} from '@/lib/localApi';
import { supabase } from '@/lib/supabase';
import { Prompt } from '@shared/types';
import { useQueries, useQuery } from '@tanstack/react-query';

function blobToDataUrl(blob: Blob) {
  const reader = new FileReader();
  const urlPromise = new Promise<string>((resolve) => {
    reader.onload = () => {
      resolve(reader.result as string);
    };
  });
  reader.readAsDataURL(blob);
  return urlPromise;
}

export function useImageData(id: string) {
  const { conversation } = useConversation();

  const dataQuery = useQuery({
    queryKey: [
      'imageData',
      isLocalApiEnabled ? 'local' : 'supabase',
      conversation.user_id,
      conversation.id,
      id,
    ],
    queryFn: async () => {
      if (isLocalApiEnabled) {
        const files = await listLocalConversationFiles(conversation.id);
        const image = files.images.find((item) => item.id === id);
        if (!image) {
          throw new Error('Image not found');
        }
        return {
          ...image,
          prompt: image.prompt as Prompt,
        };
      }

      const { data, error } = await supabase
        .from('images')
        .select('*')
        .eq('id', id)
        .single()
        .overrideTypes<{
          prompt: Prompt;
        }>();

      if (error) {
        throw error;
      }

      return data;
    },
    refetchInterval: (query) => {
      if (query.state.data?.status === 'pending') {
        return 10 * 1000;
      }
      return false;
    },
  });

  const urlQuery = useQuery({
    queryKey: [
      'image',
      isLocalApiEnabled ? 'local' : 'supabase',
      conversation.user_id,
      conversation.id,
      id,
    ],
    enabled: dataQuery.data?.status === 'success',
    queryFn: async () => {
      if (isLocalApiEnabled) {
        const blob = await downloadLocalConversationFile(
          conversation.id,
          'images',
          id,
        );
        const url = await blobToDataUrl(blob);
        return { id, url };
      }

      const { data } = await supabase.storage
        .from('images')
        .download(`${conversation.user_id}/${conversation.id}/${id}`);
      if (!data) {
        throw new Error('Failed to download image');
      }
      const url = await blobToDataUrl(data);
      return { id, url };
    },
  });

  return { data: dataQuery, url: urlQuery };
}

export function useImagesData(ids: string[]) {
  const { conversation } = useConversation();

  const dataQueries = useQueries({
    queries: ids.map((id) => ({
      queryKey: [
        'imageData',
        isLocalApiEnabled ? 'local' : 'supabase',
        conversation.user_id,
        conversation.id,
        id,
      ],
      enabled: !!id,
      queryFn: async () => {
        if (isLocalApiEnabled) {
          const files = await listLocalConversationFiles(conversation.id);
          const image = files.images.find((item) => item.id === id);
          if (!image) {
            throw new Error('Image not found');
          }
          return {
            ...image,
            prompt: image.prompt as Prompt,
          };
        }

        const { data, error } = await supabase
          .from('images')
          .select('*')
          .eq('id', id)
          .single()
          .overrideTypes<{
            prompt: Prompt;
          }>();

        if (error) {
          throw error;
        }

        return data;
      },
    })),
  });

  const urlQueries = useQueries({
    queries: ids.map((id) => ({
      queryKey: [
        'image',
        isLocalApiEnabled ? 'local' : 'supabase',
        conversation.user_id,
        conversation.id,
        id,
      ],
      enabled: dataQueries.some(
        (query) =>
          query.data && query.data.id === id && query.data.status === 'success',
      ),
      queryFn: async () => {
        if (isLocalApiEnabled) {
          const blob = await downloadLocalConversationFile(
            conversation.id,
            'images',
            id,
          );
          const url = await blobToDataUrl(blob);
          return { id, url };
        }

        const { data } = await supabase.storage
          .from('images')
          .download(`${conversation.user_id}/${conversation.id}/${id}`);
        if (!data) {
          throw new Error('Failed to download image');
        }
        const url = await blobToDataUrl(data);
        return { id, url };
      },
    })),
  });

  return { data: dataQueries, url: urlQueries };
}
