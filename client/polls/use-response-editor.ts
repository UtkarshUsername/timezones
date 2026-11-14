import { useCallback, useEffect, useReducer, useRef } from "preact/hooks";
import { client } from "./api";
import { editorState, initialEditor } from "./editor-state";
import type { OwnResponse, ResponseDraft } from "./editor-state";

const AUTOSAVE_DELAY = 600;

export function useResponseEditor(id: string, mine: OwnResponse | undefined, defaultName: string) {
  const save = client.useMutation("saveResponse");
  const [state, dispatch] = useReducer(editorState, initialEditor(mine, defaultName));
  const queue = useRef(Promise.resolve());
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    dispatch({ type: "receive", mine, defaultName });
  }, [mine?.name, mine?.slots, defaultName, state.pending, state.revision !== state.savedRevision]);

  const persist = useCallback((draft: ResponseDraft, revision: number, joining: boolean) => {
    dispatch({ type: "saving" });
    queue.current = queue.current.then(async () => {
      if (!active.current) return;
      try {
        await save(id, draft.name, JSON.stringify(draft.slots));
        if (active.current) dispatch({ type: "saved", revision, joining });
      } catch (error) {
        if (active.current) dispatch({ type: "failed", revision, message: error instanceof Error ? error.message : joining ? "Could not join" : "Could not save" });
      }
    });
    return queue.current;
  }, [id, save]);

  const { joined, revision, savedRevision, name, slots } = state;
  const dirty = revision !== savedRevision;
  useEffect(() => {
    if (!joined || !dirty || !name.trim()) return;
    const timer = setTimeout(() => { void persist({ name, slots }, revision, false); }, AUTOSAVE_DELAY);
    return () => clearTimeout(timer);
  }, [joined, dirty, name, slots, revision, persist]);

  function join(event: Event) {
    event.preventDefault();
    if (!state.pending && name.trim()) void persist({ name, slots }, revision, !joined);
  }
  return {
    name, selected: slots, joined, status: state.status, busy: state.pending > 0,
    rename: (name: string) => dispatch({ type: "name", name }),
    paint: (index: number, add: boolean) => dispatch({ type: "paint", index, add }),
    join,
  };
}
