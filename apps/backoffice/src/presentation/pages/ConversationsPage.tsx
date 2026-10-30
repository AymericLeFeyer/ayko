import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ConversationDetail } from '@ayko/contracts';
import { chatApi } from '@/infrastructure/api';
import { EmptyState, PageHeader, Panel, QueryState } from '@/presentation/components/common';
import { Badge } from '@/presentation/components/ui/badge';
import { Button } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';
import { downloadFile, formatDate } from '@/shared/format';

const SOURCE = { playground: 'Terrain de jeu', display: 'Tablette', api: 'API' };

function toMarkdown(conversation: ConversationDetail) {
  const body = conversation.messages
    .map((message) => `**${message.role === 'user' ? 'Demande' : 'Ayko'}** : ${message.content}`)
    .join('\n\n');
  return `# ${conversation.title}\n\n${body}\n`;
}

function Detail({ id }: { id: string }) {
  const navigate = useNavigate();
  const detail = useQuery({
    queryKey: ['conversations', id],
    queryFn: () => chatApi.conversation(id),
  });
  return (
    <QueryState query={detail}>
      {(data) => (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadFile(`conversation-${id}.json`, JSON.stringify(data, null, 2))}
            >
              Exporter en JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadFile(`conversation-${id}.md`, toMarkdown(data), 'text/markdown')
              }
            >
              Exporter en Markdown
            </Button>
          </div>
          <ul className="space-y-3">
            {data.messages.map((message) => (
              <li key={message.id}>
                <p className={message.role === 'user' ? 'font-semibold' : ''}>{message.content}</p>
                <p className="text-muted-foreground flex gap-3 text-xs">
                  {formatDate(message.createdAt)}
                  {message.requestId && (
                    <Link className="hover:underline" to={`/traces/${message.requestId}`}>
                      Trace
                    </Link>
                  )}
                  {message.role === 'user' && (
                    <button
                      className="hover:underline"
                      onClick={() =>
                        navigate('/terrain-de-jeu', { state: { text: message.content } })
                      }
                    >
                      Rejouer
                    </button>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </QueryState>
  );
}

export function ConversationsPage() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const conversations = useInfiniteQuery({
    queryKey: ['conversations', 'list', search],
    queryFn: ({ pageParam }) => chatApi.conversations({ search, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const items = conversations.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <PageHeader title="Conversations" intro="Tout ce qui a été demandé à Ayko." />
      <Input
        aria-label="Rechercher"
        className="mb-4 max-w-sm"
        placeholder="Rechercher dans les messages"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {conversations.isError && <p role="alert">{conversations.error.message}</p>}
      {!conversations.isPending && items.length === 0 ? (
        <EmptyState
          title={search ? 'Aucune conversation trouvée' : 'Aucune conversation'}
          hint={search ? 'Essayez un autre mot.' : 'Lancez-en une depuis le terrain de jeu.'}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
          <div>
            <Panel className="divide-y p-0">
              {items.map((conversation) => (
                <button
                  key={conversation.id}
                  aria-current={selected === conversation.id}
                  onClick={() => setSelected(conversation.id)}
                  className="hover:bg-accent aria-[current=true]:bg-accent block w-full px-3 py-2 text-left"
                >
                  <p className="truncate font-medium">{conversation.title}</p>
                  <p className="text-muted-foreground flex items-center gap-2 text-xs">
                    {formatDate(conversation.updatedAt)}
                    <Badge variant="outline">
                      {conversation.roomName ?? SOURCE[conversation.source]}
                    </Badge>
                  </p>
                </button>
              ))}
            </Panel>
            {conversations.hasNextPage && (
              <Button variant="ghost" size="sm" onClick={() => void conversations.fetchNextPage()}>
                Afficher plus
              </Button>
            )}
          </div>
          <div className="min-w-0">
            {selected ? (
              <Detail id={selected} />
            ) : (
              <EmptyState title="Choisissez une conversation" />
            )}
          </div>
        </div>
      )}
    </>
  );
}
