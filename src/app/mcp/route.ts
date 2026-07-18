import type { NextRequest } from 'next/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { TokenService } from '@/services/internal/token/token';
import { registerAllTools, type McpContext } from '@/lib/mcp/register';

/**
 * Hosted MCP server (Streamable HTTP, stateless). Authenticate with a
 * workspace API token from Security → API Tokens:
 *
 *   Authorization: Bearer peon_xxxxxxxx
 *
 * The token pins the workspace; the token owner's roles drive access control,
 * identical to the REST API.
 */

export const runtime = 'nodejs';
export const maxDuration = 120;

async function authenticate(request: NextRequest): Promise<McpContext | null> {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  try {
    const { user, workspaceId } = await TokenService.authenticate(header.slice(7));
    return { user, workspaceId };
  } catch {
    return null;
  }
}

function unauthorized(): Response {
  return new Response(
    JSON.stringify({
      error: 'Unauthorized',
      message: 'Provide a valid API token: Authorization: Bearer peon_…',
    }),
    { status: 401, headers: { 'Content-Type': 'application/json' } },
  );
}

export async function POST(request: NextRequest) {
  const ctx = await authenticate(request);
  if (!ctx) return unauthorized();

  const server = new McpServer({ name: 'peon', version: '0.1.0' });
  registerAllTools(server, ctx);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless: every request is self-contained
    enableJsonResponse: true,
  });
  await server.connect(transport);

  const body = await request.json();
  return transport.handleRequest(
    new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(body),
    }),
    { parsedBody: body },
  );
}

export async function GET(request: NextRequest) {
  const ctx = await authenticate(request);
  if (!ctx) return unauthorized();
  return new Response(
    JSON.stringify({
      error: 'Method not allowed',
      message: 'This MCP server is stateless. Use POST for all requests.',
    }),
    { status: 405, headers: { 'Content-Type': 'application/json' } },
  );
}

export async function DELETE() {
  return new Response(
    JSON.stringify({
      error: 'Method not allowed',
      message: 'Session management is not supported in stateless mode.',
    }),
    { status: 405, headers: { 'Content-Type': 'application/json' } },
  );
}
