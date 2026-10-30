/**
 * An error whose message is safe to show to the end user.
 * Anything that is NOT a ToolError is logged server-side and replaced
 * with a generic message, so internals never leak to the browser.
 */
export class ToolError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ToolError";
    this.status = status;
  }
}