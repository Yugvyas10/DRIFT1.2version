/** The part of an exchange a schema is checked in: one parameter, a request body media type, or a response. */
export type Slot =
  | { part: "param"; key: string }
  | { part: "body"; mediaType: string }
  | { part: "response"; status: string; mediaType: string };

/**
 * Where in an operation a change sits, so Verify can tell which change a failing sample proves.
 * A change reached from several places (a component used in two media types) has several anchors.
 * Anchors are internal to the engine and are not part of the report.
 */
export type Anchor =
  | { at: "operation" }
  | { at: "param"; key: string }
  | { at: "body" }
  | { at: "status"; status: string }
  | { at: "media"; part: "body"; mediaType: string }
  | { at: "media"; part: "response"; status: string; mediaType: string }
  | { at: "schema"; slot: Slot; nodes: { base: string; head: string } };

export function sameSlot(a: Slot, b: Slot): boolean {
  if (a.part === "param") return b.part === "param" && a.key === b.key;
  if (a.part === "body") return b.part === "body" && a.mediaType === b.mediaType;
  return b.part === "response" && a.status === b.status && a.mediaType === b.mediaType;
}
