import { createContext, useContext } from "react";
import type { Topic } from "../types";
import type { TopicAction } from "../lib/hotovo";
import type { LastSession, RetrievalMethod } from "../lib/sessions";

export type TopicActions = {
  run: (topic: Topic, action: TopicAction) => void;
  /** Fáze 6: open the session sheet (method + skóre), optionally with a method picked. */
  openSession: (topic: Topic, method?: RetrievalMethod) => void;
  /** Fáze 7 B: open the Fáze checklist from the topic's page body. */
  openChecklist: (topic: Topic) => void;
  pending: ReadonlySet<string>;
  /** Last Tréninky session per topic page ID, for the skóre chip. */
  lastSession: (topicId: string) => LastSession | undefined;
};

export const TopicActionsContext = createContext<TopicActions | null>(null);

export function useTopicActions(): TopicActions | null {
  return useContext(TopicActionsContext);
}
