import { useMessages } from "next-intl";
import type en from "@/i18n/messages/en.json";

export type StudioCopy = (typeof en)["studioCopy"];

/** The studio's copy from the message files (namespace studioCopy), as one object since the studio passes it around whole. */
export function useStudioCopy(): StudioCopy {
  return (useMessages() as unknown as { studioCopy: StudioCopy }).studioCopy;
}
