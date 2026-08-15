import { redirect } from "next/navigation";

/**
 * Redirect /interaction/[uid] to /consent/[uid].
 * This route exists because oidc-provider's interactions.url config returns
 * /interaction/[uid], but the actual consent UI lives at /consent/[uid].
 */
export default function InteractionPage({
  params,
}: {
  params: { uid: string };
}) {
  redirect(`/consent/${params.uid}`);
}