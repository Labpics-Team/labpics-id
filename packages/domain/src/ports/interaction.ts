import type { TransactionContext } from "./unit-of-work";

export interface ProtocolInteractionDetails {
  readonly uid: string;
  readonly clientId: string;
  readonly clientName: string | null;
  readonly clientLogoUri: string | null;
  readonly requestedScopes: readonly string[];
  readonly redirectUri: string;
  readonly nonce: string | null;
  readonly state: string | null;
  readonly subjectId: string | null;
  readonly sessionId: string | null;
  readonly resumeUrl: string | null;
}

export interface ProtocolInteractionSession {
  readonly subjectId: string;
  readonly sessionId: string;
}

export interface ProtocolInteractionResult {
  readonly login: {
    readonly accountId: string;
    readonly remember: boolean;
  };
  readonly consent: {
    readonly reject: boolean;
    readonly scope?: readonly string[];
  };
}

export interface InteractionPort {
  getInteractionDetails(
    uid: string,
    ctx?: TransactionContext,
  ): Promise<ProtocolInteractionDetails | null>;

  setInteractionSession(
    uid: string,
    session: ProtocolInteractionSession,
    ctx?: TransactionContext,
  ): Promise<void>;

  finishInteraction(
    uid: string,
    result: ProtocolInteractionResult,
    mergeWithLastSubmission: boolean,
    ctx?: TransactionContext,
  ): Promise<void>;
}