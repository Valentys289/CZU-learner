import { createContext, useContext } from "react";
import type { Topic } from "../types";
import type { TopicAction } from "../lib/hotovo";

export type TopicActions = {
  run: (topic: Topic, action: TopicAction) => void;
  pending: ReadonlySet<string>;
};

export const TopicActionsContext = createContext<TopicActions | null>(null);

export function useTopicActions(): TopicActions | null {
  return useContext(TopicActionsContext);
}
