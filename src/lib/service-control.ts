/**
 * Single source of truth for service control actions.
 *
 * Shared by the request schema, the MCP tool, the queue message contract, the
 * deploy engine, and the API client so a new action cannot be added to one of
 * them and silently missed by the others.
 */
export const SERVICE_CONTROL_ACTIONS = ['start', 'stop', 'restart', 'suspend', 'resume'] as const;

/** Actions accepted by POST /services/:id/control and the `service.control` job. */
export type ServiceControlAction = (typeof SERVICE_CONTROL_ACTIONS)[number];
