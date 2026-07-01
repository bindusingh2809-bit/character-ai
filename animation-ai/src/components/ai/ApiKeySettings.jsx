import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { KeyRound, ChevronDown, Check, X } from 'lucide-react';

import { BYOK_PROVIDERS, getByokConfig, setByokConfig, clearByokConfig } from '@/ai/apiKeyStore';

/**
 * Lets the user opt in to paying for their own AI animation generation by
 * entering an API key for Anthropic / OpenAI / Gemini. When set, this key
 * is used instead of the developer's shared backend budget. Stored only in
 * this browser's localStorage — never in the project file, never synced.
 */
export function ApiKeySettings() {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(() => getByokConfig());
  const [providerId, setProviderId] = useState(saved?.provider || BYOK_PROVIDERS[0].id);
  const [apiKey, setApiKey] = useState('');

  const handleSave = () => {
    if (!apiKey.trim()) return;
    setByokConfig({ provider: providerId, apiKey: apiKey.trim() });
    setSaved(getByokConfig());
    setApiKey('');
    setOpen(false);
  };

  const handleClear = () => {
    clearByokConfig();
    setSaved(null);
    setApiKey('');
  };

  const activeProviderMeta = saved ? BYOK_PROVIDERS.find(p => p.id === saved.provider) : null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b shrink-0">
      <CollapsibleTrigger asChild>
        <button className="w-full px-3 py-2 flex items-center justify-between text-xs text-muted-foreground hover:bg-muted/50 transition-colors">
          <span className="flex items-center gap-1.5">
            <KeyRound className="size-3.5" />
            {saved ? (
              <span className="flex items-center gap-1">
                Using your {activeProviderMeta?.label || saved.provider} key
                <Badge variant="secondary" className="text-[10px] px-1 py-0">active</Badge>
              </span>
            ) : (
              'Use your own API key (optional)'
            )}
          </span>
          <ChevronDown className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="px-3 pb-3 space-y-2">
        <p className="text-xs text-muted-foreground">
          By default, generation runs on our shared model and we cover the cost. If you'd
          rather use your own Anthropic, OpenAI, or Gemini account, add a key below — it's
          stored only in this browser and sent straight to that provider.
        </p>

        <div className="flex gap-2">
          <Select value={providerId} onValueChange={setProviderId}>
            <SelectTrigger className="h-8 text-xs w-32 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BYOK_PROVIDERS.map(p => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste API key"
            className="h-8 text-xs"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={!apiKey.trim()} size="sm" className="h-7 text-xs flex-1">
            <Check className="size-3 mr-1" />
            Save key
          </Button>
          {saved && (
            <Button onClick={handleClear} variant="outline" size="sm" className="h-7 text-xs">
              <X className="size-3 mr-1" />
              Remove
            </Button>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}