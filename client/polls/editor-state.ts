import { parseSlots } from "../../shared/polls";

export type OwnResponse = { name: string; slots: string };
export type ResponseDraft = { name: string; slots: number[] };
export type EditorState = ResponseDraft & {
  joined: boolean;
  revision: number;
  savedRevision: number;
  pending: number;
  status: string;
};

type EditorEvent =
  | { type: "receive"; mine?: OwnResponse; defaultName: string }
  | { type: "name"; name: string }
  | { type: "paint"; index: number; add: boolean }
  | { type: "saving" }
  | { type: "saved"; revision: number; joining: boolean }
  | { type: "failed"; revision: number; message: string };

export function initialEditor(mine: OwnResponse | undefined, defaultName: string): EditorState {
  return {
    name: mine?.name ?? defaultName,
    slots: mine ? parseSlots(mine.slots) : [],
    joined: Boolean(mine), revision: 0, savedRevision: 0, pending: 0, status: "",
  };
}

export function editorState(state: EditorState, event: EditorEvent): EditorState {
  switch (event.type) {
    case "receive": {
      if (state.revision !== state.savedRevision || state.pending) return state;
      if (event.mine) return { ...state, name: event.mine.name, slots: parseSlots(event.mine.slots), joined: true };
      if (state.joined) return initialEditor(undefined, event.defaultName);
      return state.revision === 0 ? { ...state, name: event.defaultName } : state;
    }
    case "name":
      return { ...state, name: event.name, revision: state.revision + 1, status: state.joined ? "Unsaved changes" : state.status };
    case "paint":
      return {
        ...state,
        slots: event.add ? [...new Set([...state.slots, event.index])] : state.slots.filter(index => index !== event.index),
        revision: state.revision + 1, status: "Unsaved changes",
      };
    case "saving":
      return { ...state, pending: state.pending + 1, status: "Saving…" };
    case "saved":
      return {
        ...state, pending: state.pending - 1, joined: true,
        savedRevision: Math.max(state.savedRevision, event.revision),
        status: state.pending > 1 ? "Saving…" : state.revision !== event.revision ? "Unsaved changes"
          : event.joining ? "Saved. Paint the grid to add your availability." : "Saved",
      };
    case "failed":
      return { ...state, pending: state.pending - 1, status: state.revision === event.revision ? event.message : "Unsaved changes" };
  }
}
