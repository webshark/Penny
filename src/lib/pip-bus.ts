/**
 * Pip reacts to what happens anywhere in the app. Anything can send a reaction; every Pip on screen plays it,
 * then settles back into the mood the household's finances give it.
 */
export const PIP_EVENT = "penny:pip";

export type PipReaction =
  | { kind: "play"; action: "affirm" | "success" | "failure" | "wary" | "inspect" | "surprise" | "love" | "random" | "bored" | "refuse" | "angry" }
  | { kind: "waiting"; on: boolean }
  | { kind: "typing"; on: boolean };

export function pip(reaction: PipReaction) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<PipReaction>(PIP_EVENT, { detail: reaction }));
}

