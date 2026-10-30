import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { VoiceProvider, VoiceProviderKind, VoiceSlot } from '@ayko/contracts';
import { voiceApi } from '@/infrastructure/api';
import { Field, PageHeader, Panel, QueryState, Section } from '@/presentation/components/common';
import { Button } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/presentation/components/ui/select';
import { useAction } from '@/presentation/hooks/useAction';

const SLOTS: Record<VoiceSlot, string> = {
  wake_word: "Mot d'éveil",
  stt: 'Reconnaissance vocale (STT)',
  tts: 'Synthèse vocale (TTS)',
};
const KINDS: Record<VoiceProviderKind, string> = {
  fake: 'Factice',
  wyoming: 'Wyoming',
  openai_http: 'HTTP compatible OpenAI',
  stdio: 'Binaire local (stdio)',
};

export function VoicePage() {
  const providers = useQuery({ queryKey: ['voice'], queryFn: voiceApi.list });
  const [draft, setDraft] = useState<VoiceProvider[]>([]);
  useEffect(() => {
    if (providers.data) setDraft(providers.data);
  }, [providers.data]);

  const save = useAction(() => voiceApi.save(draft), {
    success: 'Configuration vocale enregistrée',
    invalidate: ['voice'],
  });
  const test = useAction((id: string) => voiceApi.test(id), {
    onDone: (result) => (result.ok ? toast.success(result.message) : toast.error(result.message)),
  });
  const patch = (id: string, change: Partial<VoiceProvider>) =>
    setDraft((list) => list.map((item) => (item.id === id ? { ...item, ...change } : item)));
  const patchConfig = (provider: VoiceProvider, change: Partial<VoiceProvider['config']>) =>
    patch(provider.id, { config: { ...provider.config, ...change } });

  return (
    <>
      <PageHeader
        title="Voix"
        intro="Les emplacements sont prêts ; les vrais moteurs arriveront dans une phase ultérieure. Le fournisseur factice est actif en attendant."
      />
      <QueryState query={providers}>
        {() => (
          <>
            {draft.map((provider) => (
              <Section key={provider.id} title={SLOTS[provider.slot]}>
                <Panel className="grid gap-3 md:grid-cols-3">
                  <Field label="Fournisseur">
                    <Select
                      value={provider.kind}
                      onValueChange={(value) =>
                        patch(provider.id, { kind: value as VoiceProviderKind })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(KINDS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Adresse">
                    <Input
                      value={provider.config.address ?? ''}
                      onChange={(event) => patchConfig(provider, { address: event.target.value })}
                    />
                  </Field>
                  <Field label="Langue">
                    <Input
                      value={provider.config.language ?? ''}
                      onChange={(event) => patchConfig(provider, { language: event.target.value })}
                    />
                  </Field>
                  {provider.slot === 'tts' && (
                    <Field label="Voix">
                      <Input
                        value={provider.config.voice ?? ''}
                        onChange={(event) => patchConfig(provider, { voice: event.target.value })}
                      />
                    </Field>
                  )}
                  {provider.slot === 'wake_word' && (
                    <>
                      <Field label="Mot d'éveil">
                        <Input
                          value={provider.config.wakeWord ?? ''}
                          onChange={(event) =>
                            patchConfig(provider, { wakeWord: event.target.value })
                          }
                        />
                      </Field>
                      <Field label="Sensibilité (0 à 1)">
                        <Input
                          type="number"
                          min={0}
                          max={1}
                          step={0.05}
                          value={provider.config.sensitivity ?? ''}
                          onChange={(event) =>
                            patchConfig(provider, { sensitivity: Number(event.target.value) })
                          }
                        />
                      </Field>
                    </>
                  )}
                  <div className="flex items-end">
                    <Button variant="outline" onClick={() => test.mutate(provider.id)}>
                      Tester
                    </Button>
                  </div>
                </Panel>
              </Section>
            ))}
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              Enregistrer
            </Button>
            <p className="text-muted-foreground mt-2 text-sm">
              Le test utilise la configuration enregistrée.
            </p>
          </>
        )}
      </QueryState>
    </>
  );
}
