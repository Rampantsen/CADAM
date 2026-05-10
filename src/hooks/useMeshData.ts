import { useConversation } from '@/contexts/ConversationContext';
import {
  downloadLocalConversationFile,
  isLocalApiEnabled,
  listLocalConversationFiles,
} from '@/lib/localApi';
import { supabase } from '@/lib/supabase';
import { MeshData, Prompt } from '@shared/types';
import { useQuery } from '@tanstack/react-query';

export const useMeshData = ({ id }: { id: string }) => {
  const { conversation } = useConversation();

  const dataQuery = useQuery({
    queryKey: [
      'meshData',
      isLocalApiEnabled ? 'local' : 'supabase',
      conversation.id,
      id,
    ],
    enabled: !!id,
    queryFn: async () => {
      if (isLocalApiEnabled) {
        const files = await listLocalConversationFiles(conversation.id);
        const mesh = files.meshes.find((item) => item.id === id);
        if (!mesh) {
          throw new Error('Mesh not found');
        }
        return {
          ...mesh,
          prompt: mesh.prompt as Prompt,
        } as MeshData;
      }

      const { data, error } = await supabase
        .from('meshes')
        .select('*')
        .eq('id', id)
        .limit(1)
        .single()
        .overrideTypes<MeshData>();

      if (error) {
        throw error;
      }

      return data;
    },
    // Poll while pending to ensure UI progresses past 95% as soon as status flips
    refetchInterval: (query) => {
      const current = query.state.data as MeshData | undefined;
      return current && current.status === 'pending' ? 3000 : false;
    },
  });

  const blobQuery = useQuery({
    queryKey: [
      'mesh',
      isLocalApiEnabled ? 'local' : 'supabase',
      conversation.id,
      id,
    ],
    enabled:
      !!id &&
      !dataQuery.isLoading &&
      dataQuery.data &&
      dataQuery.data.status === 'success',
    queryFn: async () => {
      if (isLocalApiEnabled) {
        return downloadLocalConversationFile(conversation.id, 'meshes', id);
      }

      const fileExtension = dataQuery.data?.file_type || 'glb';
      const { data, error } = await supabase.storage
        .from('meshes')
        .download(
          `${conversation.user_id}/${conversation.id}/${id}.${fileExtension}`,
        );

      if (error) {
        throw error;
      }

      return data;
    },
    refetchOnMount: false,
  });

  return {
    data: dataQuery,
    blob: blobQuery,
  };
};
