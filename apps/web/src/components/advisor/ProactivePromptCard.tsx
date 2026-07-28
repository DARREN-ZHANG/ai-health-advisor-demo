'use client';

import type {
  AdvisorProactiveAction,
  AdvisorProactivePrompt,
} from '@health-advisor/shared';

interface ProactivePromptCardProps {
  prompt: AdvisorProactivePrompt;
  status: 'pending' | 'accepted' | 'declined';
  disabled: boolean;
  onAction: (action: AdvisorProactiveAction) => void;
}

/** Agent 主动提议卡：所有动作都回传 typed interaction，不直接改业务 Store。 */
export function ProactivePromptCard({
  prompt,
  status,
  disabled,
  onAction,
}: ProactivePromptCardProps) {
  return (
    <div
      data-valo-proactive-prompt={prompt.kind}
      data-valo-proactive-status={status}
      className="mt-2 w-full rounded-2xl border border-[var(--valo-border)] bg-[var(--valo-surface)] p-4 shadow-sm"
    >
      <p className="text-sm font-medium leading-relaxed text-[var(--valo-text-primary)]">
        {prompt.question}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {prompt.actions.map((action) => {
          const selected =
            (status === 'accepted' && action.interaction.decision === 'accept') ||
            (status === 'declined' && action.interaction.decision === 'decline');
          return (
            <button
              key={action.id}
              type="button"
              disabled={disabled || status !== 'pending'}
              onClick={() => onAction(action)}
              data-valo-proactive-action={action.interaction.decision}
              className={
                'rounded-full px-3.5 py-2 text-xs font-semibold transition-opacity ' +
                'focus:outline-none focus-visible:shadow-[var(--valo-focus-ring)] disabled:cursor-default ' +
                (action.interaction.decision === 'accept'
                  ? 'bg-[var(--valo-prime)] text-[var(--valo-canvas)]'
                  : 'border border-[var(--valo-border)] text-[var(--valo-text-secondary)]') +
                (status !== 'pending' && !selected ? ' opacity-40' : '')
              }
            >
              {action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
