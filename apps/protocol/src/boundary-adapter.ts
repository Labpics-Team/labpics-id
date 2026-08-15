import { randomUUID } from "node:crypto";
import type { BoundaryClient } from "./boundary.ts";

/**
 * Boundary-backed adapter for oidc-provider.
 *
 * Bridges the oidc-provider adapter interface to the authenticated boundary
 * operations. For most models, this delegates to artifact.put/get/consume/delete.
 * For the Interaction model, it uses the specialized interaction.* operations
 * that carry structured consent ceremony data.
 */
export class BoundaryAdapter {
  readonly #boundaryClient: BoundaryClient;

  constructor(boundaryClient: BoundaryClient) {
    this.#boundaryClient = boundaryClient;
  }

  async upsert(model: string, id: string, payload: Record<string, unknown>): Promise<void> {
    if (model === "Interaction") {
      // For interactions, we store the payload and let the boundary
      // interpret it. The uid is the same as the id for interactions.
      await this.#boundaryClient.request({
        version: "1",
        correlationId: randomUUID(),
        operation: "artifact.put",
        payload: {
          model: "Interaction",
          artifactId: id,
          payload,
          uid: payload.uid as string | undefined,
        },
      });
      return;
    }

    const expValue = payload.exp;
    const expiresAt =
      typeof expValue === "number" ? new Date(expValue * 1000).toISOString() : undefined;

    await this.#boundaryClient.request({
      version: "1",
      correlationId: randomUUID(),
      operation: "artifact.put",
      payload: {
        model,
        artifactId: id,
        payload,
        expiresAt,
        grantId: (payload.grantId as string | undefined) ?? undefined,
        uid: (payload.uid as string | undefined) ?? undefined,
        userCode: (payload.userCode as string | undefined) ?? undefined,
      },
    });
  }

  async find(model: string, id: string): Promise<Record<string, unknown> | undefined> {
    const result = await this.#boundaryClient.request({
      version: "1",
      correlationId: randomUUID(),
      operation: "artifact.get",
      payload: { model, artifactId: id },
    });

    if (result === null) return undefined;
    const record = result as { payload?: Record<string, unknown> };
    return record.payload;
  }

  async findByUid(model: string, uid: string): Promise<Record<string, unknown> | undefined> {
    const result = await this.#boundaryClient.request({
      version: "1",
      correlationId: randomUUID(),
      operation: "artifact.find_by_uid",
      payload: { model, uid },
    });

    if (result === null) return undefined;
    const record = result as { payload?: Record<string, unknown> };
    return record.payload;
  }

  async findByUserCode(
    model: string,
    userCode: string,
  ): Promise<Record<string, unknown> | undefined> {
    const result = await this.#boundaryClient.request({
      version: "1",
      correlationId: randomUUID(),
      operation: "artifact.find_by_user_code",
      payload: { model, userCode },
    });

    if (result === null) return undefined;
    const record = result as { payload?: Record<string, unknown> };
    return record.payload;
  }

  async consume(model: string, id: string): Promise<void> {
    await this.#boundaryClient.request({
      version: "1",
      correlationId: randomUUID(),
      operation: "artifact.consume",
      payload: { model, artifactId: id },
    });
  }

  async destroy(model: string, id: string): Promise<void> {
    await this.#boundaryClient.request({
      version: "1",
      correlationId: randomUUID(),
      operation: "artifact.delete",
      payload: { model, artifactId: id },
    });
  }

  async revokeByGrantId(grantId: string): Promise<void> {
    await this.#boundaryClient.request({
      version: "1",
      correlationId: randomUUID(),
      operation: "artifact.revoke_by_grant_id",
      payload: { grantId },
    });
  }
}
