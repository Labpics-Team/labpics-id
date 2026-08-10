/** Port that the application depends on for authentication. */
export interface AuthPort {
  fetch(request: Request): Promise<Response>;
}
